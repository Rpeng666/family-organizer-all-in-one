function normalizeCalendarTagName(value) {
    return String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeCalendarTagKey(value) {
    return normalizeCalendarTagName(value).toLocaleLowerCase();
}

function toCalendarTagRecord(value) {
    if (!value) return null;

    const rawName =
        typeof value === 'string'
            ? value
            : typeof value.name === 'string' && value.name.trim()
                ? value.name
                : typeof value.normalizedName === 'string'
                    ? value.normalizedName
                    : '';
    const normalizedName = normalizeCalendarTagKey(
        typeof value === 'object' && typeof value.normalizedName === 'string' && value.normalizedName.trim()
            ? value.normalizedName
            : rawName
    );

    if (!normalizedName) return null;

    const displayName = normalizeCalendarTagName(rawName) || normalizedName;
    return {
        id: typeof value === 'object' && typeof value.id === 'string' ? value.id : '',
        name: displayName,
        normalizedName,
    };
}

function dedupeCalendarTagRecords(values, existingTagsByKey) {
    const byKey = new Map();
    const existingByKey = existingTagsByKey instanceof Map ? existingTagsByKey : new Map();

    for (const value of Array.isArray(values) ? values : []) {
        const nextTag = toCalendarTagRecord(value);
        if (!nextTag) continue;

        const existing = existingByKey.get(nextTag.normalizedName);
        const preferredTag = existing
            ? {
                  id: existing.id || nextTag.id || '',
                  name: existing.name || nextTag.name,
                  normalizedName: nextTag.normalizedName,
              }
            : nextTag;
        const current = byKey.get(nextTag.normalizedName);

        if (!current) {
            byKey.set(nextTag.normalizedName, preferredTag);
            continue;
        }

        if (!current.id && preferredTag.id) {
            byKey.set(nextTag.normalizedName, preferredTag);
        }
    }

    return Array.from(byKey.values());
}

function splitCalendarTagDraft(value) {
    const rawValue = String(value ?? '');
    const parts = rawValue.split(/[,\n]/);
    if (parts.length <= 1) {
        return {
            committed: [],
            remaining: rawValue,
        };
    }

    const hasTrailingSeparator = /[,\n]\s*$/.test(rawValue);
    const committedParts = hasTrailingSeparator ? parts : parts.slice(0, -1);
    const remaining = hasTrailingSeparator ? '' : parts[parts.length - 1] || '';

    return {
        committed: committedParts.map(normalizeCalendarTagName).filter(Boolean),
        remaining,
    };
}

function sortCalendarTagRecords(values) {
    return [...(Array.isArray(values) ? values : [])].sort((left, right) => {
        const leftName = normalizeCalendarTagName(left?.name || left?.normalizedName || '');
        const rightName = normalizeCalendarTagName(right?.name || right?.normalizedName || '');
        return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' });
    });
}

module.exports = {
    dedupeCalendarTagRecords,
    normalizeCalendarTagKey,
    normalizeCalendarTagName,
    sortCalendarTagRecords,
    splitCalendarTagDraft,
    toCalendarTagRecord,
};
