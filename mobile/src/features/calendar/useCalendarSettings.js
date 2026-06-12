import { useState, useCallback, useMemo } from 'react';

let storage = null;
try {
  const { MMKV } = require('react-native-mmkv');
  storage = new MMKV({ id: 'calendar-settings' });
} catch {
  // Fallback to in-memory when MMKV native module is unavailable.
}

const memStore = {};
const safeStorage = {
  getString: (key) => storage ? storage.getString(key) : memStore[key],
  getNumber: (key) => storage ? storage.getNumber(key) : memStore[key],
  getBoolean: (key) => storage ? storage.getBoolean(key) : memStore[key],
  set: (key, value) => { if (storage) storage.set(key, value); else memStore[key] = value; },
};

const KEYS = {
  viewMode: 'cal.viewMode',
  visibleDayCount: 'cal.dayCount',
  dayRowCount: 'cal.dayRowCount',
  dayHourHeight: 'cal.dayHourHeight',
  showGregorian: 'cal.showGregorian',
  showBs: 'cal.showBs',
  excludedMemberIds: 'cal.excludedMembers',
  excludedTagIds: 'cal.excludedTags',
  agendaFontScale: 'cal.agendaFontScale',
};

const DEFAULTS = {
  viewMode: 'month',
  visibleDayCount: 1,
  dayRowCount: 1,
  dayHourHeight: 44,
  showGregorian: true,
  showBs: true,
  agendaFontScale: 1,
};

function readString(key, fallback) {
  const val = safeStorage.getString(key);
  return val !== undefined ? val : fallback;
}

function readNumber(key, fallback) {
  const val = safeStorage.getNumber(key);
  return val !== undefined ? val : fallback;
}

function readBool(key, fallback) {
  const val = safeStorage.getBoolean(key);
  return val !== undefined ? val : fallback;
}

function readJsonArray(key) {
  try {
    const raw = safeStorage.getString(key);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Hook that provides calendar settings backed by MMKV for instant persistence.
 * Reads synchronously on mount — no async flash of default state.
 */
export function useCalendarSettings() {
  const [viewMode, setViewModeState] = useState(() => readString(KEYS.viewMode, DEFAULTS.viewMode));
  const [visibleDayCount, setVisibleDayCountState] = useState(() => readNumber(KEYS.visibleDayCount, DEFAULTS.visibleDayCount));
  const [dayRowCount, setDayRowCountState] = useState(() => readNumber(KEYS.dayRowCount, DEFAULTS.dayRowCount));
  const [dayHourHeight, setDayHourHeightState] = useState(() => readNumber(KEYS.dayHourHeight, DEFAULTS.dayHourHeight));
  const [showGregorian, setShowGregorianState] = useState(() => readBool(KEYS.showGregorian, DEFAULTS.showGregorian));
  const [showBs, setShowBsState] = useState(() => readBool(KEYS.showBs, DEFAULTS.showBs));
  const [excludedMemberIds, setExcludedMemberIdsState] = useState(() => readJsonArray(KEYS.excludedMemberIds));
  const [excludedTagIds, setExcludedTagIdsState] = useState(() => readJsonArray(KEYS.excludedTagIds));
  const [agendaFontScale, setAgendaFontScaleState] = useState(() => readNumber(KEYS.agendaFontScale, DEFAULTS.agendaFontScale));

  const setViewMode = useCallback((value) => {
    setViewModeState(value);
    safeStorage.set(KEYS.viewMode, value);
  }, []);

  const setVisibleDayCount = useCallback((value) => {
    const clamped = Math.max(1, Math.min(14, value));
    setVisibleDayCountState(clamped);
    safeStorage.set(KEYS.visibleDayCount, clamped);
  }, []);

  const setDayRowCount = useCallback((value) => {
    const clamped = Math.max(1, Math.min(2, value));
    setDayRowCountState(clamped);
    safeStorage.set(KEYS.dayRowCount, clamped);
  }, []);

  const setDayHourHeight = useCallback((value) => {
    const clamped = Math.max(32, Math.min(112, value));
    setDayHourHeightState(clamped);
    safeStorage.set(KEYS.dayHourHeight, clamped);
  }, []);

  const setShowGregorian = useCallback((value) => {
    setShowGregorianState(value);
    safeStorage.set(KEYS.showGregorian, value);
  }, []);

  const setShowBs = useCallback((value) => {
    setShowBsState(value);
    safeStorage.set(KEYS.showBs, value);
  }, []);

  const setExcludedMemberIds = useCallback((value) => {
    setExcludedMemberIdsState(value);
    safeStorage.set(KEYS.excludedMemberIds, JSON.stringify(value));
  }, []);

  const setExcludedTagIds = useCallback((value) => {
    setExcludedTagIdsState(value);
    safeStorage.set(KEYS.excludedTagIds, JSON.stringify(value));
  }, []);

  const setAgendaFontScale = useCallback((value) => {
    const clamped = Math.max(0.82, Math.min(1.35, value));
    setAgendaFontScaleState(clamped);
    safeStorage.set(KEYS.agendaFontScale, clamped);
  }, []);

  return {
    viewMode,
    setViewMode,
    visibleDayCount,
    setVisibleDayCount,
    dayRowCount,
    setDayRowCount,
    dayHourHeight,
    setDayHourHeight,
    showGregorian,
    setShowGregorian,
    showBs,
    setShowBs,
    excludedMemberIds,
    setExcludedMemberIds,
    excludedTagIds,
    setExcludedTagIds,
    agendaFontScale,
    setAgendaFontScale,
  };
}
