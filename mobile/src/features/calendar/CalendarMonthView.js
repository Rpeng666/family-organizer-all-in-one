import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { E, SP, R } from '../../theme/E';
import { DraggableEvent, DropTarget } from './CalendarDragProvider';
import {
  WEEKDAY_LABELS,
  addDays,
  formatYmd,
  formatDayTitle,
  formatEventRangeLabel,
  formatMonthTitle,
  startOfWeekSunday,
  computeBikramMetaByDayKey,
} from './calendar-utils';

const WEEKS_INITIAL = 52;
const WEEKS_EXPAND = 13;
const WEEKS_MAX = 260;
const WEEK_ROW_HEIGHT = 72;
const MONTH_HEADER_HEIGHT = 36;

function buildWeekRows(centerDate, weeksBefore, weeksAfter) {
  const todayWeekStart = startOfWeekSunday(centerDate);
  const rows = [];
  let prevMonth = null;

  for (let i = -weeksBefore; i <= weeksAfter; i++) {
    const weekStart = addDays(todayWeekStart, i * 7);
    const days = Array.from({ length: 7 }, (_, d) => addDays(weekStart, d));

    for (const day of days) {
      if (day.getDate() === 1) {
        const monthKey = `${day.getFullYear()}-${day.getMonth()}`;
        if (monthKey !== prevMonth) {
          rows.push({ type: 'month-header', key: `mh-${monthKey}`, date: day, label: formatMonthTitle(day) });
          prevMonth = monthKey;
        }
        break;
      }
    }

    if (rows.length === 0 || (rows.length > 0 && rows[rows.length - 1].type === 'month-header' && rows[rows.length - 1].key !== `mh-${days[0].getFullYear()}-${days[0].getMonth()}`)) {
      if (rows.length === 0) {
        const d = days[0];
        const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
        rows.push({ type: 'month-header', key: `mh-${monthKey}`, date: d, label: formatMonthTitle(d) });
        prevMonth = monthKey;
      }
    }

    rows.push({ type: 'week', key: `w-${formatYmd(weekStart)}`, days, weekStart });
  }

  return rows;
}

function findTodayIndex(rows) {
  const todayKey = formatYmd(new Date());
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].type === 'week') {
      for (const day of rows[i].days) {
        if (formatYmd(day) === todayKey) return i;
      }
    }
  }
  return Math.floor(rows.length / 2);
}

