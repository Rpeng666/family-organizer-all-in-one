#!/usr/bin/env node
// Usage:
//   node scripts/seed-first-parent.js --name "Your Name" --pin 1234
//   node scripts/seed-first-parent.js --name "Your Name" --pin 1234 --apply

const { init, id } = require('@instantdb/admin');
const { createHash } = require('crypto');

function getArg(flag) {
    const index = process.argv.indexOf(flag);
    return index !== -1 ? process.argv[index + 1] : null;
}

function hasFlag(flag) {
    return process.argv.includes(flag);
}

function getRequiredEnv(name) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not set in .env / .env.local`);
    return value;
}

function getInstantAppId() {
    return process.env.INSTANT_APP_ID || getRequiredEnv('NEXT_PUBLIC_INSTANT_APP_ID');
}

function hashPin(pin) {
    return createHash('sha256').update(String(pin)).digest('hex');
}

async function run() {
    const name = getArg('--name');
    const pin = getArg('--pin');
    const apply = hasFlag('--apply');

    if (!name) {
        console.error('Error: --name is required. Example: --name "Alice"');
        process.exit(1);
    }

    const memberId = id();
    const record = {
        name,
        role: 'parent',
        order: 0,
        ...(pin ? { pinHash: hashPin(pin) } : {}),
    };

    console.log('\nWill create family member:');
    console.log(JSON.stringify({ id: memberId, ...record, pinHash: pin ? '<hashed>' : undefined }, null, 2));

    if (!apply) {
        console.log('\nDry run — pass --apply to actually write to the database.');
        return;
    }

    const db = init({
        appId: getInstantAppId(),
        adminToken: getRequiredEnv('INSTANT_APP_ADMIN_TOKEN'),
    });

    await db.transact([db.tx.familyMembers[memberId].update(record)]);
    console.log(`\nDone! Family member "${name}" created with id ${memberId}`);
    console.log('Refresh the app and log in with PIN:', pin ?? '(no pin set)');
}

run().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
