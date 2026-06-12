import { type CalendarItem } from '@/components/DraggableCalendarEvent';

interface CalendarMemberWithColor {
    id?: string | null;
    name?: string | null;
    color?: string | null;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

const valuesEqual = (left: unknown, right: unknown): boolean => {
    if (left === right) return true;

    if (left == null || right == null) {
        return left == null && right == null;
    }

    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
            return false;
        }

        const leftAreIdObjects = left.every((entry) => isPlainObject(entry) && typeof entry.id === 'string');
        const rightAreIdObjects = right.every((entry) => isPlainObject(entry) && typeof entry.id === 'string');
        if (leftAreIdObjects && rightAreIdObjects) {
            const leftById = new Map(left.map((entry) => [String((entry as { id: string }).id), entry] as const));
            return right.every((entry) => {
                const match = leftById.get(String((entry as { id: string }).id));
                return match !== undefined && valuesEqual(match, entry);
            });
        }

        return right.every((entry, index) => valuesEqual(left[index], entry));
    }

    if (isPlainObject(left) && isPlainObject(right)) {
        return Object.entries(right).every(([key, value]) => valuesEqual(left[key], value));
    }

    return false;
};

export const mergeCalendarItemsWithOptimistic = (
    serverItems: CalendarItem[],
    optimisticItemsById: Record<string, Partial<CalendarItem> & { id: string }>
): CalendarItem[] => {
    const mergedById = new Map<string, CalendarItem>();

    for (const item of serverItems) {
        mergedById.set(item.id, item);
    }

    for (const [id, optimisticItem] of Object.entries(optimisticItemsById)) {
        const existing = mergedById.get(id);
        mergedById.set(id, existing ? ({ ...existing, ...optimisticItem } as CalendarItem) : (optimisticItem as CalendarItem));
    }

    return Array.from(mergedById.values());
};

export const shouldHideImportedCalendarItem = (item: CalendarItem): boolean => {
    const isAppleImported = String(item.sourceType || '').trim() === 'apple-caldav';
    if (!isAppleImported) return false;

    const sourceSyncStatus = String(item.sourceSyncStatus || '').trim().toLowerCase();
    if (sourceSyncStatus && sourceSyncStatus !== 'active') return true;

    return String(item.status || '').trim().toLowerCase() === 'cancelled';
};

export const resolveMemberColors = <T extends CalendarMemberWithColor>(
    members: T[] | undefined,
    memberColorsById: Record<string, string>
): T[] => {
    if (!Array.isArray(members) || members.length === 0) return [];

    return members.map((member) => {
        const memberId = typeof member?.id === 'string' ? member.id.trim() : '';
        if (!memberId) return member;

        const resolvedColor = memberColorsById[memberId] || member.color || null;
        if (resolvedColor === member.color) return member;

        return { ...member, color: resolvedColor };
    });
};

export const applyResolvedMemberColorsToCalendarItems = (
    items: CalendarItem[],
    memberColorsById: Record<string, string>
): CalendarItem[] =>
    items.map((item) => ({
        ...item,
        pertainsTo: resolveMemberColors(item.pertainsTo, memberColorsById),
    }));

export const getCalendarItemSelectionKey = (
    item: Pick<CalendarItem, 'id' | 'startDate'> & { recurrenceId?: string; __displayDate?: string }
): string => {
    const occurrenceToken =
        (typeof item.recurrenceId === 'string' && item.recurrenceId.trim()) ||
        (typeof item.__displayDate === 'string' && item.__displayDate.trim()) ||
        String(item.startDate || '').trim();
    return `${String(item.id || '').trim()}::${occurrenceToken}`;
};

export const optimisticItemSatisfiedByServer = (
    serverItem: CalendarItem | undefined,
    optimisticItem: Partial<CalendarItem> & { id: string }
): boolean => {
    if (!serverItem) return false;

    const optimisticTimestamp =
        [optimisticItem.updatedAt, optimisticItem.lastModified, optimisticItem.dtStamp]
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .find(Boolean) || '';
    if (optimisticTimestamp) {
        const serverTimestamps = new Set(
            [serverItem.updatedAt, serverItem.lastModified, serverItem.dtStamp]
                .map((value) => (typeof value === 'string' ? value.trim() : ''))
                .filter(Boolean)
        );
        if (serverTimestamps.has(optimisticTimestamp)) return true;
    }

    return Object.entries(optimisticItem).every(([key, value]) => {
        if (key === 'id') return true;
        return valuesEqual((serverItem as any)[key], value);
    });
};
