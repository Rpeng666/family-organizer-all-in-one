#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const idbBin = process.env.IDB_BIN || `${process.env.HOME}/Library/Python/3.9/bin/idb`;
const companion = process.env.IDB_COMPANION || 'localhost:10882';
const parentPin = process.env.IDB_PARENT_PIN || '1234';
const parentMemberName = process.env.IDB_PARENT_MEMBER || 'Mandy';
const financeMemberName = process.env.IDB_FINANCE_MEMBER || parentMemberName;
const deviceAccessKey = process.env.IDB_DEVICE_ACCESS_KEY || readDeviceAccessKeyFromEnvFiles();
const screenshotDir = process.env.IDB_SCREENSHOT_DIR || '/tmp';
const preferredAppBundleId = process.env.IDB_APP_BUNDLE_ID || 'com.familyorganizer.app';
const expoGoBundleId = 'host.exp.Exponent';

function sleep(ms) {
  const sab = new SharedArrayBuffer(4);
  const int32 = new Int32Array(sab);
  Atomics.wait(int32, 0, 0, ms);
}

function runIdb(args) {
  try {
    return execFileSync(idbBin, ['--companion', companion, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr = error?.stderr?.toString?.() || '';
    const stdout = error?.stdout?.toString?.() || '';
    throw new Error(`idb ${args.join(' ')} failed\n${stderr || stdout || error.message}`);
  }
}

function launchApp(bundleId) {
  try {
    runIdb(['launch', bundleId]);
    return true;
  } catch {
    return false;
  }
}

function describeAll() {
  const output = runIdb(['ui', 'describe-all']);
  return JSON.parse(output);
}

function centerOf(frame) {
  return {
    x: Math.round(frame.x + frame.width / 2),
    y: Math.round(frame.y + frame.height / 2),
  };
}

function matchesText(value, expected) {
  return typeof value === 'string' && value.toLowerCase().includes(expected.toLowerCase());
}

function findElement(tree, { id, idStartsWith, labelIncludes, type }) {
  return tree.find((el) => {
    if (id && el.AXUniqueId !== id) return false;
    if (idStartsWith && !(typeof el.AXUniqueId === 'string' && el.AXUniqueId.startsWith(idStartsWith))) return false;
    if (labelIncludes && !matchesText(el.AXLabel, labelIncludes)) return false;
    if (type && el.type !== type) return false;
    return true;
  });
}

function requireElement(tree, query, description) {
  const el = findElement(tree, query);
  if (!el) {
    throw new Error(`Could not find ${description}`);
  }
  return el;
}

function tapElement(tree, query, description) {
  const el = requireElement(tree, query, description);
  const { x, y } = centerOf(el.frame);
  runIdb(['ui', 'tap', String(x), String(y)]);
  return el;
}

function tapElementWhenVisible(query, description, maxAttempts = 6) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const tree = describeAll();
    const el = findElement(tree, query);
    if (!el) {
      sleep(250);
      continue;
    }

    const bottom = el.frame.y + el.frame.height;
    if (bottom <= 850 && el.frame.y >= 0) {
      tapElement(tree, query, description);
      return;
    }

    // If the target is below the viewport, nudge content upward.
    if (bottom > 850) {
      runIdb(['ui', 'swipe', '--duration', '0.25', '200', '760', '200', '420']);
      sleep(220);
      continue;
    }

    // If the target is above the viewport, nudge content downward.
    runIdb(['ui', 'swipe', '--duration', '0.25', '200', '360', '200', '760']);
    sleep(220);
  }

  throw new Error(`Could not bring ${description} into view`);
}

function typeText(value) {
  runIdb(['ui', 'text', value]);
}

function waitForElement(query, description, timeoutMs = 6000, stepMs = 300) {
  const startedAt = Date.now();
  let lastTree = [];
  while (Date.now() - startedAt < timeoutMs) {
    lastTree = describeAll();
    const found = findElement(lastTree, query);
    if (found) {
      return { element: found, tree: lastTree };
    }
    sleep(stepMs);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function waitForAnyScreen(labels, timeoutMs = 6000, stepMs = 300) {
  const startedAt = Date.now();
  let lastTree = [];
  while (Date.now() - startedAt < timeoutMs) {
    lastTree = describeAll();
    for (const label of labels) {
      if (findElement(lastTree, { labelIncludes: label })) {
        return lastTree;
      }
    }
    sleep(stepMs);
  }
  throw new Error(`Timed out waiting for screen containing one of: ${labels.join(', ')}`);
}

function maybeWaitForElement(query, description, timeoutMs = 1500, stepMs = 250) {
  try {
    return waitForElement(query, description, timeoutMs, stepMs);
  } catch {
    return null;
  }
}

function logStep(message) {
  process.stdout.write(`• ${message}\n`);
}

function memberSlug(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readDeviceAccessKeyFromEnvFiles() {
  const candidates = [path.resolve(__dirname, '../../.env.local'), path.resolve(__dirname, '../../.env')];

  for (const filePath of candidates) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^DEVICE_ACCESS_KEY\s*=\s*(.*)$/);
        if (!match) continue;
        const raw = match[1].trim();
        const unquoted =
          (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
            ? raw.slice(1, -1)
            : raw;
        if (unquoted) return unquoted;
      }
    } catch {
      // ignore
    }
  }

  return '';
}

