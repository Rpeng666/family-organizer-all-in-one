import { formatBalances, type UnitDefinition } from '@/lib/currency-utils';
import { localDateToUTC } from '@family-organizer/shared-core';

export type EnvelopeLike = {
    balances?: Record<string, number> | null;
    currency?: string | null;
    amount?: number | null;
};

export type DashboardFamilyMember = {
    id: string;
    name: string;
    role?: string | null;
    photoUrls?: { ['64']?: string; ['320']?: string; ['1200']?: string } | null;
    allowanceEnvelopes?: EnvelopeLike[] | null;
};

export type DashboardChoreCompletion = {
    id: string;
    completed?: boolean;
    dateDue?: string | null;
    dateCompleted?: string | null;
    completedBy?: { id?: string } | Array<{ id?: string }> | null;
};

export type DashboardCalendarItem = {
    id: string;
    title: string;
    description?: string | null;
    startDate: string;
    endDate: string;
    isAllDay: boolean;
    pertainsTo?: Array<{ id?: string | null }> | null;
};

export type CalendarPreview = {
    id: string;
    title: string;
    description?: string | null;
    startsAt: Date;
    endsAt: Date;
    isAllDay: boolean;
    timeLabel: string;
    relativeLabel: string;
    dateLabel: string;
    isFamilyWide: boolean;
};

export function addUtcDays(date: Date, deltaDays: number): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + deltaDays));
}

export function dayDiff(fromDate: Date, toDate: Date): number {
    return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

export function toInitials(name?: string | null): string {
    const words = String(name || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (words.length === 0) return '?';

    return words
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase() || '')
        .join('');
}

export function firstRef<T>(value?: T | T[] | null): T | null {
    if (!value) return null;
    return Array.isArray(value) ? value[0] || null : value;
}

export function completionMemberId(completion?: DashboardChoreCompletion | null): string | null {
    if (!completion?.completedBy) return null;
    const completedBy = Array.isArray(completion.completedBy) ? completion.completedBy[0] : completion.completedBy;
    return completedBy?.id || null;
}

export function normalizeEnvelopeBalances(envelope: EnvelopeLike): Record<string, number> {
    if (envelope?.balances && typeof envelope.balances === 'object' && !Array.isArray(envelope.balances)) {
        return Object.fromEntries(
            Object.entries(envelope.balances)
                .map(([currencyCode, amount]) => [currencyCode.toUpperCase(), Number(amount) || 0])
                .filter(([, amount]) => amount !== 0)
        );
    }

    if (envelope?.currency && envelope?.amount != null) {
        return { [String(envelope.currency).toUpperCase()]: Number(envelope.amount) || 0 };
    }

    return {};
}

export function buildMemberBalanceLabel(member: DashboardFamilyMember, unitDefinitions: UnitDefinition[]): string {
    const totalBalances = (member.allowanceEnvelopes || []).reduce<Record<string, number>>((acc, envelope) => {
        const normalized = normalizeEnvelopeBalances(envelope);
        Object.entries(normalized).forEach(([currencyCode, amount]) => {
            acc[currencyCode] = (acc[currencyCode] || 0) + amount;
        });
        return acc;
    }, {});

    return formatBalances(totalBalances, unitDefinitions);
}

export function buildMemberTotalBalances(member: DashboardFamilyMember): Record<string, number> {
    return (member.allowanceEnvelopes || []).reduce<Record<string, number>>((acc, envelope) => {
        const normalized = normalizeEnvelopeBalances(envelope);
        Object.entries(normalized).forEach(([currencyCode, amount]) => {
            acc[currencyCode] = (acc[currencyCode] || 0) + amount;
        });
        return acc;
    }, {});
}

export function buildDueLabel(dueDate: Date, todayUtc: Date): string {
    const diff = dayDiff(todayUtc, dueDate);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff < 0) return `${Math.abs(diff)}d overdue`;
    return `In ${diff}d`;
}

