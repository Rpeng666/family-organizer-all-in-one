'use client';

import React, { useMemo } from 'react';
import { Grid3X3 } from 'lucide-react';
import { db } from '@/lib/db';
import { registerFreeformWidget } from '@/lib/freeform-dashboard/freeform-widget-registry';
import type { FreeformWidgetProps } from '@/lib/freeform-dashboard/types';
import {
    calculateDailyXP,
    formatDateKeyUTC,
    getAssignedMembersForChoreOnDate,
    sortChoresForDisplay,
    parseSharedScheduleSettings,
    HOUSEHOLD_SCHEDULE_SETTINGS_NAME,
} from '@family-organizer/shared-core';
import { toInitials } from '@/lib/dashboard-utils';
import { getPhotoUrl } from '@/lib/photo-urls';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buildMemberColorMap } from '@/lib/family-member-colors';
import { useWidgetScale } from '@/lib/freeform-dashboard/widget-scale';

interface ChoreRow {
    choreId: string;
    title: string;
    assignedMemberIds: Set<string>;
    completedMemberIds: Set<string>;
    notDoneMemberIds: Set<string>;
}

/* ── SVG helpers ─────────────────────────────────────────────── */

function XpRing({
    color,
    percent,
    size,
    stroke,
}: {
    color: string;
    percent: number;
    size: number;
    stroke: number;
}) {
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const dashoffset = circumference * (1 - percent);
    return (
        <svg
            width={size}
            height={size}
            className="absolute inset-0"
            style={{ transform: 'rotate(90deg)' }}
        >
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={color}
                strokeOpacity={0.15}
                strokeWidth={stroke}
            />
            {percent > 0 && (
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={stroke}
                    strokeDasharray={circumference}
                    strokeDashoffset={dashoffset}
                    strokeLinecap="round"
                />
            )}
        </svg>
    );
}

/* ── Main widget ─────────────────────────────────────────────── */

