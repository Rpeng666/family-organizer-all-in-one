#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { init } = require('@instantdb/admin');

function loadLocalEnv() {
  const candidates = ['.env.local', '.env'];
  for (const filename of candidates) {
    const filepath = path.join(process.cwd(), filename);
    if (!fs.existsSync(filepath)) continue;

    const contents = fs.readFileSync(filepath, 'utf8');
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const normalizedLine = line.startsWith('export ') ? line.slice(7) : line;
      const separatorIndex = normalizedLine.indexOf('=');
      if (separatorIndex === -1) continue;

      const key = normalizedLine.slice(0, separatorIndex).trim();
      if (!key || process.env[key] != null) continue;

      let value = normalizedLine.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t');
    }
  }
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function getInstantAppId() {
  return process.env.INSTANT_APP_ID || getRequiredEnv('NEXT_PUBLIC_INSTANT_APP_ID');
}

function printUsage() {
  console.log('Usage: npm run task:responses-report');
  console.log('   or: npm run task:responses-report -- --task-id <task-id>');
  console.log('   or: node scripts/print-task-responses.js [task-id]');
}

function parseArgs(argv) {
  const args = {
    help: false,
    taskId: null,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }

    if (arg === '--task-id') {
      args.taskId = argv[index + 1] || null;
      index += 1;
      continue;
    }

    if (arg.startsWith('--task-id=')) {
      args.taskId = arg.slice('--task-id='.length) || null;
      continue;
    }

    if (!args.taskId) {
      args.taskId = arg;
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  return args;
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getFirstRelation(value) {
  return toArray(value)[0] || null;
}

function getReplyTargetId(update) {
  return getFirstRelation(update?.replyTo)?.id || null;
}

function toTimestamp(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function decodeHtmlEntities(text) {
  const entities = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };

  return String(text || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalized = String(entity).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(entities, normalized)) {
      return entities[normalized];
    }

    if (normalized.startsWith('#x')) {
      const value = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    }

    if (normalized.startsWith('#')) {
      const value = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    }

    return match;
  });
}

function richTextToPlainText(html) {
  if (!html) return '';

  return decodeHtmlEntities(
    String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|blockquote|h[1-6])>/gi, '\n\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function hasMeaningfulRichText(html) {
  return richTextToPlainText(html).length > 0;
}

function hasMeaningfulResponseContent(update) {
  const responseFieldValues = toArray(update?.responseFieldValues);
  const hasNote = Boolean(String(update?.note || '').trim());
  const hasAttachments = toArray(update?.attachments).length > 0;
  if (hasNote || hasAttachments) return true;
  if (responseFieldValues.length === 0) return false;

  return responseFieldValues.some((value) => {
    const hasRichText = hasMeaningfulRichText(value?.richTextContent);
    const hasFile = Boolean(String(value?.fileUrl || '').trim());
    return hasRichText || hasFile;
  });
}

function formatTimestamp(value) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return 'Unknown';
  return new Date(timestamp).toISOString();
}

function formatResponseBody(update) {
  const lines = [];

  const note = String(update?.note || '').trim();
  if (note) {
    lines.push('Note:');
    for (const line of note.split('\n')) {
      lines.push(`  ${line}`);
    }
  }

  for (const value of toArray(update?.responseFieldValues)) {
    const label = getFirstRelation(value?.field)?.label || 'Response';
    const richText = richTextToPlainText(value?.richTextContent);
    const fileUrl = String(value?.fileUrl || '').trim();
    const fileName = String(value?.fileName || '').trim() || 'Attached file';

    if (richText) {
      if (lines.length > 0) lines.push('');
      lines.push(`${label}:`);
      for (const line of richText.split('\n')) {
        if (line.trim()) {
          lines.push(`  ${line}`);
        }
      }
    }

    if (fileUrl) {
      if (lines.length > 0) lines.push('');
      lines.push(`${label} file:`);
      lines.push(`  ${fileName}`);
      lines.push(`  ${fileUrl}`);
    }
  }

  const attachments = toArray(update?.attachments);
  if (attachments.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('Attachments:');
    attachments.forEach((attachment) => {
      const name = String(attachment?.name || '').trim() || 'Attachment';
      const url = String(attachment?.url || '').trim();
      lines.push(url ? `  - ${name}: ${url}` : `  - ${name}`);
    });
  }

  return lines;
}

function collectTaskResponses(task) {
  return toArray(task?.updates)
    .filter((update) => !update?.isDraft && !getReplyTargetId(update) && hasMeaningfulResponseContent(update))
    .sort((left, right) => toTimestamp(right?.createdAt) - toTimestamp(left?.createdAt))
    .map((response) => ({
      id: response.id,
      createdAt: response.createdAt,
      actorName: getFirstRelation(response.actor)?.name || null,
      lines: formatResponseBody(response),
    }));
}

async function run() {
  loadLocalEnv();

  const args = parseArgs(process.argv);
  if (args.help) {
    printUsage();
    return;
  }

  const db = init({
    appId: getInstantAppId(),
    adminToken: getRequiredEnv('INSTANT_APP_ADMIN_TOKEN'),
  });

  const taskQuery = {
    updates: {
      actor: {},
      attachments: {},
      replyTo: {},
      responseFieldValues: {
        field: {},
      },
    },
  };

  if (args.taskId) {
    taskQuery.$ = {
      where: {
        id: args.taskId,
      },
    };
  }

  const result = await db.query({
    tasks: taskQuery,
  });

  const tasks = toArray(result?.tasks);
  if (args.taskId && tasks.length === 0) {
    throw new Error(`Task not found: ${args.taskId}`);
  }

  const taskEntries = tasks
    .map((task) => {
      const responses = collectTaskResponses(task);
      if (responses.length === 0) return null;
      return {
        task,
        responses,
        latestResponseAt: toTimestamp(responses[0]?.createdAt),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.latestResponseAt - left.latestResponseAt);

  if (taskEntries.length === 0) {
    if (args.taskId) {
      throw new Error(`No responses found for task ${args.taskId}`);
    }
    throw new Error('No task responses were found');
  }

  const totalResponses = taskEntries.reduce((sum, entry) => sum + entry.responses.length, 0);
  const output = [
    `Found ${taskEntries.length} task${taskEntries.length === 1 ? '' : 's'} with ${totalResponses} response${totalResponses === 1 ? '' : 's'}.`,
    '',
  ];

  taskEntries.forEach((entry, index) => {
    if (index > 0) {
      output.push('='.repeat(72));
      output.push('');
    }

    output.push(`Task: ${entry.task.text || 'Untitled task'}`);
    output.push(`Task ID: ${entry.task.id}`);
    output.push('');

    entry.responses.forEach((response, responseIndex) => {
      output.push(`Response ${responseIndex + 1}:`);
      output.push(`  Created: ${formatTimestamp(response.createdAt)}`);
      if (response.actorName) {
        output.push(`  Actor: ${response.actorName}`);
      }
      if (response.id) {
        output.push(`  Update ID: ${response.id}`);
      }
      output.push('');

      if (response.lines.length === 0) {
        output.push('  (No printable response content)');
      } else {
        response.lines.forEach((line) => {
          output.push(`  ${line}`);
        });
      }

      if (responseIndex < entry.responses.length - 1) {
        output.push('');
      }
    });
  });

  console.log(output.join('\n'));
}

run().catch((error) => {
  console.error('Task response lookup failed:', error.message || error);
  process.exitCode = 1;
});
