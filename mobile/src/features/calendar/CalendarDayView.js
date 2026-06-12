import React, { useCallback, useMemo, useRef } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { E, SP, R } from '../../theme/E';
import { DraggableEvent, DropTarget } from './CalendarDragProvider';
import {
  addDays,
  compareEvents,
  eventOccursOnDay,
  eventStartsAt,
  eventEndsAt,
  formatClockTime,
  formatYmd,
  startOfDay,
} from './calendar-utils';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_LABEL_WIDTH = 44;
const MIN_HOUR_HEIGHT = 44;
const ALL_DAY_LANE_HEIGHT = 26;
const ALL_DAY_GAP = 2;

function getEventMinuteRange(event, day) {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  let start = eventStartsAt(event);
  let end = eventEndsAt(event);
  if (!start || !end) return null;
  if (start < dayStart) start = dayStart;
  if (end > dayEnd) end = dayEnd;
  const startMinute = (start.getTime() - dayStart.getTime()) / 60000;
  const endMinute = (end.getTime() - dayStart.getTime()) / 60000;
  if (endMinute <= startMinute) return null;
  return { startMinute, endMinute: Math.min(endMinute, 1440) };
}

function layoutTimedEvents(segments) {
  const sorted = [...segments].sort((a, b) => {
    const sd = a.startMinute - b.startMinute;
    if (sd !== 0) return sd;
    const ed = a.endMinute - b.endMinute;
    if (ed !== 0) return ed;
    return (a.event.title || '').localeCompare(b.event.title || '');
  });
  const positioned = [];
  let cluster = [], clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    const colEnds = [];
    let maxCols = 0;
    const working = cluster.map((seg) => {
      let col = 0;
      while (col < colEnds.length && colEnds[col] > seg.startMinute) col++;
      colEnds[col] = seg.endMinute;
      maxCols = Math.max(maxCols, col + 1);
      return { ...seg, columnIndex: col };
    });
    working.forEach((seg) => positioned.push({ ...seg, columnCount: Math.max(1, maxCols) }));
    cluster = []; clusterEnd = -1;
  };
  for (const seg of sorted) {
    if (!cluster.length || seg.startMinute < clusterEnd) {
      cluster.push(seg);
      clusterEnd = Math.max(clusterEnd, seg.endMinute);
    } else {
      flush();
      cluster.push(seg);
      clusterEnd = seg.endMinute;
    }
  }
  flush();
  return positioned;
}

