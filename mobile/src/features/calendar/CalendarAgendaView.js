import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { E, SP, R } from '../../theme/E';
import {
  addDays,
  compareEvents,
  eventOccursOnDay,
  formatClockTime,
  formatEventRangeLabel,
  formatYmd,
  isImportedEvent,
  startOfDay,
} from './calendar-utils';

const DAYS_INITIAL = 60;
const DAYS_EXPAND = 30;
const DAYS_MAX = 365 * 3;
const DATE_HEADER_HEIGHT = 38;
const EVENT_ROW_HEIGHT = 68;

function buildAgendaData(calendarItems, daysBefore, daysAfter) {
  const today = startOfDay(new Date());
  const rows = [];
  let todayIndex = -1;

  for (let offset = -daysBefore; offset <= daysAfter; offset++) {
    const day = addDays(today, offset);
    const dayKey = formatYmd(day);
    const dayEvents = calendarItems
      .filter((event) => eventOccursOnDay(event, day))
      .sort(compareEvents);

    if (dayEvents.length === 0) continue;
    if (todayIndex === -1 && offset >= 0) todayIndex = rows.length;

    rows.push({ type: 'date-header', key: `dh-${dayKey}`, dayKey, date: day, eventCount: dayEvents.length, isToday: offset === 0 });
    for (const event of dayEvents) {
      rows.push({ type: 'event', key: `ev-${dayKey}-${event.id}`, event, dayKey });
    }
  }

  return { rows, todayIndex: Math.max(todayIndex, 0) };
}

export function CalendarAgendaView({ anchorDate, calendarItems, onEventPress, canEditEvents }) {
  const flashListRef = useRef(null);
  const [daysBefore, setDaysBefore] = useState(DAYS_INITIAL / 2);
  const [daysAfter, setDaysAfter] = useState(DAYS_INITIAL / 2);

  const { rows, todayIndex } = useMemo(
    () => buildAgendaData(calendarItems || [], daysBefore, daysAfter),
    [calendarItems, daysBefore, daysAfter]
  );

  const handleEndReached = useCallback(() => {
    if (daysBefore + daysAfter < DAYS_MAX) setDaysAfter((prev) => prev + DAYS_EXPAND);
  }, [daysBefore, daysAfter]);

  const handleStartReached = useCallback(() => {
    if (daysBefore + daysAfter < DAYS_MAX) setDaysBefore((prev) => prev + DAYS_EXPAND);
  }, [daysBefore, daysAfter]);

  const getItemType = useCallback((item) => item.type, []);
  const keyExtractor = useCallback((item) => item.key, []);
  const overrideItemLayout = useCallback((layout, item) => {
    layout.size = item.type === 'date-header' ? DATE_HEADER_HEIGHT : EVENT_ROW_HEIGHT;
  }, []);

  const renderItem = useCallback(({ item }) => {
    if (item.type === 'date-header') {
      const dayLabel = item.isToday
        ? 'Today'
        : item.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
      return (
        <View style={[s.dateHeader, item.isToday && s.dateHeaderToday]}>
          <Text style={[s.dateHeaderText, item.isToday && s.dateHeaderTextToday]}>{dayLabel}</Text>
          <Text style={s.dateHeaderCount}>{item.eventCount}</Text>
        </View>
      );
    }

    const event = item.event;
    const imported = isImportedEvent(event);
    return (
      <Pressable
        style={s.eventRow}
        onPress={() => onEventPress?.(event)}
        accessibilityRole="button"
        accessibilityLabel={`${event.title || 'Untitled'}, ${formatEventRangeLabel(event)}`}
      >
        <View style={[s.colorBar, event.isAllDay ? s.colorBarAllDay : s.colorBarTimed]} />
        <View style={s.eventContent}>
          <View style={s.eventTopRow}>
            <Text style={s.eventTitle} numberOfLines={1}>{event.title || 'Untitled event'}</Text>
            {imported ? <Text style={s.importedTag}>↓ imported</Text> : null}
          </View>
          <Text style={s.eventTime} numberOfLines={1}>
            {event.isAllDay ? 'All day' : `${formatClockTime(event.startDate)} – ${formatClockTime(event.endDate)}`}
          </Text>
          {event.tags?.length > 0 ? (
            <View style={s.tagRow}>
              {event.tags.slice(0, 3).map((tag) => (
                <View key={tag.normalizedName} style={s.tag}>
                  <Text style={s.tagText}>{tag.name}</Text>
                </View>
              ))}
              {event.tags.length > 3 ? <Text style={s.tagMore}>+{event.tags.length - 3}</Text> : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  }, [onEventPress]);

  if (rows.length === 0) {
    return (
      <View style={s.emptyContainer}>
        <View style={s.emptyIcon}>
          <View style={s.emptyIconInner} />
        </View>
        <Text style={s.emptyTitle}>No events</Text>
        <Text style={s.emptySubtitle}>
          {canEditEvents ? 'Tap + to add your first event.' : 'No events found in this range.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <FlashList
        ref={flashListRef}
        data={rows}
        renderItem={renderItem}
        getItemType={getItemType}
        keyExtractor={keyExtractor}
        estimatedItemSize={EVENT_ROW_HEIGHT}
        overrideItemLayout={overrideItemLayout}
        initialScrollIndex={todayIndex > 0 ? todayIndex : 0}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SP.xl, gap: SP.sm },
  emptyIcon:      { width: 48, height: 48, borderRadius: R.lg, borderWidth: 1.5, borderColor: E.border, alignItems: 'center', justifyContent: 'center' },
  emptyIconInner: { width: 20, height: 20, borderRadius: R.sm, borderWidth: 1.5, borderColor: E.inkMuted },
  emptyTitle:     { fontFamily: 'serif', color: E.ink, fontWeight: '700', fontSize: 18 },
  emptySubtitle:  { color: E.inkMuted, fontSize: 13, textAlign: 'center', fontWeight: '300', lineHeight: 18 },

  dateHeader:        { height: DATE_HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SP.md, backgroundColor: E.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: E.borderLight },
  dateHeaderToday:   { backgroundColor: E.bgDeep },
  dateHeaderText:    { fontFamily: 'serif', color: E.ink, fontWeight: '700', fontSize: 14 },
  dateHeaderTextToday: { color: E.ink },
  dateHeaderCount:   { color: E.inkMuted, fontWeight: '400', fontSize: 11 },

  eventRow:     { height: EVENT_ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingRight: SP.md, backgroundColor: E.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: E.borderLight },
  colorBar:     { width: 3, height: '100%' },
  colorBarAllDay: { backgroundColor: E.accent },
  colorBarTimed:  { backgroundColor: E.accentDeep },
  eventContent: { flex: 1, paddingHorizontal: SP.sm, paddingVertical: 8, gap: 2 },
  eventTopRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  eventTitle:   { flex: 1, color: E.ink, fontWeight: '500', fontSize: 14 },
  importedTag:  { fontSize: 9, color: E.inkMuted, fontWeight: '400' },
  eventTime:    { color: E.inkMuted, fontSize: 11, fontWeight: '400' },

  tagRow:  { flexDirection: 'row', gap: 4, marginTop: 2 },
  tag:     { borderRadius: R.pill, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: E.borderLight, backgroundColor: E.bgDeep },
  tagText: { color: E.inkSub, fontSize: 10, fontWeight: '400' },
  tagMore: { color: E.inkMuted, fontSize: 10, fontWeight: '400', alignSelf: 'center' },
});
