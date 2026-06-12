import { localDateToUTC } from './date';
import type { SharedChoreLike } from './chores';

export type SharedTimeBucket = string;
export type SharedTimingMode =
  | 'anytime'
  | 'named_window'
  | 'before_time'
  | 'after_time'
  | 'between_times'
  | 'before_marker'
  | 'after_marker'
  | 'before_chore'
  | 'after_chore';

export type SharedRoutineMarkerKey = string;

export interface SharedRoutineMarkerPreset {
  key: string;
  label: string;
  defaultTime: string;
  defaultStartedTime?: string;
  defaultCompletedTime?: string;
  /** Per-marker override for the after-anchor delay in seconds (used by countdown engine). */
  afterDelaySecs?: number;
}

export interface SharedRoutineMarkerStatusLike {
  id?: string | null;
  key?: string | null;
  markerKey: string;
  date: string | Date;
  startedAt?: string | null;
  completedAt?: string | null;
  startedById?: string | null;
  completedById?: string | null;
}

export interface SharedTimeBucketDefinition {
  key: SharedTimeBucket;
  label: string;
  startMinute: number;
  endMinute: number;
  order: number;
}

export interface SharedChoreTimingAnchorConfig {
  sourceType: 'routine' | 'chore';
  relation?: 'before' | 'after';
  routineKey?: SharedRoutineMarkerKey | null;
  sourceChoreId?: string | null;
  fallbackTime?: string | null;
  fallbackStartTime?: string | null;
  fallbackEndTime?: string | null;
  event?: 'started' | 'completed';
}

export interface SharedChoreTimingConfig {
  mode?: string | null;
  timeBucket?: SharedTimeBucket | null;
  namedWindowKey?: string | null;
  time?: string | null;
  window?: {
    startTime?: string | null;
    endTime?: string | null;
  } | null;
  anchor?: SharedChoreTimingAnchorConfig | null;
}

export interface ResolvedSharedChoreTiming {
  mode: SharedTimingMode;
  ruleKey: string;
  label: string;
  summary: string;
  sectionKey: 'late' | 'now' | 'upcoming';
  sectionLabel: 'Late' | 'Now' | 'Upcoming';
  sectionOrder: number;
  status: 'late' | 'now' | 'upcoming';
  isActiveNow: boolean;
  startOffset: number | null;
  endOffset: number | null;
  anchorMinute: number | null;
}

export interface SharedChoreTimingContext<TChore extends SharedChoreLike = SharedChoreLike> {
  date: Date;
  now?: Date;
  routineMarkerStatuses?: SharedRoutineMarkerStatusLike[] | null;
  chores?: TChore[] | null;
  scheduleSettings?: SharedScheduleSettings | null;
}

export interface SharedChoreTimingSection<TChore extends SharedChoreLike = SharedChoreLike> {
  key: string;
  label: string;
  order: number;
  items: Array<{ chore: TChore; timing: ResolvedSharedChoreTiming }>;
  isActiveNow: boolean;
}

export interface SharedScheduleSettings {
  dayBoundaryTime: string;
  timeBuckets: SharedTimeBucketDefinition[];
  routineMarkers: SharedRoutineMarkerPreset[];
}

export const HOUSEHOLD_SCHEDULE_SETTINGS_NAME = 'householdSchedulingSettings';
export const DEFAULT_DAY_BOUNDARY_TIME = '03:00';

export const DEFAULT_SHARED_TIME_BUCKETS: SharedTimeBucketDefinition[] = [
  { key: 'middle_of_night', label: 'Middle of the night', startMinute: 0, endMinute: 240, order: 0 },
  { key: 'early_morning', label: 'Early morning', startMinute: 240, endMinute: 420, order: 1 },
  { key: 'morning', label: 'Morning', startMinute: 420, endMinute: 660, order: 2 },
  { key: 'mid_day', label: 'Mid-day', startMinute: 660, endMinute: 840, order: 3 },
  { key: 'afternoon', label: 'Afternoon', startMinute: 840, endMinute: 1020, order: 4 },
  { key: 'evening', label: 'Evening', startMinute: 1020, endMinute: 1260, order: 5 },
  { key: 'night', label: 'Night', startMinute: 1260, endMinute: 1440, order: 6 },
];

export const DEFAULT_SHARED_ROUTINE_MARKER_PRESETS: SharedRoutineMarkerPreset[] = [
  { key: 'breakfast', label: 'Breakfast', defaultTime: '08:00', defaultStartedTime: '08:00', defaultCompletedTime: '08:30' },
  { key: 'lunch', label: 'Lunch', defaultTime: '12:30', defaultStartedTime: '12:30', defaultCompletedTime: '13:00' },
  { key: 'dinner', label: 'Dinner', defaultTime: '18:30', defaultStartedTime: '18:30', defaultCompletedTime: '19:00' },
  { key: 'bedtime', label: 'Bedtime', defaultTime: '20:30', defaultStartedTime: '20:30', defaultCompletedTime: '21:00' },
];

