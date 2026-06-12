const MAX_EVENTS = 250;
const EVENTS_KEY = 'events';
const STORE_ID = 'family-organizer-diagnostics';

let storeFactoryOverride = null;
let fallbackStore = new Map();
const listeners = new Set();

export function __setDiagnosticsStoreFactoryForTests(factory) {
  storeFactoryOverride = factory;
}

function cloneDetails(details) {
  if (!details || typeof details !== 'object') return details ?? null;
  try {
    return JSON.parse(JSON.stringify(details));
  } catch {
    return { note: 'unserializable_details' };
  }
}

function summarizeForConsole(event) {
  if (!event.details || typeof event.details !== 'object') return '';
  return Object.entries(event.details)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ');
}

function createFallbackStore() {
  return {
    getString(key) {
      return fallbackStore.has(key) ? fallbackStore.get(key) : null;
    },
    set(key, value) {
      fallbackStore.set(key, value);
    },
    delete(key) {
      fallbackStore.delete(key);
    },
  };
}

function getStore() {
  if (storeFactoryOverride) {
    return storeFactoryOverride();
  }

  try {
    const { createMMKV } = require('react-native-mmkv');
    return createMMKV({
      id: STORE_ID,
      readOnly: false,
      mode: 'multi-process',
    });
  } catch {
    return createFallbackStore();
  }
}

function emit(events) {
  listeners.forEach((listener) => {
    try {
      listener(events);
    } catch {
      // Ignore listener failures so diagnostics never affect app behavior.
    }
  });
}

function readEventsSync() {
  try {
    const raw = getStore().getString(EVENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEventsSync(events) {
  const normalized = events.slice(-MAX_EVENTS);
  getStore().set(EVENTS_KEY, JSON.stringify(normalized));
  emit(normalized);
  return normalized;
}

export function getDiagnosticsTimeline() {
  return readEventsSync();
}

export function subscribeDiagnosticsTimeline(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearDiagnosticsTimeline() {
  try {
    getStore().delete(EVENTS_KEY);
  } catch {
    fallbackStore.delete(EVENTS_KEY);
  }
  emit([]);
}

export function recordDiagnostic(type, phase = 'event', details = null) {
  const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    type,
    phase,
    details: cloneDetails(details),
  };

  const nextEvents = writeEventsSync([...readEventsSync(), event]);

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const summary = summarizeForConsole(event);
    console.info(`[diagnostic] ${type}:${phase}${summary ? ` ${summary}` : ''}`);
  }

  return event;
}

export function formatDiagnosticDetails(details) {
  if (!details || typeof details !== 'object') return '';
  const entries = Object.entries(details);
  if (entries.length === 0) return '';
  return entries
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' · ');
}
