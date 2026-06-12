#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const idbBin = process.env.IDB_BIN || `${process.env.HOME}/Library/Python/3.9/bin/idb`;
const companion = process.env.IDB_COMPANION || 'localhost:10882';
const childPin = process.env.IDB_CHILD_PIN || '5543';
const parentPin = process.env.IDB_PARENT_PIN || '1234';
const deviceAccessKey = process.env.IDB_DEVICE_ACCESS_KEY || readDeviceAccessKeyFromEnvFiles();
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

function findElement(tree, { id, labelIncludes, type }) {
  return tree.find((el) => {
    if (id && el.AXUniqueId !== id) return false;
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

function typeText(value) {
  runIdb(['ui', 'text', value]);
}

function expectScreen(tree, label) {
  const found = findElement(tree, { labelIncludes: label });
  if (!found) {
    throw new Error(`Expected screen containing "${label}"`);
  }
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

function waitForScreen(label, timeoutMs = 6000, stepMs = 300) {
  return waitForElement({ labelIncludes: label }, `screen containing "${label}"`, timeoutMs, stepMs).tree;
}

function maybeWaitForScreen(label, timeoutMs = 1500, stepMs = 250) {
  try {
    return waitForScreen(label, timeoutMs, stepMs);
  } catch {
    return null;
  }
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

function readDeviceAccessKeyFromEnvFiles() {
  const candidates = [
    path.resolve(__dirname, '../../.env.local'),
    path.resolve(__dirname, '../../.env'),
  ];

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
      // Ignore missing files; we can still run if the env var is passed explicitly.
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

  const nextTree = waitForAnyScreen(["Who’s using the app?", "Who's using the app?"], 10000);
  return nextTree;
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

function waitForLockScreen(timeoutMs = 8000) {
  return waitForAnyScreen(["Who’s using the app?", "Who's using the app?"], timeoutMs);
}

function openProfileMenu(tree) {
  tapElement(tree, { id: 'tab-profile-menu' }, 'Profile menu tab button');
  return waitForElement({ id: 'profile-menu-switch-user-button' }, 'Profile menu switch user button', 5000).tree;
}

function switchUserFromAuthenticatedScreen(tree) {
  const menuTree = openProfileMenu(tree);
  tapElement(menuTree, { id: 'profile-menu-switch-user-button' }, 'Profile menu switch user button');
  return waitForLockScreen(8000);
}

function ensureLockScreen(tree) {
  if (findElement(tree, { labelIncludes: "Who’s using the app?" }) || findElement(tree, { labelIncludes: "Who's using the app?" })) {
    return tree;
  }

  // If we are already inside the app (e.g. persisted authenticated session), navigate to lock.
  if (findElement(tree, { id: 'chores-member-switcher' })) {
    logStep('Authenticated app detected on Chores; locking to reach login screen');
    return switchUserFromAuthenticatedScreen(tree);
  }

  if (findElement(tree, { id: 'tab-profile-menu' })) {
    logStep('Authenticated app detected on a tab screen; opening profile menu to switch user');
    return switchUserFromAuthenticatedScreen(tree);
  }

  if (findElement(tree, { id: 'tab-chores' }) || findElement(tree, { labelIncludes: 'Chores, tab' })) {
    tapElement(tree, { id: 'tab-chores' }, 'Chores tab button');
    const choresTree = maybeWaitForElement({ id: 'chores-member-switcher' }, 'Chores member switcher', 4000)?.tree;
    if (choresTree) {
      return switchUserFromAuthenticatedScreen(choresTree);
    }
  }

  return tree;
}

function main() {
  logStep(`Using idb companion at ${companion}`);
  let tree = describeAll();
  tree = ensureAppForegrounded(tree);
  tree = ensureActivatedIfNeeded(tree);
  tree = ensureLockScreen(tree);

  logStep('Checking lock screen');
  if (
    !findElement(tree, { labelIncludes: "Who’s using the app?" }) &&
    !findElement(tree, { labelIncludes: "Who's using the app?" })
  ) {
    expectScreen(tree, "Who’s using the app?");
  }

  logStep('Child flow: Judah login');
  tapElement(tree, { id: 'member-card-judah' }, 'Judah member card');
  tree =
    maybeWaitForElement({ id: 'member-pin-input' }, 'Judah PIN input', 2000)?.tree ||
    (() => {
      const refreshed = describeAll();
      tapElement(refreshed, { id: 'member-card-judah' }, 'Judah member card (retry)');
      return waitForElement({ id: 'member-pin-input' }, 'Judah PIN input', 5000).tree;
    })();
  tree = waitForElement({ id: 'member-pin-input' }, 'Judah PIN input', 2000).tree;
  tapElement(tree, { id: 'member-pin-input' }, 'member PIN input');
  typeText(childPin);
  sleep(200);
  tree = describeAll();
  tapElement(tree, { id: 'member-confirm-button' }, 'Unlock button');
  tree = waitForScreen('Chores', 8000);
  requireElement(tree, { id: 'chores-member-switcher' }, 'Chores member switcher');

  logStep('Child flow: Switch User');
  sleep(400);
  tree = describeAll();
  tree = switchUserFromAuthenticatedScreen(tree);
  requireElement(tree, { id: 'member-card-judah' }, 'lock screen family member cards');

  logStep('Parent flow: David elevation');
  tapElement(tree, { id: 'member-card-david' }, 'David member card');
  tree =
    maybeWaitForElement({ id: 'member-pin-input' }, 'parent PIN input', 2000)?.tree ||
    (() => {
      const refreshed = describeAll();
      tapElement(refreshed, { id: 'member-card-david' }, 'David member card (retry)');
      return waitForElement({ id: 'member-pin-input' }, 'parent PIN input', 5000).tree;
    })();
  tree = waitForElement({ id: 'member-pin-input' }, 'parent PIN input', 2000).tree;
  tapElement(tree, { id: 'member-pin-input' }, 'parent PIN input');
  typeText(parentPin);
  sleep(200);
  tree = describeAll();
  tapElement(tree, { id: 'member-confirm-button' }, 'parent Unlock button');
  tree = waitForScreen('Chores', 8000);
  waitForElement({ id: 'chores-member-switcher' }, 'Chores member switcher', 6000);

  logStep('Parent flow: More tab -> Lock App');
  tapElement(tree, { labelIncludes: 'More, tab' }, 'More tab button');
  tree =
    maybeWaitForElement({ id: 'more-lock-app-button' }, 'More lock app button', 2000)?.tree ||
    (() => {
      const refreshed = describeAll();
      tapElement(refreshed, { labelIncludes: 'More, tab' }, 'More tab button (retry)');
      return waitForElement({ id: 'more-lock-app-button' }, 'More lock app button', 6000).tree;
    })();
  tapElement(tree, { id: 'more-lock-app-button' }, 'More lock app button');
  tree = waitForAnyScreen(["Who’s using the app?", "Who's using the app?"]);

  process.stdout.write('\nPASS: child login/switch-user and parent elevation/lock flows succeeded via idb.\n');
}

try {
  main();
} catch (error) {
  process.stderr.write(`\nFAIL: ${error.message}\n`);
  process.stderr.write(
    '\nHints: make sure Expo Go is open on the app, the backend is running on :3000, and idb_companion is running (e.g. on localhost:10882).\n'
  );
  process.exit(1);
}