export function CalendarDayView({
  visibleDayCount = 1,
  dayRowCount = 1,
  hourHeight = MIN_HOUR_HEIGHT,
  anchorDate,
  onAnchorDateChange,
  calendarItems = [],
  onEventPress,
  onAddEventPress,
  canEditEvents,
}) {
  const scrollRef = useRef(null);
  const screenWidth = Dimensions.get('window').width;
  const totalDays = visibleDayCount * dayRowCount;

  const visibleDays = useMemo(
    () => Array.from({ length: totalDays }, (_, i) => addDays(anchorDate, i)),
    [anchorDate, totalDays]
  );

  const todayKey = formatYmd(new Date());
  const dayColumnWidth = Math.max(60, (screenWidth - HOUR_LABEL_WIDTH) / Math.min(visibleDayCount, 7));

  const dayData = useMemo(() => {
    return visibleDays.map((day) => {
      const dayKey = formatYmd(day);
      const allEvents = calendarItems.filter((ev) => eventOccursOnDay(ev, day)).sort(compareEvents);
      const allDayEvents = allEvents.filter((ev) => ev.isAllDay);
      const timedSegments = allEvents
        .filter((ev) => !ev.isAllDay)
        .map((event) => { const range = getEventMinuteRange(event, day); return range ? { event, ...range } : null; })
        .filter(Boolean);
      return { day, dayKey, allDayEvents, timedEvents: layoutTimedEvents(timedSegments) };
    });
  }, [visibleDays, calendarItems]);

  const maxAllDayCount = useMemo(() => Math.max(0, ...dayData.map((d) => d.allDayEvents.length)), [dayData]);
  const allDaySectionHeight = maxAllDayCount > 0 ? maxAllDayCount * (ALL_DAY_LANE_HEIGHT + ALL_DAY_GAP) + 8 : 0;
  const totalHeight = hourHeight * 24;

  const initialScrollDone = useRef(false);
  const handleLayout = useCallback(() => {
    if (!initialScrollDone.current && scrollRef.current) {
      initialScrollDone.current = true;
      scrollRef.current.scrollTo({ y: hourHeight * 8 - 20, animated: false });
    }
  }, [hourHeight]);

  return (
    <View style={s.container}>
      {/* Column headers */}
      <View style={s.headerRow}>
        <Pressable style={s.jumpBtn} onPress={() => onAnchorDateChange?.(addDays(anchorDate, -visibleDayCount))} accessibilityLabel="Previous days">
          <View style={s.chevronLeft} />
        </Pressable>
        <View style={s.dayHeaders}>
          {dayData.slice(0, visibleDayCount).map(({ day, dayKey }) => {
            const isToday = dayKey === todayKey;
            return (
              <View key={dayKey} style={[s.dayHeaderCell, { width: dayColumnWidth }]}>
                <Text style={[s.dayHeaderWeekday, isToday && s.dayHeaderToday]} numberOfLines={1}>
                  {day.toLocaleDateString(undefined, { weekday: 'short' })}
                </Text>
                <Text style={[s.dayHeaderDate, isToday && s.dayHeaderToday]} numberOfLines={1}>
                  {day.getDate()}
                </Text>
              </View>
            );
          })}
        </View>
        <Pressable style={s.jumpBtn} onPress={() => onAnchorDateChange?.(addDays(anchorDate, visibleDayCount))} accessibilityLabel="Next days">
          <View style={s.chevronRight} />
        </Pressable>
      </View>

      {/* All-day section */}
      {allDaySectionHeight > 0 ? (
        <View style={[s.allDaySection, { height: allDaySectionHeight }]}>
          <View style={s.allDayLabelCol}>
            <Text style={s.allDayLabel}>All day</Text>
          </View>
          <View style={s.allDayCols}>
            {dayData.slice(0, visibleDayCount).map(({ dayKey, allDayEvents }) => (
              <DropTarget key={`ad-${dayKey}`} dayKey={dayKey} style={[s.allDayCol, { width: dayColumnWidth }]}>
                {allDayEvents.map((event) => (
                  <DraggableEvent key={event.id} event={event} onPress={(ev) => onEventPress?.(ev)} enabled={canEditEvents}>
                    <View style={s.allDayChip} accessibilityLabel={event.title || 'All day event'}>
                      <Text style={s.allDayChipText} numberOfLines={1}>{event.title || 'Untitled'}</Text>
                    </View>
                  </DraggableEvent>
                ))}
              </DropTarget>
            ))}
          </View>
        </View>
      ) : null}

      {/* Time grid */}
      <ScrollView ref={scrollRef} style={s.timeGrid} contentContainerStyle={{ height: totalHeight }} showsVerticalScrollIndicator={false} onLayout={handleLayout}>
        {HOURS.map((hour) => (
          <View key={`h-${hour}`} style={[s.hourRow, { top: hour * hourHeight, height: hourHeight }]}>
            <View style={s.hourLabelCol}>
              <Text style={s.hourLabel}>
                {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
              </Text>
            </View>
            <View style={s.hourLine} />
          </View>
        ))}

        <View style={[s.dayColsOverlay, { left: HOUR_LABEL_WIDTH }]}>
          {dayData.slice(0, visibleDayCount).map(({ dayKey, timedEvents, day }) => (
            <DropTarget key={`col-${dayKey}`} dayKey={dayKey} style={[s.dayCol, { width: dayColumnWidth }]} totalHeight={totalHeight} hourHeight={hourHeight}>
              {dayKey === todayKey ? (
                <View style={[s.nowIndicator, { top: ((new Date().getHours() * 60 + new Date().getMinutes()) / 1440) * totalHeight }]} />
              ) : null}

              {timedEvents.map((seg) => {
                const top = (seg.startMinute / 1440) * totalHeight;
                const height = Math.max(16, ((seg.endMinute - seg.startMinute) / 1440) * totalHeight);
                const colWidth = dayColumnWidth / seg.columnCount;
                const left = seg.columnIndex * colWidth;
                return (
                  <DraggableEvent key={`${dayKey}-${seg.event.id}`} event={seg.event} onPress={(ev) => onEventPress?.(ev)} enabled={canEditEvents}>
                    <View
                      style={[s.timedBlock, { position: 'absolute', top, left: left + 1, width: colWidth - 2, height: height - 1 }]}
                      accessibilityLabel={`${seg.event.title || 'Untitled'}, ${formatClockTime(seg.event.startDate)}`}
                    >
                      <Text style={s.timedTitle} numberOfLines={1}>{seg.event.title || 'Untitled'}</Text>
                      {height > 32 ? <Text style={s.timedTime} numberOfLines={1}>{formatClockTime(seg.event.startDate)}</Text> : null}
                    </View>
                  </DraggableEvent>
                );
              })}

              <Pressable style={StyleSheet.absoluteFill} onPress={() => onAddEventPress?.(day)} accessibilityLabel={`Add event on ${formatYmd(day)}`} />
            </DropTarget>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: E.bg },

  headerRow:    { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: E.borderLight, backgroundColor: E.surface },
  jumpBtn:      { padding: 10, alignItems: 'center', justifyContent: 'center' },
  chevronLeft:  { width: 8, height: 8, borderLeftWidth: 1.5, borderBottomWidth: 1.5, borderColor: E.inkSub, transform: [{ rotate: '45deg' }] },
  chevronRight: { width: 8, height: 8, borderRightWidth: 1.5, borderTopWidth: 1.5, borderColor: E.inkSub, transform: [{ rotate: '45deg' }] },
  dayHeaders:   { flex: 1, flexDirection: 'row' },
  dayHeaderCell:{ alignItems: 'center', paddingVertical: 6 },
  dayHeaderWeekday: { color: E.inkMuted, fontWeight: '500', fontSize: 11 },
  dayHeaderDate:    { color: E.ink, fontWeight: '700', fontSize: 16 },
  dayHeaderToday:   { color: E.ink, fontWeight: '800' },

  allDaySection:  { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: E.borderLight, backgroundColor: E.bgDeep },
  allDayLabelCol: { width: HOUR_LABEL_WIDTH, justifyContent: 'center', alignItems: 'center' },
  allDayLabel:    { color: E.inkMuted, fontSize: 9, fontWeight: '600', textTransform: 'uppercase' },
  allDayCols:     { flex: 1, flexDirection: 'row' },
  allDayCol:      { paddingHorizontal: 1, paddingVertical: 4, gap: ALL_DAY_GAP },
  allDayChip:     { height: ALL_DAY_LANE_HEIGHT, backgroundColor: E.bgDeep, borderRadius: 4, borderWidth: 1, borderColor: E.border, paddingHorizontal: 4, justifyContent: 'center' },
  allDayChipText: { color: E.inkSub, fontSize: 10, fontWeight: '500' },

  timeGrid: { flex: 1 },
  hourRow:       { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-start' },
  hourLabelCol:  { width: HOUR_LABEL_WIDTH, alignItems: 'flex-end', paddingRight: 6 },
  hourLabel:     { color: E.inkMuted, fontSize: 9, fontWeight: '500', marginTop: -6 },
  hourLine:      { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: E.borderLight },
  dayColsOverlay:{ position: 'absolute', top: 0, bottom: 0, flexDirection: 'row' },
  dayCol:        { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: E.borderLight },
  nowIndicator:  { position: 'absolute', left: 0, right: 0, height: 1.5, backgroundColor: E.dangerText, zIndex: 10 },
  timedBlock:    { backgroundColor: E.bgDeep, borderLeftWidth: 2, borderLeftColor: E.accent, borderRadius: 3, paddingHorizontal: 3, paddingVertical: 2, overflow: 'hidden', zIndex: 5, borderWidth: 1, borderColor: E.borderLight },
  timedTitle:    { color: E.ink, fontSize: 10, fontWeight: '600' },
  timedTime:     { color: E.inkMuted, fontSize: 9, fontWeight: '400' },
});