function ChoreMatrixWidget({ width, height, todayUtc, config }: FreeformWidgetProps) {
    const { data } = db.useQuery({
        familyMembers: {
            $: { order: { order: 'asc' } },
        },
        chores: {
            assignees: {},
            assignments: { familyMember: {} },
            completions: { completedBy: {} },
        },
        routineMarkerStatuses: {},
        settings: {
            $: {
                where: {
                    name: HOUSEHOLD_SCHEDULE_SETTINGS_NAME,
                },
            },
        },
    });

    const members = (data?.familyMembers ?? []) as any[];
    const todayKey = formatDateKeyUTC(todayUtc);
    const routineMarkerStatuses = useMemo(
        () => (data?.routineMarkerStatuses as any[]) || [],
        [data?.routineMarkerStatuses],
    );
    const scheduleSettings = useMemo(
        () => parseSharedScheduleSettings((data?.settings as any[])?.[0]?.value || null),
        [data?.settings],
    );

    const colorMap = useMemo(() => buildMemberColorMap(members), [members]);

    const xpMap = useMemo(() => {
        if (!data?.chores || members.length === 0) return {};
        return (calculateDailyXP as any)(data.chores, members, todayUtc) as Record<
            string,
            { current: number; possible: number }
        >;
    }, [data?.chores, members, todayUtc]);

    /* Build ALL chore rows for today (no pending-only filter) */
    const choreRows: ChoreRow[] = useMemo(() => {
        const allChores = (data?.chores ?? []) as any[];

        const todayChores = allChores.filter((chore) => {
            if (!chore.rrule || !chore.startDate) return false;
            const assigned = getAssignedMembersForChoreOnDate(
                chore as Parameters<typeof getAssignedMembersForChoreOnDate>[0],
                todayUtc,
            );
            return assigned.length > 0;
        });

        const sorted = sortChoresForDisplay<any>(todayChores as any, {
            date: todayUtc,
            routineMarkerStatuses,
            chores: allChores,
            scheduleSettings,
        });

        const rows: ChoreRow[] = [];

        for (const { chore } of sorted) {
            const assigned = getAssignedMembersForChoreOnDate(
                chore as Parameters<typeof getAssignedMembersForChoreOnDate>[0],
                todayUtc,
            );

            const completedMemberIds = new Set<string>();
            const notDoneMemberIds = new Set<string>();
            for (const c of (chore.completions ?? []) as any[]) {
                if (c.dateDue !== todayKey) continue;
                const completedBy = Array.isArray(c.completedBy)
                    ? c.completedBy[0]
                    : c.completedBy;
                if (!completedBy?.id) continue;
                if (c.completed) {
                    completedMemberIds.add(completedBy.id);
                } else if (c.notDone) {
                    notDoneMemberIds.add(completedBy.id);
                }
            }

            rows.push({
                choreId: chore.id,
                title: chore.title || 'Untitled',
                assignedMemberIds: new Set(assigned.map((a) => a.id)),
                completedMemberIds,
                notDoneMemberIds,
            });
        }

        return rows;
    }, [data, todayUtc, todayKey, routineMarkerStatuses, scheduleSettings]);

    /* Last assigned row index per member (for vertical-line termination) */
    const memberLastRowIndex = useMemo(() => {
        const last: Record<string, number> = {};
        choreRows.forEach((row, idx) => {
            row.assignedMemberIds.forEach((id) => {
                last[id] = idx;
            });
        });
        return last;
    }, [choreRows]);

    const { s, sv } = useWidgetScale();

    /* ── Scaled layout measurements ───────────────────────────── */
    const RING_MARGIN_TOP = s(4);
    const ringSize = s(30);
    const ringStroke = s(2.5);
    const nodeSize = s(22);
    const nodeStroke = s(2);
    const lineWidth = s(1.5);
    const headerAvatarSize = s(24);
    const cellAvatarSize = s(20);
    const cellIconSize = s(20);
    const cellSvgSize = s(12);
    const cellSmallAvatarSize = s(16);

    const headerHeight = s(44);
    const rowHeight = s(36);
    const padding = s(12);
    const maxRows = Math.max(1, Math.floor((height - headerHeight - padding * 2) / rowHeight));
    const visibleRows = choreRows.slice(0, maxRows);
    const hiddenCount = choreRows.length - visibleRows.length;

    const labelWidthPercent = typeof config?.labelWidthPercent === 'number' ? config.labelWidthPercent : 30;
    const labelWidth = Math.max(s(40), width * (labelWidthPercent / 100));
    const memberColWidth =
        members.length > 0
            ? Math.min(s(40), (width - labelWidth - s(16)) / members.length)
            : s(40);

    return (
        <div className="flex h-full flex-col" style={{ padding }}>
            {/* Single relative container for header + rows so lines can span continuously */}
            <div className="relative flex flex-col">
                {/* ── Continuous vertical lines (one per member, behind everything) ── */}
                {members.map((m, colIdx) => {
                    const lastRow = memberLastRowIndex[m.id];
                    if (lastRow === undefined) return null;
                    const clampedLast = Math.min(lastRow, visibleRows.length - 1);
                    const color = colorMap[m.id] || '#94A3B8';

                    const lineTop = RING_MARGIN_TOP + ringSize;
                    const lineBottom =
                        headerHeight + clampedLast * rowHeight + rowHeight / 2;
                    const lineX =
                        labelWidth + colIdx * memberColWidth + memberColWidth / 2;

                    return (
                        <div
                            key={`line-${m.id}`}
                            className="absolute"
                            style={{
                                left: lineX - lineWidth / 2,
                                top: lineTop,
                                height: lineBottom - lineTop,
                                width: lineWidth,
                                backgroundColor: color,
                            }}
                        />
                    );
                })}

                {/* ── Header row ───────────────────────────────────── */}
                <div className="flex items-end" style={{ height: headerHeight }}>
                    <div
                        className="shrink-0 pb-1 font-semibold"
                        style={{ width: labelWidth, fontSize: sv(12), color: 'var(--fd-ink-muted)' }}
                    >
                        Today&apos;s Chores
                    </div>
                    <div className="flex flex-1 items-stretch">
                        {members.map((m) => {
                            const color = colorMap[m.id] || '#94A3B8';
                            const xp = xpMap[m.id] || { current: 0, possible: 0 };
                            const percent =
                                xp.possible > 0
                                    ? Math.max(0, Math.min(1, xp.current / xp.possible))
                                    : 0;

                            return (
                                <div
                                    key={m.id}
                                    className="flex flex-col items-center"
                                    style={{ width: memberColWidth, height: headerHeight }}
                                >
                                    <div
                                        className="relative z-10 flex items-center justify-center"
                                        style={{
                                            width: ringSize,
                                            height: ringSize,
                                            marginTop: RING_MARGIN_TOP,
                                        }}
                                    >
                                        <XpRing color={color} percent={percent} size={ringSize} stroke={ringStroke} />
                                        <Avatar style={{ width: headerAvatarSize, height: headerAvatarSize }}>
                                            <AvatarImage
                                                src={getPhotoUrl(m.photoUrls, '320')}
                                                alt={m.name}
                                            />
                                            <AvatarFallback style={{ fontSize: sv(9) }}>
                                                {toInitials(m.name)}
                                            </AvatarFallback>
                                        </Avatar>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Chore rows ───────────────────────────────────── */}
                {visibleRows.map((row, rowIndex) => (
                    <div
                        key={row.choreId}
                        className="flex items-center"
                        style={{ height: rowHeight, borderTop: '1px solid var(--fd-line-subtle)' }}
                    >
                        <div
                            className="shrink-0 truncate"
                            style={{ width: labelWidth, fontSize: sv(12), color: 'var(--fd-ink)' }}
                            title={row.title}
                        >
                            {row.title}
                        </div>

                        <div className="flex flex-1 items-center">
                            {members.map((m) => {
                                const color = colorMap[m.id] || '#94A3B8';
                                const isAssigned = row.assignedMemberIds.has(m.id);
                                const isCompleted = row.completedMemberIds.has(m.id);
                                const isNotDone = row.notDoneMemberIds.has(m.id);
                                const lastRow = memberLastRowIndex[m.id];
                                const showLine =
                                    lastRow !== undefined && rowIndex <= lastRow;

                                return (
                                    <div
                                        key={m.id}
                                        className="flex items-center justify-center"
                                        style={{
                                            width: memberColWidth,
                                            height: rowHeight,
                                        }}
                                    >
                                        {isAssigned ? (
                                            isCompleted ? (
                                                <div
                                                    className="relative z-10 flex items-center justify-center rounded-full"
                                                    style={{
                                                        width: nodeSize,
                                                        height: nodeSize,
                                                        border: `${nodeStroke}px solid ${color}`,
                                                        backgroundColor: 'var(--fd-panel)',
                                                    }}
                                                >
                                                    <Avatar style={{ width: cellSmallAvatarSize, height: cellSmallAvatarSize }}>
                                                        <AvatarImage
                                                            src={getPhotoUrl(m.photoUrls, '320')}
                                                            alt={m.name}
                                                        />
                                                        <AvatarFallback style={{ fontSize: sv(7) }}>
                                                            {toInitials(m.name)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                </div>
                                            ) : isNotDone ? (
                                                <div
                                                    className="relative z-10 flex items-center justify-center rounded-full"
                                                    style={{ width: cellIconSize, height: cellIconSize, backgroundColor: 'var(--fd-surface-muted)' }}
                                                >
                                                    <svg
                                                        style={{ width: cellSvgSize, height: cellSvgSize, color: 'var(--fd-ink-faint)' }}
                                                        viewBox="0 0 12 12"
                                                        fill="none"
                                                    >
                                                        <path
                                                            d="M3 3L9 9M9 3L3 9"
                                                            stroke="currentColor"
                                                            strokeWidth="2"
                                                            strokeLinecap="round"
                                                        />
                                                    </svg>
                                                </div>
                                            ) : (
                                                <div className="relative z-10 rounded-full" style={{ backgroundColor: 'var(--fd-panel)' }}>
                                                    <Avatar className="opacity-50" style={{ width: cellAvatarSize, height: cellAvatarSize }}>
                                                        <AvatarImage
                                                            src={getPhotoUrl(m.photoUrls, '320')}
                                                            alt={m.name}
                                                        />
                                                        <AvatarFallback style={{ fontSize: sv(8) }}>
                                                            {toInitials(m.name)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                </div>
                                            )
                                        ) : !showLine ? (
                                            <span style={{ color: 'var(--fd-line)' }}>
                                                &middot;
                                            </span>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {hiddenCount > 0 && (
                <div style={{ marginTop: s(4), fontSize: sv(10), color: 'var(--fd-ink-faint)' }}>
                    +{hiddenCount} more
                </div>
            )}

            {choreRows.length === 0 && (
                <div className="flex flex-1 items-center justify-center" style={{ fontSize: sv(12), color: 'var(--fd-ink-faint)' }}>
                    No chores today
                </div>
            )}
        </div>
    );
}

registerFreeformWidget({
    meta: {
        type: 'chore-matrix',
        label: 'Chore Matrix',
        icon: Grid3X3,
        description: 'Grid of today\'s chores with family member completion status',
        minWidth: 300,
        minHeight: 200,
        defaultWidth: 600,
        defaultHeight: 350,
        allowMultiple: false,
        configFields: [
            {
                key: 'labelWidthPercent',
                label: 'Chore Name Column Width',
                type: 'range',
                min: 15,
                max: 60,
                step: 1,
                formatValue: (v: number) => `${v}%`,
            },
        ],
    },
    component: ChoreMatrixWidget,
});

export default ChoreMatrixWidget;