function isAppHomeScreen(tree) {
  return Boolean(findElement(tree, { labelIncludes: 'Expo Go' }) || findElement(tree, { labelIncludes: 'Family Organizer' }));
}

function isExpoGoHomeScreen(tree) {
  return Boolean(findElement(tree, { labelIncludes: 'Expo Go' }) && findElement(tree, { labelIncludes: 'Recently opened' }));
}

function ensureAppForegrounded(tree) {
  if (!isAppHomeScreen(tree) && !isExpoGoHomeScreen(tree)) return tree;

  logStep(`Launching preferred app bundle ${preferredAppBundleId}`);
  if (launchApp(preferredAppBundleId)) {
    sleep(1800);
    return describeAll();
  }

  if (isExpoGoHomeScreen(tree)) {
    logStep('Opening recent project from Expo Go home');
    tapElement(tree, { labelIncludes: 'Family Organizer' }, 'Family Organizer recent project');
    sleep(1800);
    return describeAll();
  }

  logStep('Opening app from simulator home screen');
  if (findElement(tree, { labelIncludes: 'Family Organizer' })) {
    tapElement(tree, { labelIncludes: 'Family Organizer' }, 'Family Organizer app icon');
  } else if (findElement(tree, { labelIncludes: 'Expo Go' })) {
    if (launchApp(expoGoBundleId)) {
      sleep(1800);
      return describeAll();
    }
    tapElement(tree, { labelIncludes: 'Expo Go' }, 'Expo Go app icon');
  }
  sleep(1800);
  return describeAll();
}

function ensureActivatedIfNeeded(tree) {
  if (!findElement(tree, { labelIncludes: 'Activate this iPhone' })) {
    return tree;
  }

  if (!deviceAccessKey) {
    throw new Error(
      'App is on activation screen but no DEVICE_ACCESS_KEY was found. Set IDB_DEVICE_ACCESS_KEY or add DEVICE_ACCESS_KEY to .env.local.'
    );
  }

  logStep('Activation screen detected; activating device');
  tapElement(tree, { id: 'activation-key-input' }, 'activation key input');
  typeText(deviceAccessKey);
  sleep(200);
  tree = describeAll();
  tapElement(tree, { id: 'activate-device-button' }, 'Activate device button');

  return waitForAnyScreen(["Who’s using the app?", "Who's using the app?"], 10000);
}

function ensureLockScreen(tree) {
  if (findElement(tree, { labelIncludes: "Who’s using the app?" }) || findElement(tree, { labelIncludes: "Who's using the app?" })) {
    return tree;
  }

  if (findElement(tree, { id: 'chores-member-switcher' })) {
    logStep('Authenticated app detected on Chores; locking to reach login screen');
    tapElement(tree, { id: 'tab-profile-menu' }, 'Profile menu tab button');
    const profileMenuTree = waitForElement({ id: 'profile-menu-switch-user-button' }, 'Profile menu switch user button', 5000).tree;
    tapElement(profileMenuTree, { id: 'profile-menu-switch-user-button' }, 'Profile menu switch user button');
    return waitForAnyScreen(["Who’s using the app?", "Who's using the app?"], 8000);
  }

  if (findElement(tree, { id: 'tab-profile-menu' })) {
    logStep('Authenticated app detected; opening profile menu to switch user');
    tapElement(tree, { id: 'tab-profile-menu' }, 'Profile menu tab button');
    const profileMenuTree = waitForElement({ id: 'profile-menu-switch-user-button' }, 'Profile menu switch user button', 5000).tree;
    tapElement(profileMenuTree, { id: 'profile-menu-switch-user-button' }, 'Profile menu switch user button');
    return waitForAnyScreen(["Who’s using the app?", "Who's using the app?"], 8000);
  }

  return tree;
}

function takeScreenshot(name) {
  const filePath = path.join(screenshotDir, name);
  runIdb(['screenshot', filePath]);
  return filePath;
}

function waitForFinanceScreen(timeoutMs = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const tree = describeAll();
    if (findElement(tree, { labelIncludes: 'Finance' }) && findElement(tree, { id: 'finance-open-add-envelope' })) {
      return tree;
    }
    sleep(250);
  }
  throw new Error('Timed out waiting for Finance screen controls');
}

function ensureFinanceMemberSelected(tree, memberName) {
  const needsSelection =
    findElement(tree, { labelIncludes: 'Select a family member above' }) ||
    findElement(tree, { labelIncludes: 'Choose a member' }) ||
    findElement(tree, { labelIncludes: 'so the finance action knows whose envelopes to update' });

  if (!needsSelection) {
    return tree;
  }

  tapElement(tree, { labelIncludes: `Show finance for ${memberName}` }, `${memberName} finance filter`);
  sleep(400);
  return describeAll();
}

