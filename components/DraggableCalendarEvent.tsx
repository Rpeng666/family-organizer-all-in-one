// components/DraggableCalendarEvent.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { cn } from '../lib/utils';
import { CALENDAR_YEAR_FONT_SCALE_MAX, CALENDAR_YEAR_FONT_SCALE_MIN } from '../lib/calendar-controls';
import { buildCalendarOccurrenceKey } from '@/lib/calendar-search';
import { buildMemberColorMap, getReadableTextColor, hexToRgbaString } from '../lib/family-member-colors';
import { getPhotoUrl } from '@/lib/photo-urls';
import { Avatar } from '@/components/ui/avatar';
import styles from '../styles/Calendar.module.css'; // Import your calendar styles

interface EventFamilyMember {
    id: string;
    name?: string | null;
    color?: string | null;
    photoUrls?: any;
}

interface EventMemberIndicator {
    id: string;
    name: string | null;
    initials: string;
    color: string;
    contrastSurface: string;
    photoUrl?: string;
}

export interface CalendarItem {
    id: string;
    title: string;
    startDate: string;
    endDate: string;
    isAllDay: boolean;
    description?: string;
    pertainsTo?: EventFamilyMember[];
    tags?: Array<{ id?: string; name: string; normalizedName?: string }>;
    calendarItemKind?: 'event' | 'chore';
    // Allow flexible properties for InstantDB data
    [key: string]: any;
}

interface DraggableCalendarEventProps {
    item: CalendarItem;
    index: number;
    onClick?: (e: React.MouseEvent) => void;
    onDoubleClick?: (e: React.MouseEvent) => void;
    layout?: 'cell' | 'span' | 'year';
    memberIndicatorStyle?: 'badge' | 'dot';
    scale?: number;
    className?: string;
    continuesBefore?: boolean;
    continuesAfter?: boolean;
    draggableEnabled?: boolean;
    testId?: string | null;
    selected?: boolean;
}

const getMemberInitials = (name: string | null | undefined) => {
    if (!name) {
        return '?';
    }

    const words = name
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (words.length === 0) {
        return '?';
    }

    if (words.length === 1) {
        return words[0].slice(0, 2).toUpperCase();
    }

    return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
};

