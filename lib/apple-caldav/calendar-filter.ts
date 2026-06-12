import 'server-only';

export function isIgnoredAppleCalendarDisplayName(value: string | undefined | null) {
    const displayName = String(value || '').trim();
    if (!displayName) return false;
    return /[⚠️❗]\s*$/.test(displayName);
}