function ensureEnvelopeExists(tree) {
  const needsFirstEnvelope =
    findElement(tree, { labelIncludes: 'Create an initial envelope first' }) ||
    findElement(tree, { labelIncludes: 'No envelopes yet for the selected member' });

  if (!needsFirstEnvelope) {
    logStep('Envelope already exists; skipping envelope creation');
    return tree;
  }

  logStep('Creating first envelope');
  tapElement(tree, { id: 'finance-open-add-envelope' }, 'Add Envelope action button');
  tree = waitForElement({ id: 'finance-submit-action' }, 'Finance modal submit button', 5000).tree;
  takeScreenshot('finance-add-envelope-modal.png');
  tapElementWhenVisible({ id: 'finance-submit-action' }, 'Create Envelope submit button');

  tree = waitForElement({ id: 'finance-open-deposit' }, 'Finance action buttons after envelope create', 8000).tree;
  sleep(700);
  return describeAll();
}

function runDeposit(tree) {
  logStep('Creating deposit transaction');
  tapElement(tree, { id: 'finance-open-deposit' }, 'Deposit action button');
  tree = waitForElement({ id: 'finance-money-amount-input' }, 'Deposit amount input', 5000).tree;

  tapElement(tree, { id: 'finance-money-amount-input' }, 'Deposit amount input');
  typeText('12.50');
  sleep(200);

  const sourceEnvelopeChip = findElement(describeAll(), { idStartsWith: 'finance-source-envelope-' });
  if (sourceEnvelopeChip) {
    const center = centerOf(sourceEnvelopeChip.frame);
    runIdb(['ui', 'tap', String(center.x), String(center.y)]);
    sleep(150);
  }

  tree = describeAll();
  takeScreenshot('finance-deposit-modal.png');
  tapElementWhenVisible({ id: 'finance-submit-action' }, 'Deposit submit button');

  tree = waitForElement({ id: 'finance-open-deposit' }, 'Finance screen after deposit', 8000).tree;
  takeScreenshot('finance-after-deposit.png');

  const refreshed = describeAll();
  const hasDeposit = findElement(refreshed, { labelIncludes: 'Deposit' }) || findElement(refreshed, { labelIncludes: '+$' });
  if (!hasDeposit) {
    throw new Error('Deposit transaction did not appear in visible finance transaction list.');
  }

  return refreshed;
}

function unlockParent(tree, memberName) {
  const memberCardId = `member-card-${memberSlug(memberName)}`;
  const onPickerScreen =
    findElement(tree, { labelIncludes: "Who’s using the app?" }) || findElement(tree, { labelIncludes: "Who's using the app?" });

  if (onPickerScreen) {
    tapElement(tree, { id: memberCardId }, `${memberName} member card`);
    tree = waitForElement({ id: 'member-confirm-button' }, 'parent unlock button', 5000).tree;
  } else if (!findElement(tree, { id: 'member-confirm-button' })) {
    throw new Error('Lock screen did not show member picker or unlock panel.');
  }

  const pinInputResult = maybeWaitForElement({ id: 'member-pin-input' }, 'parent PIN input', 1200);
  if (pinInputResult) {
    tree = pinInputResult.tree;
    tapElement(tree, { id: 'member-pin-input' }, 'parent PIN input');
    typeText(parentPin);
    sleep(200);
    tree = describeAll();
  } else {
    tree = describeAll();
  }

  takeScreenshot('finance-parent-unlock.png');
  tapElement(tree, { id: 'member-confirm-button' }, 'parent unlock button');
}

function main() {
  logStep(`Using idb companion at ${companion}`);
  logStep(`Parent unlock member: ${parentMemberName}; finance scope member: ${financeMemberName}`);

  let tree = describeAll();
  tree = ensureAppForegrounded(tree);
  tree = ensureActivatedIfNeeded(tree);
  tree = ensureLockScreen(tree);

  logStep(`Parent flow: ${parentMemberName} elevation`);
  unlockParent(tree, parentMemberName);

  tree = waitForElement({ id: 'tab-finance' }, 'Finance tab button', 8000).tree;
  tapElement(tree, { id: 'tab-finance' }, 'Finance tab button');
  tree = waitForFinanceScreen(10000);
  takeScreenshot('finance-screen-initial.png');

  tree = ensureFinanceMemberSelected(tree, financeMemberName);
  takeScreenshot('finance-after-member-select.png');
  tree = ensureEnvelopeExists(tree);
  tree = runDeposit(tree);

  process.stdout.write(`\nPASS: finance actions succeeded. Screenshots saved in ${screenshotDir}\n`);
}

try {
  main();
} catch (error) {
  try {
    const failurePath = path.join(screenshotDir, 'finance-smoke-failure.png');
    runIdb(['screenshot', failurePath]);
    process.stderr.write(`\nSaved failure screenshot to ${failurePath}\n`);
  } catch {
    // ignore screenshot failures in error path
  }
  process.stderr.write(`\nFAIL: ${error.message}\n`);
  process.stderr.write(
    '\nHints: make sure Expo Go is open on the app, backend is running on :3000, and idb_companion is running at localhost:10882.\n'
  );
  process.exit(1);
}
