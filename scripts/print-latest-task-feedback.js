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
  console.log('Usage: npm run task:feedback-report');
  console.log('   or: npm run task:feedback-report -- --task-id <task-id>');
  console.log('   or: node scripts/print-latest-task-feedback.js [task-id]');
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

function sortByCreatedAtDesc(left, right) {
  return toTimestamp(right?.createdAt) - toTimestamp(left?.createdAt);
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

function hasMeaningfulFeedbackContent(update) {
  const hasNote = Boolean(String(update?.note || '').trim());
  const hasGrade = update?.gradeDisplayValue != null || update?.gradeNumericValue != null;
  const hasAttachments = toArray(update?.attachments).length > 0;
  return hasNote || hasGrade || hasAttachments;
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

function formatTimestamp(value) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return 'Unknown';
  return new Date(timestamp).toISOString();
}

function pushSection(lines, title, contentLines) {
  if (!contentLines || contentLines.length === 0) return;
  lines.push(`${title}:`);
  for (const line of contentLines) {
    lines.push(`  ${line}`);
  }
  lines.push('');
}

function formatResponseFieldValues(update) {
  const lines = [];

  for (const value of toArray(update?.responseFieldValues)) {
    const label = getFirstRelation(value?.field)?.label || 'Response';
    const richText = richTextToPlainText(value?.richTextContent);
    const fileUrl = String(value?.fileUrl || '').trim();
    const fileLabel = String(value?.fileName || '').trim() || 'Attached file';

    if (richText) {
      lines.push(`- ${label}`);
      for (const paragraphLine of richText.split('\n')) {
        if (paragraphLine.trim()) {
          lines.push(`  ${paragraphLine}`);
        }
      }
    }

    if (fileUrl) {
      lines.push(`- ${label} file: ${fileLabel}`);
      lines.push(`  ${fileUrl}`);
    }
  }

  return lines;
}

function formatAttachments(update) {
  return toArray(update?.attachments).map((attachment) => {
    const name = String(attachment?.name || '').trim() || 'Attachment';
    const url = String(attachment?.url || '').trim();
    return url ? `- ${name}: ${url}` : `- ${name}`;
  });
}

function formatGrade(update) {
  const displayValue =
    update?.gradeDisplayValue != null && String(update.gradeDisplayValue).trim()
      ? String(update.gradeDisplayValue).trim()
      : update?.gradeNumericValue != null
      ? String(update.gradeNumericValue)
      : '';
  if (!displayValue) return null;

  const gradeType = getFirstRelation(update?.gradeType)?.name || null;
  return gradeType ? `${displayValue} (${gradeType})` : displayValue;
}

function formatUpdateBlock(title, update) {
  const actor = getFirstRelation(update?.actor);
  const affectedPerson = getFirstRelation(update?.affectedPerson);
  const lines = [title, ''];

  const metadataLines = [
    `ID: ${update?.id || 'Unknown'}`,
    `Created: ${formatTimestamp(update?.createdAt)}`,
  ];

  if (actor?.name) metadataLines.push(`Actor: ${actor.name}`);
  if (affectedPerson?.name) metadataLines.push(`Affected person: ${affectedPerson.name}`);
  if (update?.fromState || update?.toState) {
    metadataLines.push(`State: ${update?.fromState || 'unknown'} -> ${update?.toState || 'unknown'}`);
  }
  if (update?.scheduledForDate) metadataLines.push(`Scheduled date: ${update.scheduledForDate}`);

  pushSection(lines, 'Meta', metadataLines);

  const note = String(update?.note || '').trim();
  if (note) {
    pushSection(lines, 'Note', note.split('\n'));
  }

  const responseFieldLines = formatResponseFieldValues(update);
  if (responseFieldLines.length > 0) {
    pushSection(lines, 'Response Fields', responseFieldLines);
  }

  const grade = formatGrade(update);
  if (grade) {
    pushSection(lines, 'Grade', [grade]);
  }

  const attachmentLines = formatAttachments(update);
  if (attachmentLines.length > 0) {
    pushSection(lines, 'Attachments', attachmentLines);
  }

  while (lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n');
}

function findFeedbackThreads(task) {
  const nonDraftUpdates = toArray(task?.updates).filter((update) => !update?.isDraft);
  const repliesByParentId = new Map();

  for (const update of nonDraftUpdates) {
    const replyTargetId = getReplyTargetId(update);
    if (!replyTargetId || !hasMeaningfulFeedbackContent(update)) continue;

    const existingReplies = repliesByParentId.get(replyTargetId) || [];
    existingReplies.push(update);
    repliesByParentId.set(replyTargetId, existingReplies);
  }

  return nonDraftUpdates
    .filter((update) => !getReplyTargetId(update) && hasMeaningfulResponseContent(update))
    .map((response) => {
      const feedbackReplies = (repliesByParentId.get(response.id) || [])
        .slice()
        .sort((left, right) => toTimestamp(left?.createdAt) - toTimestamp(right?.createdAt));

      if (feedbackReplies.length === 0) return null;

      return {
        task,
        response,
        feedbackReplies,
        latestFeedbackAt: toTimestamp(feedbackReplies[feedbackReplies.length - 1]?.createdAt),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.latestFeedbackAt - left.latestFeedbackAt);
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
      affectedPerson: {},
      attachments: {},
      gradeType: {},
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

  const threads = tasks
    .flatMap((task) => findFeedbackThreads(task))
    .sort((left, right) => right.latestFeedbackAt - left.latestFeedbackAt);

  if (threads.length === 0) {
    if (args.taskId) {
      throw new Error(`No responses with feedback found for task ${args.taskId}`);
    }
    throw new Error('No task responses with feedback were found');
  }

  const output = [`Found ${threads.length} response${threads.length === 1 ? '' : 's'} with feedback.`, ''];

  threads.forEach((thread, index) => {
    if (index > 0) {
      output.push('='.repeat(72));
      output.push('');
    }

    output.push(`Task: ${thread.task.text || 'Untitled task'}`);
    output.push(`Task ID: ${thread.task.id}`);
    output.push('');
    output.push(formatUpdateBlock('Response', thread.response));

    thread.feedbackReplies.forEach((feedbackReply, replyIndex) => {
      output.push('');
      output.push(formatUpdateBlock(`Feedback ${replyIndex + 1}`, feedbackReply));
    });
  });

  console.log(output.join('\n'));
}

run().catch((error) => {
  console.error('Latest task feedback lookup failed:', error.message || error);
  process.exitCode = 1;
});
