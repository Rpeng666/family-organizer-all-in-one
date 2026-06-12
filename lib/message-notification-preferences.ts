export type MessageNotificationPreferences = {
    messageQuietHoursEnabled?: boolean | null;
    messageQuietHoursStart?: string | null;
    messageQuietHoursEnd?: string | null;
    messageDigestMode?: string | null;
    messageDigestWindowMinutes?: number | null;
};

export function normalizeDigestMode(value?: string | null) {
    return value === 'digest' ? 'digest' : 'immediate';
}

export function normalizeDigestWindowMinutes(value?: number | null) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return 30;
    return Math.max(5, Math.min(240, Math.round(numeric)));
}

function parseTime(value?: string | null) {
    if (!value || typeof value !== 'string') return null;
    const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
}

export function isWithinQuietHours(prefs: MessageNotificationPreferences, now = new Date()) {
    if (!prefs.messageQuietHoursEnabled) return false;
    const startMinutes = parseTime(prefs.messageQuietHoursStart);
    const endMinutes = parseTime(prefs.messageQuietHoursEnd);
    if (startMinutes === null || endMinutes === null) return false;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    if (startMinutes === endMinutes) return true;
    if (startMinutes < endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

export function nextQuietHoursEnd(prefs: MessageNotificationPreferences, now = new Date()) {
    const endMinutes = parseTime(prefs.messageQuietHoursEnd);
    const startMinutes = parseTime(prefs.messageQuietHoursStart);
    if (!prefs.messageQuietHoursEnabled || endMinutes === null || startMinutes === null) return now;

    const next = new Date(now);
    next.setSeconds(0, 0);
    next.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);

    const currentlyQuiet = isWithinQuietHours(prefs, now);
    if (!currentlyQuiet && next <= now) {
        next.setDate(next.getDate() + 1);
        return next;
    }

    if (startMinutes > endMinutes && now.getHours() * 60 + now.getMinutes() >= startMinutes) {
        next.setDate(next.getDate() + 1);
    } else if (next <= now) {
        next.setDate(next.getDate() + 1);
    }
    return next;
}

export function nextDigestAt(prefs: MessageNotificationPreferences, from = new Date()) {
    const next = new Date(from.getTime() + normalizeDigestWindowMinutes(prefs.messageDigestWindowMinutes) * 60 * 1000);
    if (prefs.messageQuietHoursEnabled && isWithinQuietHours(prefs, next)) {
        return nextQuietHoursEnd(prefs, next);
    }
    return next;
}

export function shouldQueueDigest(prefs: MessageNotificationPreferences, now = new Date()) {
    return normalizeDigestMode(prefs.messageDigestMode) === 'digest' || isWithinQuietHours(prefs, now);
}
