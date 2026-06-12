#!/usr/bin/env node

const { init } = require('@instantdb/admin');

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

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

function normalizeRrule(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  return trimmed.toUpperCase().startsWith('RRULE:') ? trimmed : `RRULE:${trimmed}`;
}

function buildRecurrenceLines(rrule, rdates, exdates) {
  const lines = [];
  if (rrule) lines.push(rrule);
  if (rdates.length > 0) lines.push(`RDATE:${rdates.join(',')}`);
  if (exdates.length > 0) lines.push(`EXDATE:${exdates.join(',')}`);
  return lines;
}

function buildPatch(event, nowIso) {
  const patch = {};
  const normalizedRrule = normalizeRrule(event.rrule);
  const rdates = toStringArray(event.rdates);
  const exdates = toStringArray(event.exdates);
  const recurrenceLines = buildRecurrenceLines(normalizedRrule, rdates, exdates);

  if (!event.uid) patch.uid = event.id;
  if (!event.status) patch.status = 'confirmed';
  if (!event.createdAt) patch.createdAt = nowIso;
  if (!event.updatedAt) patch.updatedAt = nowIso;
  if (!event.dtStamp) patch.dtStamp = nowIso;
  if (!event.lastModified) patch.lastModified = nowIso;
  if (typeof event.sequence !== 'number') patch.sequence = 0;
  if (!event.timeZone) patch.timeZone = 'UTC';
  if (!event.eventType) patch.eventType = 'default';
  if (!event.visibility) patch.visibility = 'default';
  if (!event.transparency) patch.transparency = event.isAllDay ? 'transparent' : 'opaque';
  if (event.rrule !== normalizedRrule) patch.rrule = normalizedRrule;
  if (!Array.isArray(event.rdates)) patch.rdates = rdates;
  if (!Array.isArray(event.exdates)) patch.exdates = exdates;
  if (!Array.isArray(event.recurrenceLines) && recurrenceLines.length > 0) patch.recurrenceLines = recurrenceLines;
  if (!Array.isArray(event.alarms)) patch.alarms = [];

  return patch;
}

async function run() {
  const apply = hasFlag('--apply');
  const dryRun = !apply;

  const db = init({
    appId: getInstantAppId(),
    adminToken: getRequiredEnv('INSTANT_APP_ADMIN_TOKEN'),
  });

  const result = await db.query({ calendarItems: {} });
  const events = result.calendarItems || [];
  const nowIso = new Date().toISOString();

  const updates = events
    .map((event) => ({ id: event.id, patch: buildPatch(event, nowIso) }))
    .filter((entry) => Object.keys(entry.patch).length > 0);

  console.log(`Found ${events.length} calendar event(s).`);
  console.log(`${updates.length} event(s) need metadata backfill.`);

  if (updates.length > 0) {
    const preview = updates.slice(0, 5);
    console.log('');
    console.log('Preview (first 5):');
    for (const entry of preview) {
      console.log(`- ${entry.id}: ${Object.keys(entry.patch).join(', ')}`);
    }
  }

  if (dryRun) {
    console.log('');
    console.log('Dry run only. No changes were made.');
    console.log('Re-run with --apply to persist updates.');
    return;
  }

  if (updates.length === 0) {
    console.log('Nothing to update.');
    return;
  }

  const BATCH_SIZE = 100;
  let successCount = 0;

  for (let index = 0; index < updates.length; index += BATCH_SIZE) {
    const batch = updates.slice(index, index + BATCH_SIZE);
    const txs = batch.map((entry) => db.tx.calendarItems[entry.id].update(entry.patch));
    await db.transact(txs);
    successCount += batch.length;
    console.log(`Applied ${successCount}/${updates.length}`);
  }

  console.log('');
  console.log(`Backfill complete. Updated ${successCount} event(s).`);
}

run().catch((error) => {
  console.error('Calendar event backfill failed:', error);
  process.exitCode = 1;
});
