#!/usr/bin/env node

const { init, id } = require('@instantdb/admin');

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
  const dryRun = !apply;

  const db = init({
    appId: getInstantAppId(),
    adminToken: getRequiredEnv('INSTANT_APP_ADMIN_TOKEN'),
  });

  const result = await db.query({
    familyMembers: {
      allowanceEnvelopes: {},
    },
  });

  const familyMembers = result.familyMembers || [];
  const membersMissingEnvelopes = familyMembers.filter(
    (member) => !Array.isArray(member.allowanceEnvelopes) || member.allowanceEnvelopes.length === 0
  );

  console.log(`Found ${familyMembers.length} family member(s).`);
  console.log(`${membersMissingEnvelopes.length} member(s) are missing envelopes.`);

  if (membersMissingEnvelopes.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  for (const member of membersMissingEnvelopes) {
    console.log(`- ${member.name || '(unnamed)'} [${member.id}]`);
  }

  if (dryRun) {
    console.log('');
    console.log('Dry run only. No changes were made.');
    console.log('Re-run with --apply to create default "Savings" envelopes.');
    return;
  }

  let successCount = 0;
  let failureCount = 0;

  for (const member of membersMissingEnvelopes) {
    const envelopeId = id();
    const initTxId = id();
    const now = new Date().toISOString();

    const txs = [
      db.tx.allowanceEnvelopes[envelopeId].update({
        name: 'Savings',
        balances: {},
        isDefault: true,
        goalAmount: null,
        goalCurrency: null,
        familyMember: member.id,
      }),
      db.tx.familyMembers[member.id].link({ allowanceEnvelopes: envelopeId }),
      db.tx.allowanceTransactions[initTxId].update({
        amount: 0,
        currency: 'USD',
        transactionType: 'init',
        description: 'Envelope Created (Backfill)',
        createdAt: now,
        updatedAt: now,
        envelope: envelopeId,
      }),
      db.tx.allowanceEnvelopes[envelopeId].link({ transactions: initTxId }),
    ];

    try {
      await db.transact(txs);
      successCount += 1;
      console.log(`Created default Savings envelope for ${member.name || member.id}.`);
    } catch (error) {
      failureCount += 1;
      console.error(`Failed to backfill ${member.name || member.id}:`, error);
    }
  }

  console.log('');
  console.log(`Backfill complete. Success: ${successCount}, Failed: ${failureCount}.`);
  if (failureCount > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('Backfill script failed:', error);
  process.exitCode = 1;
});