export function buildCalendarLabel(item: DashboardCalendarItem): { startsAt: Date; endsAt: Date; label: string } {
    const startsAt = item.isAllDay ? localDateToUTC(new Date(`${item.startDate}T00:00:00`)) : new Date(item.startDate);
    const endsAtRaw = item.isAllDay ? localDateToUTC(new Date(`${item.endDate}T00:00:00`)) : new Date(item.endDate);

    if (item.isAllDay) {
        const endsInclusive = addUtcDays(endsAtRaw, -1);
        const sameDay =
            startsAt.getUTCFullYear() === endsInclusive.getUTCFullYear() &&
            startsAt.getUTCMonth() === endsInclusive.getUTCMonth() &&
            startsAt.getUTCDate() === endsInclusive.getUTCDate();

        const startLabel = startsAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        if (sameDay) {
            return { startsAt, endsAt: endsAtRaw, label: `${startLabel} · All day` };
        }

        const endLabel = endsInclusive.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return { startsAt, endsAt: endsAtRaw, label: `${startLabel} - ${endLabel} · All day` };
    }

    const dateLabel = startsAt.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
    return { startsAt, endsAt: endsAtRaw, label: dateLabel };
}

export function getPhotoUrl(member: DashboardFamilyMember): string | undefined {
    const key = member.photoUrls?.['320'] || member.photoUrls?.['1200'] || member.photoUrls?.['64'] || undefined;
    if (!key) return undefined;
    return `/files/${encodeURIComponent(key)}`;
}

export function buildRelativeTimeLabel(startsAt: Date, isAllDay: boolean): { relativeLabel: string; dateLabel: string } {
    const now = new Date();
    const diffMs = startsAt.getTime() - now.getTime();
    const diffMinutes = Math.round(diffMs / 60000);

    const dateLabel = startsAt.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
    });

    const timeStr = isAllDay
        ? ''
        : startsAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

    const isToday = startsAt.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = startsAt.toDateString() === tomorrow.toDateString();

    if (isToday) {
        if (isAllDay) return { relativeLabel: 'today \u00b7 all day', dateLabel };
        if (diffMinutes > 0 && diffMinutes <= 60) {
            return { relativeLabel: `in ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}, at ${timeStr}`, dateLabel };
        }
        return { relativeLabel: `today at ${timeStr}`, dateLabel };
    }

    if (isTomorrow) {
        if (isAllDay) return { relativeLabel: 'tomorrow \u00b7 all day', dateLabel };
        return { relativeLabel: `tomorrow at ${timeStr}`, dateLabel };
    }

    const weekday = startsAt.toLocaleDateString(undefined, { weekday: 'long' });
    if (isAllDay) return { relativeLabel: `${weekday} \u00b7 all day`, dateLabel };
    return { relativeLabel: `${weekday} at ${timeStr}`, dateLabel };
}

export function buildCalendarPreviews(
    calendarItems: DashboardCalendarItem[],
    todayUtc: Date,
    memberId?: string | null,
    maxItems = 8,
    excludeFamilyWide = false
): CalendarPreview[] {
    return calendarItems
        .map((item) => {
            const { startsAt, endsAt, label } = buildCalendarLabel(item);
            const memberIds = (item.pertainsTo || []).map((m) => m.id).filter(Boolean);
            const isFamilyWide = memberIds.length === 0;

            if (excludeFamilyWide && isFamilyWide) return null;

            const pertainsToMember = !memberId || isFamilyWide || memberIds.includes(memberId);
            if (!pertainsToMember) return null;

            const { relativeLabel, dateLabel } = buildRelativeTimeLabel(startsAt, item.isAllDay);

            return {
                id: item.id,
                title: item.title,
                description: item.description || null,
                startsAt,
                endsAt,
                isAllDay: item.isAllDay,
                timeLabel: label,
                relativeLabel,
                dateLabel,
                isFamilyWide,
            } satisfies CalendarPreview;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null && item.endsAt.getTime() >= todayUtc.getTime())
        .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())
        .slice(0, maxItems);
}

export function formatTimeAgo(timestamp: string | number | null | undefined): string {
    if (!timestamp) return '';
    const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
