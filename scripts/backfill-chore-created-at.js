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

async function run() {
  const apply = hasFlag('--apply');
  const db = init({
    appId: getInstantAppId(),
    adminToken: getRequiredEnv('INSTANT_APP_ADMIN_TOKEN'),
  });

  const result = await db.query({ chores: {} });
  const chores = result.chores || [];
  const backfillCreatedAt = new Date().toISOString();

  const updates = chores
    .filter((chore) => !chore.createdAt)
    .map((chore) => ({
      id: chore.id,
      patch: {
        createdAt: backfillCreatedAt,
      },
    }));

  console.log(`Found ${chores.length} chore(s).`);
  console.log(`${updates.length} chore(s) need createdAt backfill.`);
  console.log(`Backfill value: ${backfillCreatedAt}`);

  if (!apply) {
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
    await db.transact(batch.map((entry) => db.tx.chores[entry.id].update(entry.patch)));
    successCount += batch.length;
    console.log(`Applied ${successCount}/${updates.length}`);
  }

  console.log('');
  console.log(`Backfill complete. Updated ${successCount} chore(s).`);
}

run().catch((error) => {
  console.error('Chore createdAt backfill failed:', error);
  process.exitCode = 1;
});