export const SHARED_TIME_BUCKETS = DEFAULT_SHARED_TIME_BUCKETS;
export const SHARED_ROUTINE_MARKER_PRESETS = DEFAULT_SHARED_ROUTINE_MARKER_PRESETS;

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return String(value || '').trim();
}

function formatDateKeyLocal(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function parseDateKey(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const raw = stringValue(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function slugifyKey(value: string): string {
  return stringValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

export function parseTimeOfDayToMinutes(value?: string | null): number | null {
  const raw = stringValue(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatMinuteOfDay(minute?: number | null): string {
  if (!Number.isFinite(minute)) return '';
  const value = Math.max(0, Math.min(1439, Math.trunc(Number(minute))));
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function formatMinuteRange(startMinute: number, endMinute: number): string {
  const startHours = Math.floor(startMinute / 60);
  const endHours = Math.floor(endMinute / 60);
  const startSuffix = startHours >= 12 ? 'PM' : 'AM';
  const endSuffix = endHours >= 12 ? 'PM' : 'AM';
  if (startSuffix === endSuffix) {
    const endText = formatMinuteOfDay(endMinute);
    const startValue = Math.max(0, Math.min(1439, Math.trunc(Number(startMinute))));
    const startHour12 = Math.floor(startValue / 60) % 12 === 0 ? 12 : Math.floor(startValue / 60) % 12;
    const startMinutes = startValue % 60;
    return `${startHour12}:${String(startMinutes).padStart(2, '0')}-${endText}`;
  }
  return `${formatMinuteOfDay(startMinute)}-${formatMinuteOfDay(endMinute)}`;
}

export function getDefaultScheduleSettings(): SharedScheduleSettings {
  return {
    dayBoundaryTime: DEFAULT_DAY_BOUNDARY_TIME,
    timeBuckets: DEFAULT_SHARED_TIME_BUCKETS.map((bucket) => ({ ...bucket })),
    routineMarkers: DEFAULT_SHARED_ROUTINE_MARKER_PRESETS.map((marker) => ({ ...marker })),
  };
}

export function normalizeSharedScheduleSettings(value?: unknown): SharedScheduleSettings {
  const defaults = getDefaultScheduleSettings();
  if (!isRecord(value)) return defaults;

  const dayBoundaryTime = parseTimeOfDayToMinutes(stringValue(value.dayBoundaryTime)) == null
    ? defaults.dayBoundaryTime
    : stringValue(value.dayBoundaryTime);

  const timeBucketCandidates = Array.isArray(value.timeBuckets)
    ? value.timeBuckets
    : Array.isArray((value as any).namedWindows)
    ? (value as any).namedWindows
    : defaults.timeBuckets;

  const timeBuckets = (timeBucketCandidates || [])
    .map((candidate: any, index: number) => {
      if (!isRecord(candidate)) return null;
      const key = slugifyKey(stringValue(candidate.key) || stringValue(candidate.label));
      const label = stringValue(candidate.label) || key;
      const startMinute = Number.isFinite(Number(candidate.startMinute))
        ? Number(candidate.startMinute)
        : parseTimeOfDayToMinutes(candidate.startTime);
      const endMinute = Number.isFinite(Number(candidate.endMinute))
        ? Number(candidate.endMinute)
        : parseTimeOfDayToMinutes(candidate.endTime);
      if (!key || !label || startMinute == null || endMinute == null) return null;
      if (startMinute < 0 || endMinute > 1440 || startMinute >= endMinute) return null;
      return {
        key,
        label,
        startMinute,
        endMinute,
        order: Number.isFinite(Number(candidate.order)) ? Number(candidate.order) : index,
      } satisfies SharedTimeBucketDefinition;
    })
    .filter((bucket): bucket is SharedTimeBucketDefinition => Boolean(bucket));

  const routineMarkerCandidates = Array.isArray(value.routineMarkers)
    ? value.routineMarkers
    : defaults.routineMarkers;

  const routineMarkers = (routineMarkerCandidates || [])
    .map((candidate: any): SharedRoutineMarkerPreset | null => {
      if (!isRecord(candidate)) return null;
      const key = slugifyKey(stringValue(candidate.key) || stringValue(candidate.label));
      const label = stringValue(candidate.label) || key;
      const defaultTime =
        stringValue(candidate.defaultTime) ||
        stringValue(candidate.defaultCompletedTime) ||
        stringValue(candidate.defaultStartedTime);
      if (!key || !label || parseTimeOfDayToMinutes(defaultTime) == null) return null;
      const result: SharedRoutineMarkerPreset = {
        key,
        label,
        defaultTime,
        defaultStartedTime: stringValue(candidate.defaultStartedTime) || defaultTime,
        defaultCompletedTime: stringValue(candidate.defaultCompletedTime) || defaultTime,
      };
      if (Number.isFinite(Number(candidate.afterDelaySecs)) && Number(candidate.afterDelaySecs) >= 0) {
        result.afterDelaySecs = Number(candidate.afterDelaySecs);
      }
      return result;
    })
    .filter((marker): marker is SharedRoutineMarkerPreset => marker !== null);

  return {
    dayBoundaryTime,
    timeBuckets: timeBuckets.length > 0 ? timeBuckets : defaults.timeBuckets,
    routineMarkers: routineMarkers.length > 0 ? routineMarkers : defaults.routineMarkers,
  };
}

export function parseSharedScheduleSettings(value?: string | null | unknown): SharedScheduleSettings {
  if (typeof value === 'string') {
    try {
      return normalizeSharedScheduleSettings(JSON.parse(value));
    } catch {
      return getDefaultScheduleSettings();
    }
  }
  return normalizeSharedScheduleSettings(value);
}

function getEffectiveSettings(scheduleSettings?: SharedScheduleSettings | null): SharedScheduleSettings {
  return normalizeSharedScheduleSettings(scheduleSettings);
}

export function getTimeBucketDefinition(
  bucket?: SharedTimeBucket | string | null,
  scheduleSettings?: SharedScheduleSettings | null
): SharedTimeBucketDefinition {
  const key = slugifyKey(stringValue(bucket));
  const effective = getEffectiveSettings(scheduleSettings);
  const found = effective.timeBuckets.find((entry) => entry.key === key);
  return found || { key: 'anytime', label: 'Anytime', startMinute: 0, endMinute: 1440, order: Number.MAX_SAFE_INTEGER };
}

export function normalizeTimeBucket(bucket?: SharedTimeBucket | string | null): SharedTimeBucket {
  return slugifyKey(stringValue(bucket));
}

export function getRoutineMarkerPreset(
  key?: SharedRoutineMarkerKey | string | null,
  scheduleSettings?: SharedScheduleSettings | null
): SharedRoutineMarkerPreset | null {
  const normalizedKey = slugifyKey(stringValue(key));
  if (!normalizedKey) return null;
  const effective = getEffectiveSettings(scheduleSettings);
  return effective.routineMarkers.find((marker) => marker.key === normalizedKey) || null;
}

export function getRoutineMarkerOptions(scheduleSettings?: SharedScheduleSettings | null): Array<{ value: SharedRoutineMarkerKey; label: string }> {
  const effective = getEffectiveSettings(scheduleSettings);
  return effective.routineMarkers.map((marker) => ({ value: marker.key, label: marker.label }));
}

export function getTimeBucketOptions(scheduleSettings?: SharedScheduleSettings | null): Array<{ value: SharedTimeBucket; label: string }> {
  const effective = getEffectiveSettings(scheduleSettings);
  return effective.timeBuckets
    .slice()
    .sort((left, right) => (left.order || 0) - (right.order || 0))
    .map((bucket) => ({ value: bucket.key, label: bucket.label }));
}

export function getDayBoundaryMinute(scheduleSettings?: SharedScheduleSettings | null): number {
  return parseTimeOfDayToMinutes(getEffectiveSettings(scheduleSettings).dayBoundaryTime) ?? parseTimeOfDayToMinutes(DEFAULT_DAY_BOUNDARY_TIME) ?? 180;
}

export function getFamilyDayKey(value: Date, scheduleSettings?: SharedScheduleSettings | null): string {
  const boundaryMinute = getDayBoundaryMinute(scheduleSettings);
  const minuteOfDay = value.getHours() * 60 + value.getMinutes();
  const local = new Date(value);
  if (minuteOfDay < boundaryMinute) {
    local.setDate(local.getDate() - 1);
  }
  return formatDateKeyLocal(local);
}

export function getFamilyDayDateUTC(value: Date, scheduleSettings?: SharedScheduleSettings | null): Date {
  return new Date(`${getFamilyDayKey(value, scheduleSettings)}T00:00:00Z`);
}

export function getDateKeyForLocalDay(value: Date, scheduleSettings?: SharedScheduleSettings | null): string {
  return getFamilyDayKey(value, scheduleSettings);
}

function getSelectedDayKey(value: Date | string): string {
  return parseDateKey(value);
}

function compareDateKeys(left: string, right: string): number {
  return left.localeCompare(right);
}

function toMinuteOfTimestamp(value?: string | null): number | null {
  const raw = stringValue(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getHours() * 60 + parsed.getMinutes();
}

function toFamilyDayOffset(minuteOfDay: number | null, boundaryMinute: number): number | null {
  if (!Number.isFinite(minuteOfDay)) return null;
  const minute = Number(minuteOfDay);
  return minute >= boundaryMinute ? minute - boundaryMinute : 1440 - boundaryMinute + minute;
}

function minuteFromOffset(offset: number, boundaryMinute: number): number {
  const normalized = ((offset + boundaryMinute) % 1440 + 1440) % 1440;
  return normalized;
}

function getChoreTimingConfig(chore: SharedChoreLike): SharedChoreTimingConfig {
  return isRecord(chore.timingConfig) ? (chore.timingConfig as SharedChoreTimingConfig) : {};
}

function getLegacyAnchorFallbackTime(anchor: SharedChoreTimingAnchorConfig | null | undefined, relation: 'before' | 'after'): string | null {
  if (!anchor) return null;
  if (stringValue(anchor.fallbackTime)) return stringValue(anchor.fallbackTime);
  if (relation === 'before') {
    return stringValue(anchor.fallbackEndTime) || stringValue(anchor.fallbackStartTime) || null;
  }
  return stringValue(anchor.fallbackStartTime) || stringValue(anchor.fallbackEndTime) || null;
}

function getCanonicalTimingMode(chore: SharedChoreLike): SharedTimingMode {
  const config = getChoreTimingConfig(chore);
  const rawMode = stringValue(chore.timingMode || config.mode);

  switch (rawMode) {
    case 'anytime':
      return 'anytime';
    case 'named_window':
      return 'named_window';
    case 'before_time':
      return 'before_time';
    case 'after_time':
      return 'after_time';
    case 'between_times':
      return 'between_times';
    case 'before_marker':
      return 'before_marker';
    case 'after_marker':
      return 'after_marker';
    case 'before_chore':
      return 'before_chore';
    case 'after_chore':
      return 'after_chore';
    case 'day_part':
      return 'named_window';
    case 'clock_window':
      return 'between_times';
    case 'routine_anchor':
      return config.anchor?.relation === 'after' ? 'after_marker' : 'before_marker';
    case 'chore_anchor':
      return config.anchor?.relation === 'after' ? 'after_chore' : 'before_chore';
    default:
      return stringValue(chore.timeBucket || config.timeBucket) ? 'named_window' : 'anytime';
  }
}

export function getChoreTimingMode(chore: SharedChoreLike): SharedTimingMode {
  return getCanonicalTimingMode(chore);
}

function getNamedWindowKey(chore: SharedChoreLike): string {
  const config = getChoreTimingConfig(chore);
  return slugifyKey(stringValue(config.namedWindowKey) || stringValue(chore.timeBucket) || stringValue(config.timeBucket));
}

function getTimeValue(chore: SharedChoreLike): string {
  const config = getChoreTimingConfig(chore);
  return stringValue(config.time);
}

function getWindowValues(chore: SharedChoreLike): { startTime: string; endTime: string } {
  const config = getChoreTimingConfig(chore);
  return {
    startTime: stringValue(config.window?.startTime),
    endTime: stringValue(config.window?.endTime),
  };
}

function getAnchorConfig(chore: SharedChoreLike): SharedChoreTimingAnchorConfig | null {
  const config = getChoreTimingConfig(chore);
  return isRecord(config.anchor) ? (config.anchor as SharedChoreTimingAnchorConfig) : null;
}

function getMarkerMomentMinute(
  markerKey: string,
  dayKey: string,
  statuses: SharedRoutineMarkerStatusLike[] | null | undefined
): number | null {
  const matched = (statuses || []).find(
    (status) => slugifyKey(status.markerKey) === markerKey && parseDateKey(status.date || '') === dayKey
  );
  return toMinuteOfTimestamp(stringValue(matched?.completedAt) || stringValue(matched?.startedAt) || null);
}

function getChoreCompletionMomentMinute(
  sourceChoreId: string,
  dayKey: string,
  chores: SharedChoreLike[] | null | undefined
): number | null {
  const sourceChore = (chores || []).find((candidate) => String(candidate?.id || '') === sourceChoreId);
  if (!sourceChore) return null;
  const completion = (sourceChore.completions || [])
    .filter((entry) => entry?.completed && parseDateKey(entry?.dateDue || '') === dayKey)
    .slice()
    .sort((left, right) => stringValue(left?.dateCompleted).localeCompare(stringValue(right?.dateCompleted)))[0];
  return toMinuteOfTimestamp(completion?.dateCompleted || null);
}

function buildRuleKey(mode: SharedTimingMode, chore: SharedChoreLike, scheduleSettings?: SharedScheduleSettings | null): string {
  switch (mode) {
    case 'anytime':
      return 'anytime';
    case 'named_window':
      return `named_window:${getNamedWindowKey(chore)}`;
    case 'before_time':
      return `before_time:${getTimeValue(chore)}`;
    case 'after_time':
      return `after_time:${getTimeValue(chore)}`;
    case 'between_times': {
      const window = getWindowValues(chore);
      return `between_times:${window.startTime}:${window.endTime}`;
    }
    case 'before_marker':
    case 'after_marker': {
      const anchor = getAnchorConfig(chore);
      return `${mode}:${slugifyKey(anchor?.routineKey || '')}`;
    }
    case 'before_chore':
    case 'after_chore': {
      const anchor = getAnchorConfig(chore);
      return `${mode}:${stringValue(anchor?.sourceChoreId || '')}`;
    }
    default:
      return `unknown:${stringValue(chore.id)}`;
  }
}

export function getChoreTimingRuleKey(chore: SharedChoreLike, scheduleSettings?: SharedScheduleSettings | null): string {
  return buildRuleKey(getCanonicalTimingMode(chore), chore, scheduleSettings);
}

function buildResolvedWindow<TChore extends SharedChoreLike>(
  chore: TChore,
  context: SharedChoreTimingContext<TChore>
): {
  mode: SharedTimingMode;
  ruleKey: string;
  label: string;
  summary: string;
  startOffset: number | null;
  endOffset: number | null;
  anchorMinute: number | null;
} {
  const effective = getEffectiveSettings(context.scheduleSettings);
  const dayBoundaryMinute = getDayBoundaryMinute(effective);
  const mode = getCanonicalTimingMode(chore);
  const ruleKey = buildRuleKey(mode, chore, effective);
  const dayKey = getSelectedDayKey(context.date);

  if (mode === 'anytime') {
    return {
      mode,
      ruleKey,
      label: 'Anytime',
      summary: `Anytime • ${formatMinuteOfDay(dayBoundaryMinute)}-${formatMinuteOfDay(dayBoundaryMinute)}`,
      startOffset: 0,
      endOffset: 1440,
      anchorMinute: null,
    };
  }

  if (mode === 'named_window') {
    const window = getTimeBucketDefinition(getNamedWindowKey(chore), effective);
    return {
      mode,
      ruleKey,
      label: window.label,
      summary: `${window.label} • ${formatMinuteRange(window.startMinute, window.endMinute)}`,
      startOffset: toFamilyDayOffset(window.startMinute, dayBoundaryMinute),
      endOffset: toFamilyDayOffset(window.endMinute, dayBoundaryMinute),
      anchorMinute: null,
    };
  }

  if (mode === 'before_time' || mode === 'after_time') {
    const minute = parseTimeOfDayToMinutes(getTimeValue(chore));
    const anchorOffset = toFamilyDayOffset(minute, dayBoundaryMinute);
    const label = `${mode === 'before_time' ? 'Before' : 'After'} ${formatMinuteOfDay(minute)}`;
    return {
      mode,
      ruleKey,
      label,
      summary:
        mode === 'before_time'
          ? `${label} • ${formatMinuteRange(dayBoundaryMinute, minute ?? dayBoundaryMinute)}`
          : `${label} • ${formatMinuteOfDay(minute)}-${formatMinuteOfDay(dayBoundaryMinute)}`,
      startOffset: mode === 'before_time' ? 0 : anchorOffset,
      endOffset: mode === 'before_time' ? anchorOffset : 1440,
      anchorMinute: minute,
    };
  }

  if (mode === 'between_times') {
    const window = getWindowValues(chore);
    const startMinute = parseTimeOfDayToMinutes(window.startTime);
    const endMinute = parseTimeOfDayToMinutes(window.endTime);
    return {
      mode,
      ruleKey,
      label: startMinute != null && endMinute != null ? formatMinuteRange(startMinute, endMinute) : 'Custom time',
      summary: startMinute != null && endMinute != null ? formatMinuteRange(startMinute, endMinute) : 'Custom time range',
      startOffset: toFamilyDayOffset(startMinute, dayBoundaryMinute),
      endOffset: toFamilyDayOffset(endMinute, dayBoundaryMinute),
      anchorMinute: null,
    };
  }

  const anchor = getAnchorConfig(chore);
  const relation: 'before' | 'after' = mode === 'before_marker' || mode === 'before_chore' ? 'before' : 'after';
  const fallbackTime = stringValue(getLegacyAnchorFallbackTime(anchor, relation));

  if (mode === 'before_marker' || mode === 'after_marker') {
    const marker = getRoutineMarkerPreset(anchor?.routineKey || null, effective);
    const actualMinute = marker
      ? getMarkerMomentMinute(marker.key, dayKey, context.routineMarkerStatuses)
      : null;
    const anchorMinute = actualMinute ?? parseTimeOfDayToMinutes(fallbackTime || marker?.defaultTime || null);
    const label = `${relation === 'before' ? 'Before' : 'After'} ${marker?.label || 'marker'}`;
    const anchorTimeText = anchorMinute != null ? formatMinuteOfDay(anchorMinute) : 'the marker time';
    return {
      mode,
      ruleKey,
      label,
      summary:
        relation === 'before'
          ? `${label} • through ${anchorTimeText}${fallbackTime || marker?.defaultTime ? ` if it is not marked` : ''}`
          : `${label} • from ${anchorTimeText}${fallbackTime || marker?.defaultTime ? ` if it is not marked` : ''}`,
      startOffset: relation === 'before' ? 0 : toFamilyDayOffset(anchorMinute, dayBoundaryMinute),
      endOffset: relation === 'before' ? toFamilyDayOffset(anchorMinute, dayBoundaryMinute) : 1440,
      anchorMinute,
    };
  }

  const sourceChoreTitle = stringValue((context.chores || []).find((candidate) => String(candidate?.id || '') === stringValue(anchor?.sourceChoreId || ''))?.title) || 'linked chore';
  const actualMinute = stringValue(anchor?.sourceChoreId)
    ? getChoreCompletionMomentMinute(stringValue(anchor?.sourceChoreId), dayKey, context.chores)
    : null;
  const anchorMinute = actualMinute ?? parseTimeOfDayToMinutes(fallbackTime || null);
  const label = `${relation === 'before' ? 'Before' : 'After'} ${sourceChoreTitle}`;
  const anchorTimeText = anchorMinute != null ? formatMinuteOfDay(anchorMinute) : 'the linked chore';
  return {
    mode,
    ruleKey,
    label,
    summary:
      relation === 'before'
        ? `${label} • through ${anchorTimeText}${fallbackTime ? ` if it is not completed` : ''}`
        : `${label} • from ${anchorTimeText}${fallbackTime ? ` if it is not completed` : ''}`,
    startOffset: relation === 'before' ? 0 : toFamilyDayOffset(anchorMinute, dayBoundaryMinute),
    endOffset: relation === 'before' ? toFamilyDayOffset(anchorMinute, dayBoundaryMinute) : 1440,
    anchorMinute,
  };
}

export function getChoreTimingSummary(chore: SharedChoreLike, scheduleSettings?: SharedScheduleSettings | null): string {
  return buildResolvedWindow(chore, {
    date: new Date(`${parseDateKey(chore.startDate)}T00:00:00Z`),
    scheduleSettings,
    chores: [chore],
  }).summary;
}

export function resolveChoreTimingForDate<TChore extends SharedChoreLike>(
  chore: TChore,
  context: SharedChoreTimingContext<TChore>
): ResolvedSharedChoreTiming {
  const effective = getEffectiveSettings(context.scheduleSettings);
  const currentDayKey = getFamilyDayKey(context.now || new Date(), effective);
  const selectedDayKey = getSelectedDayKey(context.date);
  const now = context.now || new Date();
  const dayBoundaryMinute = getDayBoundaryMinute(effective);
  const nowOffset = toFamilyDayOffset(now.getHours() * 60 + now.getMinutes(), dayBoundaryMinute) ?? 0;
  const resolved = buildResolvedWindow(chore, context);

  let status: 'late' | 'now' | 'upcoming' = 'upcoming';
  if (compareDateKeys(selectedDayKey, currentDayKey) < 0) {
    status = 'late';
  } else if (compareDateKeys(selectedDayKey, currentDayKey) > 0) {
    status = 'upcoming';
  } else if (resolved.mode === 'anytime') {
    status = 'now';
  } else if (resolved.startOffset != null && nowOffset < resolved.startOffset) {
    status = 'upcoming';
  } else if (resolved.endOffset != null && nowOffset >= resolved.endOffset) {
    status = 'late';
  } else {
    status = 'now';
  }

  const sectionLabel = status === 'late' ? 'Late' : status === 'now' ? 'Now' : 'Upcoming';
  const sectionOrder = status === 'late' ? 0 : status === 'now' ? 1 : 2;

  return {
    ...resolved,
    sectionKey: status,
    sectionLabel,
    sectionOrder,
    status,
    isActiveNow: status === 'now',
  };
}

/**
 * Return true if the resolved timing has a known time offset we can use for
 * sorting (i.e. the anchor time was resolved from a completion, fallback, or
 * time-based mode).
 */
function hasKnownTimeOffset(timing: ResolvedSharedChoreTiming): boolean {
  if (timing.mode === 'anytime') return false;
  if (timing.mode === 'before_time' || timing.mode === 'before_marker' || timing.mode === 'before_chore') {
    return timing.endOffset != null;
  }
  return timing.startOffset != null;
}

/**
 * Get the raw sort minute from a timing's resolved offsets, or null if unknown.
 * For anytime chores, returns null so that `computeSortMinutes` can place them
 * at the next window boundary relative to `now`.
 */
function getRawTimingSortMinute(timing: ResolvedSharedChoreTiming): number | null {
  if (timing.mode === 'anytime') return null;
  if (timing.mode === 'before_time' || timing.mode === 'before_marker' || timing.mode === 'before_chore') {
    return timing.endOffset ?? timing.anchorMinute ?? null;
  }
  return timing.startOffset ?? timing.anchorMinute ?? null;
}

/**
 * Find the first named-window boundary (start or end) at or after `nowOffset`.
 * Returns the boundary minute, or 1440 if no boundary is found after now
 * (i.e. all windows have ended for the day).
 */
function getNextWindowBoundaryMinute(
  nowOffset: number,
  scheduleSettings?: SharedScheduleSettings | null
): number {
  const effective = getEffectiveSettings(scheduleSettings);
  const dayBoundaryMinute = getDayBoundaryMinute(effective);
  const boundaries = new Set<number>();
  for (const bucket of effective.timeBuckets) {
    const start = toFamilyDayOffset(bucket.startMinute, dayBoundaryMinute);
    const end = toFamilyDayOffset(bucket.endMinute, dayBoundaryMinute);
    if (start != null) boundaries.add(start);
    if (end != null) boundaries.add(end);
  }
  const sorted = Array.from(boundaries).sort((a, b) => a - b);
  for (const b of sorted) {
    if (b >= nowOffset) return b;
  }
  // Past all window boundaries — place at end of day.
  return 1440;
}

/**
 * Walk the chore-anchor chain to find a time reference from the source chore.
 * Returns the source chore's time window boundaries, or null if no time-based
 * anchor is found anywhere in the chain.
 */
function resolveAnchorChainWindow(
  chore: SharedChoreLike,
  allChores: SharedChoreLike[],
  context: SharedChoreTimingContext,
  visited: Set<string>
): { startOffset: number; endOffset: number } | null {
  const anchor = getAnchorConfig(chore);
  const sourceId = stringValue(anchor?.sourceChoreId || '');
  if (!sourceId || visited.has(sourceId)) return null;
  visited.add(sourceId);

  const sourceChore = allChores.find((c) => String(c.id) === sourceId);
  if (!sourceChore) return null;

  const sourceMode = getCanonicalTimingMode(sourceChore);

  // If the source chore has a time-based mode, resolve its window directly.
  if (sourceMode !== 'anytime' && sourceMode !== 'before_chore' && sourceMode !== 'after_chore') {
    const resolved = buildResolvedWindow(sourceChore, context);
    if (resolved.startOffset != null && resolved.endOffset != null) {
      return { startOffset: resolved.startOffset, endOffset: resolved.endOffset };
    }
  }

  // If the source chore is itself chore-anchored, walk up the chain.
  if (sourceMode === 'before_chore' || sourceMode === 'after_chore') {
    return resolveAnchorChainWindow(sourceChore, allChores, context, visited);
  }

  return null;
}

/**
 * Compute sort minutes for all chores, handling chore-anchor chains and
 * anytime positioning.
 *
 * For chores anchored to another chore where the anchor time is unknown
 * (no completion, no fallback), we walk the chain to find a time-based window
 * and place the chore just before or just after that window. If no time
 * reference is found:
 * - before_chore → 0 (start of day)
 * - after_chore → 1440 (end of day)
 *
 * Anytime chores sort at the next named-window boundary after `now`, so they
 * appear in the first available gap rather than always at the end of the day.
 */
function computeSortMinutes<TChore extends SharedChoreLike>(
  items: Array<{ chore: TChore; timing: ResolvedSharedChoreTiming }>,
  context: SharedChoreTimingContext<TChore>
): Map<string, number> {
  const minuteMap = new Map<string, number>();
  const allChores = (context.chores || items.map((i) => i.chore)) as SharedChoreLike[];
  const effective = getEffectiveSettings(context.scheduleSettings);
  const dayBoundaryMinute = getDayBoundaryMinute(effective);
  const now = context.now || new Date();
  const nowOffset = toFamilyDayOffset(now.getHours() * 60 + now.getMinutes(), dayBoundaryMinute) ?? 0;

  for (const { chore, timing } of items) {
    const raw = getRawTimingSortMinute(timing);
    if (raw != null) {
      minuteMap.set(String(chore.id), raw);
      continue;
    }

    if (timing.mode === 'anytime') {
      // Sort at the next window boundary so anytime chores appear in the
      // current gap between timed windows rather than always last.
      minuteMap.set(String(chore.id), getNextWindowBoundaryMinute(nowOffset, context.scheduleSettings));
      continue;
    }

    // Chore-anchored with unknown time — walk the chain.
    const isBefore = timing.mode === 'before_chore';
    const visited = new Set<string>([String(chore.id)]);
    const sourceWindow = resolveAnchorChainWindow(chore, allChores, context, visited);

    if (sourceWindow) {
      // Place just before the source window's start, or just after its end.
      minuteMap.set(String(chore.id), isBefore ? sourceWindow.startOffset : sourceWindow.endOffset);
    } else {
      // No time reference found anywhere in the chain.
      minuteMap.set(String(chore.id), isBefore ? 0 : 1440);
    }
  }

  return minuteMap;
}

function compareResolvedTimings<TChore extends SharedChoreLike>(
  left: { chore: TChore; timing: ResolvedSharedChoreTiming },
  right: { chore: TChore; timing: ResolvedSharedChoreTiming },
  sortMinutes: Map<string, number>
): number {
  if (left.timing.sectionOrder !== right.timing.sectionOrder) {
    return left.timing.sectionOrder - right.timing.sectionOrder;
  }
  const leftMinute = sortMinutes.get(String(left.chore.id)) ?? 0;
  const rightMinute = sortMinutes.get(String(right.chore.id)) ?? 0;
  if (leftMinute !== rightMinute) return leftMinute - rightMinute;
  const leftSort = Number.isFinite(Number(left.chore.sortOrder)) ? Number(left.chore.sortOrder) : Number.MAX_SAFE_INTEGER;
  const rightSort = Number.isFinite(Number(right.chore.sortOrder)) ? Number(right.chore.sortOrder) : Number.MAX_SAFE_INTEGER;
  if (leftSort !== rightSort) return leftSort - rightSort;
  return stringValue(left.chore.title).localeCompare(stringValue(right.chore.title), undefined, { sensitivity: 'base' });
}

export function sortChoresForDisplay<TChore extends SharedChoreLike>(
  chores: TChore[],
  context: SharedChoreTimingContext<TChore>
): Array<{ chore: TChore; timing: ResolvedSharedChoreTiming }> {
  const items = [...(chores || [])].map((chore) => ({
    chore,
    timing: resolveChoreTimingForDate(chore, context),
  }));
  const sortMinutes = computeSortMinutes(items, context);
  return items.sort((a, b) => compareResolvedTimings(a, b, sortMinutes));
}

export function groupChoresForDisplay<TChore extends SharedChoreLike>(
  chores: TChore[],
  context: SharedChoreTimingContext<TChore>
): SharedChoreTimingSection<TChore>[] {
  const sorted = sortChoresForDisplay(chores, context);
  const sections = new Map<string, SharedChoreTimingSection<TChore>>();

  for (const item of sorted) {
    const existing = sections.get(item.timing.sectionKey);
    if (existing) {
      existing.items.push(item);
      existing.isActiveNow = existing.isActiveNow || item.timing.isActiveNow;
      continue;
    }
    sections.set(item.timing.sectionKey, {
      key: item.timing.sectionKey,
      label: item.timing.sectionLabel,
      order: item.timing.sectionOrder,
      items: [item],
      isActiveNow: item.timing.isActiveNow,
    });
  }

  return Array.from(sections.values()).sort((left, right) => left.order - right.order);
}

export function getNextChoreSortOrder<TChore extends SharedChoreLike>(chores: TChore[]): number {
  return (chores || []).reduce((max, chore) => {
    const value = Number(chore?.sortOrder);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, -1) + 1;
}

export function wouldCreateChoreTimingCycle<TChore extends SharedChoreLike>(
  choreId: string,
  sourceChoreId: string,
  chores: TChore[]
): boolean {
  if (!stringValue(choreId) || !stringValue(sourceChoreId)) return false;
  if (choreId === sourceChoreId) return true;

  const choresById = new Map((chores || []).map((chore) => [String(chore?.id || ''), chore]));
  const seen = new Set<string>();
  let cursor = sourceChoreId;

  while (cursor) {
    if (cursor === choreId) return true;
    if (seen.has(cursor)) return false;
    seen.add(cursor);

    const chore = choresById.get(cursor);
    const mode = chore ? getCanonicalTimingMode(chore) : 'anytime';
    if (mode !== 'before_chore' && mode !== 'after_chore') return false;
    const anchor = chore ? getAnchorConfig(chore) : null;
    cursor = stringValue(anchor?.sourceChoreId || '');
  }

  return false;
}