export const DraggableCalendarEvent = ({
    item,
    index,
    onClick,
    onDoubleClick,
    layout = 'cell',
    memberIndicatorStyle = 'badge',
    scale = 1,
    className,
    continuesBefore = false,
    continuesAfter = false,
    draggableEnabled = true,
    testId,
    selected = false,
}: DraggableCalendarEventProps) => {
    const eventRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dayCardSize, setDayCardSize] = useState({ width: 0, height: 0 });
    const [failedPhotoMemberIds, setFailedPhotoMemberIds] = useState<string[]>([]);
    const members = item.pertainsTo || [];
    const isSpanLayout = layout === 'span';
    const isYearLayout = layout === 'year';
    const effectiveScale = Number.isFinite(scale)
        ? Math.min(CALENDAR_YEAR_FONT_SCALE_MAX, Math.max(CALENDAR_YEAR_FONT_SCALE_MIN, scale))
        : 1;
    const appearance = item.__calendarAppearance === 'day' ? 'day' : 'default';
    const itemKind = item.calendarItemKind === 'chore' ? 'chore' : 'event';
    const usesChipChrome = itemKind === 'event' && (item.isAllDay || isSpanLayout);
    const isInteractive = draggableEnabled || typeof onClick === 'function';
    const occurrenceKey = useMemo(() => buildCalendarOccurrenceKey(item), [item]);
    const searchState = item.__liveSearchState === 'match' || item.__liveSearchState === 'dim' ? item.__liveSearchState : 'normal';
    const descriptionText = useMemo(() => String(item.description || '').replace(/\s+/g, ' ').trim(), [item.description]);
    const metaText = useMemo(
        () => String(item.__calendarMetaLabel || (appearance === 'day' ? '' : descriptionText)).replace(/\s+/g, ' ').trim(),
        [appearance, descriptionText, item.__calendarMetaLabel]
    );
    const showDescriptionRow = !isSpanLayout && !isYearLayout && metaText.length > 0;
    const memberIndicators = useMemo<EventMemberIndicator[]>(() => {
        const memberColorsById = buildMemberColorMap(members);

        return members
            .map((member) => {
                const memberId = typeof member?.id === 'string' ? member.id.trim() : '';
                if (!memberId) {
                    return null;
                }

                const color = memberColorsById[memberId];
                if (!color) {
                    return null;
                }

                return {
                    id: memberId,
                    name: member.name || null,
                    initials: getMemberInitials(member.name),
                    color,
                    contrastSurface: getReadableTextColor(color) === '#0F172A' ? '#000000' : '#FFFFFF',
                    photoUrl: getPhotoUrl((member as any).photoUrls, '64'),
                };
            })
            .filter(Boolean) as EventMemberIndicator[];
    }, [members]);
    const usesDotIndicators = memberIndicatorStyle === 'dot';
    const primaryMemberColor = memberIndicators[0]?.color || '#1D4ED8';
    const readableTextColor = getReadableTextColor(primaryMemberColor);
    const isDayAppearance = appearance === 'day';
    const isCompactDayLayout = isDayAppearance && (isSpanLayout || item.isAllDay);
    const shouldPinDayContentVertically = isDayAppearance && !isSpanLayout && !item.isAllDay;
    const avatarSizePx = Math.max(10, (isCompactDayLayout ? 14 : 18) * effectiveScale);
    const canShowDayAvatarRow =
        memberIndicators.length > 0 &&
        dayCardSize.height >= (isCompactDayLayout ? avatarSizePx + 4 : Math.max(32, avatarSizePx + 10)) &&
        dayCardSize.width >= (isCompactDayLayout ? 56 : 96) + Math.min(memberIndicators.length, 3) * (avatarSizePx * 0.72);
    const canShowDayAvatarColumn =
        memberIndicators.length > 0 &&
        !isCompactDayLayout &&
        dayCardSize.width >= 82 &&
        dayCardSize.height >= 20 + Math.min(memberIndicators.length, 3) * (avatarSizePx + 2);
    const showDayAvatars = isDayAppearance && (canShowDayAvatarRow || canShowDayAvatarColumn);
    const dayAvatarLayout = canShowDayAvatarRow ? 'row' : 'column';
    const railIndicators = useMemo<EventMemberIndicator[]>(
        () =>
            memberIndicators.length > 0
                ? memberIndicators
                : [{ id: 'default', name: null, initials: '', color: primaryMemberColor, contrastSurface: readableTextColor }],
        [memberIndicators, primaryMemberColor, readableTextColor]
    );
    const eventSurfaceStyle = useMemo(() => {
        if (appearance !== 'day') {
            return {
                opacity: isDragging ? 0.4 : 1,
                '--calendar-item-scale': String(effectiveScale),
            } as React.CSSProperties;
        }

        return {
            opacity: isDragging ? 0.4 : 1,
            '--calendar-item-scale': String(effectiveScale),
            '--calendar-day-event-primary': primaryMemberColor,
            '--calendar-day-event-outline': hexToRgbaString(primaryMemberColor, 0.72),
            '--calendar-day-event-bg': `linear-gradient(180deg, ${hexToRgbaString(primaryMemberColor, 0.42)}, ${hexToRgbaString(primaryMemberColor, 0.28)})`,
            '--calendar-day-event-text': readableTextColor,
            '--calendar-day-event-muted': readableTextColor === '#0F172A' ? 'rgba(15, 23, 42, 0.72)' : 'rgba(248, 250, 252, 0.84)',
            '--calendar-day-event-shadow': hexToRgbaString(primaryMemberColor, 0.18),
            '--calendar-day-avatar-size': `${avatarSizePx}px`,
        } as React.CSSProperties;
    }, [appearance, avatarSizePx, effectiveScale, isDragging, primaryMemberColor, readableTextColor]);

    useEffect(() => {
        setFailedPhotoMemberIds([]);
    }, [item.id, memberIndicators.length]);

    useEffect(() => {
        if (appearance !== 'day') {
            setDayCardSize((current) => (current.width === 0 && current.height === 0 ? current : { width: 0, height: 0 }));
            return;
        }

        const element = eventRef.current;
        if (!element) return;

        const updateSize = (width: number, height: number) => {
            setDayCardSize((current) => (current.width === width && current.height === height ? current : { width, height }));
        };

        updateSize(element.offsetWidth, element.offsetHeight);

        if (typeof ResizeObserver === 'undefined') {
            return;
        }

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            updateSize(Math.round(entry.contentRect.width), Math.round(entry.contentRect.height));
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [appearance]);

    useEffect(() => {
        if (!draggableEnabled) {
            return;
        }

        const element = eventRef.current;
        if (!element) return;

        const cleanupDraggable = draggable({
            element: element,
            getInitialData: () => ({ type: 'calendar-event', event: item, index: index }),
            onDragStart: () => setIsDragging(true),
            onDrop: () => setIsDragging(false),
        });

        return cleanupDraggable;
    }, [draggableEnabled, item, index]);

    const renderDayEventMemberRail = (pinned = false) => (
        <div
            className={styles.dayEventMemberRail}
            aria-hidden="true"
            data-calendar-pinned-rail={pinned ? 'true' : undefined}
        >
            {railIndicators.map((member) => (
                <span
                    key={member.id}
                    className={styles.dayEventMemberRailSegment}
                    style={{ background: member.color }}
                />
            ))}
        </div>
    );

    return (
        <div
            ref={eventRef}
            data-testid={testId === null ? undefined : (testId ?? `calendar-event-${item.id}`)}
            data-calendar-item-kind={itemKind}
            data-calendar-chip-surface={usesChipChrome ? 'chip' : 'plain'}
            data-calendar-selected={selected ? 'true' : 'false'}
            data-calendar-occurrence-key={occurrenceKey}
            data-calendar-appearance={appearance}
            data-calendar-search-state={searchState}
            style={eventSurfaceStyle}
            className={cn(
                styles.calendarItem,
                styles[itemKind],
                appearance !== 'day' && (usesChipChrome ? styles.circled : styles.calendarItemPlain),
                appearance !== 'day' && !usesChipChrome && itemKind === 'event' && styles.eventPlain,
                appearance !== 'day' && !usesChipChrome && itemKind === 'chore' && styles.chorePlain,
                isInteractive ? styles.calendarItemInteractive : styles.calendarItemStatic,
                effectiveScale !== 1 && styles.calendarItemScaled,
                isYearLayout && styles.calendarItemYear,
                selected && styles.calendarItemSelected,
                selected && appearance !== 'day' && !usesChipChrome && styles.calendarItemPlainSelected,
                searchState === 'match' && styles.calendarItemSearchMatch,
                searchState === 'dim' && styles.calendarItemSearchDim,
                appearance !== 'day' && isSpanLayout && styles.eventSpan,
                appearance !== 'day' && isSpanLayout && continuesBefore && styles.eventSpanContinuesBefore,
                appearance !== 'day' && isSpanLayout && continuesAfter && styles.eventSpanContinuesAfter,
                appearance === 'day' && styles.dayEventCard,
                className
            )}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            title={item.title}
        >
            {appearance === 'day' ? (
                <>
                    {!isSpanLayout ? renderDayEventMemberRail() : null}
                    <div className={styles.dayEventCardBody}>
                        <div
                            className={styles.dayEventCardTopRow}
                            data-calendar-pinned-vertical={shouldPinDayContentVertically ? 'true' : undefined}
                        >
                            <div
                                className={isSpanLayout ? styles.dayEventPinnedContent : styles.dayEventCardTitleBlock}
                                data-calendar-pinned-content={isSpanLayout ? 'true' : undefined}
                            >
                                {isSpanLayout ? renderDayEventMemberRail(true) : null}
                                <div
                                    className={styles.dayEventCardTitleBlock}
                                    data-calendar-pinned-text={isSpanLayout ? 'true' : undefined}
                                >
                                    <div className={styles.dayEventCardTitle}>{item.title}</div>
                                    {showDescriptionRow ? <div className={styles.dayEventCardMeta}>{metaText}</div> : null}
                                </div>
                            </div>
                            {showDayAvatars ? (
                                <div className={styles.dayEventAvatarStack} data-avatar-layout={dayAvatarLayout}>
                                    {memberIndicators.map((member) => (
                                        <Avatar
                                            key={member.id}
                                            className={styles.dayEventAvatar}
                                            style={
                                                {
                                                    '--calendar-day-avatar-border': member.color,
                                                    '--calendar-day-avatar-text': member.contrastSurface,
                                                } as React.CSSProperties
                                            }
                                        >
                                            {member.photoUrl && !failedPhotoMemberIds.includes(member.id) ? (
                                                <img
                                                    src={member.photoUrl}
                                                    alt={member.name || 'Family member'}
                                                    className={styles.dayEventAvatarImage}
                                                    onError={() =>
                                                        setFailedPhotoMemberIds((current) =>
                                                            current.includes(member.id) ? current : [...current, member.id]
                                                        )
                                                    }
                                                />
                                            ) : (
                                                <span className={styles.dayEventAvatarFallback}>{member.initials}</span>
                                            )}
                                        </Avatar>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </>
            ) : (
                <>
                    <div className={cn(styles.eventHeaderRow, isSpanLayout && styles.eventHeaderRowSpan, isYearLayout && styles.eventHeaderRowYear)}>
                        {memberIndicators.length > 0 ? (
                            <div
                                className={cn(
                                    styles.eventAudienceRow,
                                    isSpanLayout && styles.eventAudienceRowSpan,
                                    usesDotIndicators && styles.eventAudienceRowDots
                                )}
                            >
                                {memberIndicators.map((member) => (
                                    <span
                                        key={member.id}
                                        title={member.name || 'Unknown member'}
                                        data-calendar-member-indicator={usesDotIndicators ? 'dot' : 'badge'}
                                        className={usesDotIndicators ? styles.eventMemberDot : styles.eventAudienceAvatar}
                                        style={
                                            {
                                                '--calendar-member-indicator-color': member.color,
                                                '--calendar-member-indicator-contrast-surface': member.contrastSurface,
                                            } as React.CSSProperties
                                        }
                                    >
                                        {usesDotIndicators ? null : member.initials}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                        <div className={cn(styles.eventTitle, isSpanLayout && styles.eventTitleSpan, isYearLayout && styles.eventTitleYear)}>
                            {item.title}
                        </div>
                    </div>
                    {showDescriptionRow ? <div className={styles.eventMetaText}>{metaText}</div> : null}
                </>
            )}
        </div>
    );
};