const MonthDayCell = React.memo(function MonthDayCell({
  day, dayKey, isCurrentMonth, isSelected, isToday, eventCount, allDayCount, timedCount, bikramMeta, onPress, dayIndex,
}) {
  return (
    <DropTarget dayKey={dayKey} style={[
      s.dayCell,
      !isCurrentMonth && s.dayCellOutside,
      dayIndex > 0 && s.dayCellDividerLeft,
      isSelected && s.dayCellSelected,
      isToday && !isSelected && s.dayCellToday,
    ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${formatDayTitle(day)}, ${eventCount} events`}
        style={StyleSheet.absoluteFill}
        onPress={() => onPress(day)}
      >
        <View style={s.dayCellHeader}>
          <View style={s.dayCellLeft}>
            <Text style={[s.dayNum, !isCurrentMonth && s.dayNumOutside, isSelected && s.dayNumSelected, isToday && !isSelected && s.dayNumToday]}>
              {day.getDate()}
            </Text>
            {bikramMeta?.showGregorianMonthTransition ? (
              <Text style={[s.gregTransition, !isCurrentMonth && s.bsMuted, isSelected && s.accentText]} numberOfLines={1}>
                {bikramMeta.gregorianMonthShort}
              </Text>
            ) : null}
          </View>
          <View style={s.dayCellRight}>
            {bikramMeta?.showBsMonthTransition ? (
              <Text style={[s.bsMonthLabel, !isCurrentMonth && s.bsMuted, isSelected && s.accentText]} numberOfLines={1}>
                {bikramMeta.monthNameDevanagari}
              </Text>
            ) : null}
            {bikramMeta ? (
              <Text style={[s.bsDayNum, !isCurrentMonth && s.bsMuted, isSelected && s.accentText]} numberOfLines={1}>
                {bikramMeta.dayLabelDevanagari}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={s.eventDots}>
          {allDayCount > 0 ? Array.from({ length: Math.min(allDayCount, 2) }, (_, i) => (
            <View key={`ad-${i}`} style={[s.dot, s.dotAllDay]} />
          )) : null}
          {timedCount > 0 ? Array.from({ length: Math.min(timedCount, 2) }, (_, i) => (
            <View key={`td-${i}`} style={[s.dot, s.dotTimed]} />
          )) : null}
          {eventCount > 3 ? <Text style={[s.moreCount, isSelected && s.accentText]}>+{eventCount - 3}</Text> : null}
        </View>
      </Pressable>
    </DropTarget>
  );
});

export function CalendarMonthView({
  viewMonth,
  selectedDate,
  selectedDayKey,
  eventsByDayKey,
  selectedDayEvents,
  canEditEvents,
  isLoading,
  error,
  currentUser,
  onSelectDate,
  onAddEvent,
  onOpenEvent,
  onVisibleMonthChange,
}) {
  const flashListRef = useRef(null);
  const todayKey = formatYmd(new Date());
  const [weeksBefore, setWeeksBefore] = useState(WEEKS_INITIAL / 2);
  const [weeksAfter, setWeeksAfter] = useState(WEEKS_INITIAL / 2);

  const rows = useMemo(() => buildWeekRows(new Date(), weeksBefore, weeksAfter), [weeksBefore, weeksAfter]);
  const todayIndex = useMemo(() => findTodayIndex(rows), [rows]);

  const allDays = useMemo(() => {
    const days = [];
    for (const row of rows) {
      if (row.type === 'week') days.push(...row.days);
    }
    return days;
  }, [rows]);

  const bikramMetaByDayKey = useMemo(() => computeBikramMetaByDayKey(allDays), [allDays]);

  const handleStartReached = useCallback(() => {
    if (weeksBefore + weeksAfter < WEEKS_MAX) setWeeksBefore((prev) => prev + WEEKS_EXPAND);
  }, [weeksBefore, weeksAfter]);

  const handleEndReached = useCallback(() => {
    if (weeksBefore + weeksAfter < WEEKS_MAX) setWeeksAfter((prev) => prev + WEEKS_EXPAND);
  }, [weeksBefore, weeksAfter]);

  const handleViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (!viewableItems || viewableItems.length === 0) return;
    const firstWeek = viewableItems.find((v) => v.item?.type === 'week');
    if (firstWeek && onVisibleMonthChange) {
      onVisibleMonthChange(firstWeek.item.days[3]);
    }
  }, [onVisibleMonthChange]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50, minimumViewTime: 100 });

  const getItemType = useCallback((item) => item.type, []);
  const keyExtractor = useCallback((item) => item.key, []);
  const overrideItemLayout = useCallback((layout, item) => {
    layout.size = item.type === 'month-header' ? MONTH_HEADER_HEIGHT : WEEK_ROW_HEIGHT;
  }, []);

  const renderItem = useCallback(({ item }) => {
    if (item.type === 'month-header') {
      return (
        <View style={s.monthHeaderRow}>
          <Text style={s.monthHeaderText}>{item.label}</Text>
        </View>
      );
    }
    return (
      <View style={s.weekRow}>
        {item.days.map((day, dayIndex) => {
          const dayKey = formatYmd(day);
          const dayEvents = eventsByDayKey.get(dayKey) || [];
          const allDayCount = dayEvents.filter((e) => e.isAllDay).length;
          const timedCount = dayEvents.length - allDayCount;
          const bikramMeta = bikramMetaByDayKey.get(dayKey);
          const midDay = item.days[3];
          const isCurrentMonth = day.getMonth() === midDay.getMonth();
          return (
            <MonthDayCell
              key={dayKey}
              day={day}
              dayKey={dayKey}
              isCurrentMonth={isCurrentMonth}
              isSelected={dayKey === selectedDayKey}
              isToday={dayKey === todayKey}
              eventCount={dayEvents.length}
              allDayCount={allDayCount}
              timedCount={timedCount}
              bikramMeta={bikramMeta}
              onPress={onSelectDate}
              dayIndex={dayIndex}
            />
          );
        })}
      </View>
    );
  }, [eventsByDayKey, bikramMetaByDayKey, selectedDayKey, todayKey, onSelectDate]);

  return (
    <View style={s.container}>
      {/* Weekday header */}
      <View style={s.weekdayRow}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={s.weekdayLabel}>{label}</Text>
        ))}
      </View>

      {/* Infinite scroll grid */}
      <View style={s.gridContainer}>
        <FlashList
          ref={flashListRef}
          data={rows}
          renderItem={renderItem}
          getItemType={getItemType}
          keyExtractor={keyExtractor}
          estimatedItemSize={WEEK_ROW_HEIGHT}
          overrideItemLayout={overrideItemLayout}
          initialScrollIndex={todayIndex > 0 ? todayIndex - 1 : 0}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          onViewableItemsChanged={handleViewableItemsChanged}
          viewabilityConfig={viewabilityConfig.current}
          showsVerticalScrollIndicator={false}
        />
      </View>

      {/* Selected day panel */}
      <View style={s.panel}>
        <View style={s.panelHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.panelTitle}>{formatDayTitle(selectedDate)}</Text>
            <Text style={s.panelMeta}>
              {selectedDayEvents.length} event{selectedDayEvents.length === 1 ? '' : 's'}
              {currentUser?.name ? ` · ${currentUser.name}` : ''}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add event for selected day"
            onPress={() => onAddEvent(selectedDate)}
            style={[s.addBtn, !canEditEvents && s.addBtnLocked]}
          >
            <Text style={[s.addBtnText, !canEditEvents && s.addBtnTextLocked]}>
              {canEditEvents ? '+ Add' : 'Parent Login'}
            </Text>
          </Pressable>
        </View>

        {error ? (
          <Text style={s.errorText}>{error.message || 'Failed to load'}</Text>
        ) : isLoading ? (
          <Text style={s.emptyText}>Loading…</Text>
        ) : selectedDayEvents.length === 0 ? (
          <Text style={s.emptyText}>No events</Text>
        ) : (
          <View style={s.eventList}>
            {selectedDayEvents.map((event) => (
              <DraggableEvent key={event.id} event={event} onPress={onOpenEvent} enabled={canEditEvents}>
                <View
                  accessibilityRole="button"
                  accessibilityLabel={`${canEditEvents ? 'Edit' : 'View'} ${event.title || 'Untitled'}`}
                  style={[s.eventCard, !canEditEvents && s.eventCardReadOnly]}
                >
                  <View style={s.eventRowTop}>
                    <Text style={s.eventTitle} numberOfLines={1}>{event.title || 'Untitled event'}</Text>
                    <View style={[s.eventBadge, event.isAllDay ? s.eventBadgeAllDay : s.eventBadgeTimed]}>
                      <Text style={[s.eventBadgeText, event.isAllDay ? s.eventBadgeTextAllDay : s.eventBadgeTextTimed]}>
                        {event.isAllDay ? 'All day' : 'Timed'}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.eventMeta}>{formatEventRangeLabel(event)}</Text>
                  {event.tags?.length ? (
                    <View style={s.eventTagRow}>
                      {event.tags.map((tag) => (
                        <View key={`${event.id}-${tag.normalizedName}`} style={s.eventTag}>
                          <Text style={s.eventTagText}>{tag.name}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              </DraggableEvent>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },

  weekdayRow:   { flexDirection: 'row', paddingHorizontal: SP.sm, paddingVertical: 6, backgroundColor: E.bg },
  weekdayLabel: { flex: 1, textAlign: 'center', color: E.inkMuted, fontWeight: '500', fontSize: 11 },

  gridContainer: { flex: 1, minHeight: WEEK_ROW_HEIGHT * 6 },

  monthHeaderRow: { height: MONTH_HEADER_HEIGHT, justifyContent: 'flex-end', paddingHorizontal: SP.md, paddingBottom: 4 },
  monthHeaderText:{ fontFamily: 'serif', color: E.ink, fontWeight: '700', fontSize: 14 },

  weekRow: { flexDirection: 'row', height: WEEK_ROW_HEIGHT, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: E.borderLight },

  // Day cell
  dayCell:          { flex: 1, paddingHorizontal: 3, paddingVertical: 3, gap: 2, backgroundColor: E.surface },
  dayCellDividerLeft: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: E.borderLight },
  dayCellOutside:   { backgroundColor: E.bg },
  dayCellSelected:  { backgroundColor: E.bgDeep },
  dayCellToday:     { backgroundColor: E.bgDeep },
  dayCellHeader:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, minHeight: 24 },
  dayCellLeft:      { minWidth: 12, gap: 1 },
  dayCellRight:     { flex: 1, alignItems: 'flex-end', justifyContent: 'flex-start', gap: 1 },

  dayNum:         { fontSize: 13, fontWeight: '700', color: E.ink, lineHeight: 15 },
  dayNumOutside:  { color: E.inkMuted },
  dayNumSelected: { color: E.ink, fontWeight: '800' },
  dayNumToday:    { color: E.ink, fontWeight: '800' },
  accentText:     { color: E.ink },

  gregTransition: { fontSize: 7, lineHeight: 9, fontWeight: '600', color: E.inkMuted },
  bsMonthLabel:   { fontSize: 7, fontWeight: '600', color: E.inkMuted, lineHeight: 9, maxWidth: '100%' },
  bsDayNum:       { fontSize: 9, fontWeight: '500', color: E.inkMuted, lineHeight: 11 },
  bsMuted:        { color: E.border },

  eventDots: { minHeight: 9, flexDirection: 'row', alignItems: 'center', gap: 2, flexWrap: 'wrap', marginTop: 'auto' },
  dot:       { width: 5, height: 5, borderRadius: R.pill },
  dotAllDay: { backgroundColor: E.accent },
  dotTimed:  { backgroundColor: E.accentDeep },
  moreCount: { fontSize: 9, color: E.inkMuted, fontWeight: '500' },

  // Selected day panel
  panel:          { backgroundColor: E.surface, borderTopWidth: 1, borderTopColor: E.borderLight, padding: SP.md, gap: SP.sm, maxHeight: 240 },
  panelHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SP.sm },
  panelTitle:     { fontFamily: 'serif', color: E.ink, fontWeight: '700', fontSize: 15, lineHeight: 20 },
  panelMeta:      { color: E.inkMuted, fontSize: 11, lineHeight: 15, fontWeight: '300' },

  addBtn:          { borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnLocked:    { borderColor: E.borderLight, backgroundColor: E.bg },
  addBtnText:      { color: E.ink, fontWeight: '600', fontSize: 12 },
  addBtnTextLocked:{ color: E.inkMuted, fontWeight: '300' },

  emptyText: { color: E.inkMuted, fontSize: 13, fontWeight: '300' },
  errorText: { color: E.dangerText, fontSize: 13, fontWeight: '500' },

  eventList: { gap: SP.xs },
  eventCard:         { borderWidth: 1, borderColor: E.borderLight, borderRadius: R.sm, backgroundColor: E.bg, padding: SP.sm, gap: 3 },
  eventCardReadOnly: { backgroundColor: E.bgDeep },
  eventRowTop:       { flexDirection: 'row', alignItems: 'center', gap: SP.xs },
  eventTitle:        { flex: 1, color: E.ink, fontWeight: '500', fontSize: 14 },
  eventBadge:            { borderRadius: R.pill, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  eventBadgeAllDay:      { borderColor: E.border, backgroundColor: E.bgDeep },
  eventBadgeTimed:       { borderColor: E.border, backgroundColor: E.bgDeep },
  eventBadgeText:        { fontSize: 10, fontWeight: '500' },
  eventBadgeTextAllDay:  { color: E.inkSub },
  eventBadgeTextTimed:   { color: E.inkSub },
  eventMeta:     { color: E.inkMuted, fontSize: 11, fontWeight: '300' },
  eventTagRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  eventTag:      { borderRadius: R.pill, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: E.borderLight, backgroundColor: E.bgDeep },
  eventTagText:  { color: E.inkSub, fontSize: 10, fontWeight: '400' },
});
