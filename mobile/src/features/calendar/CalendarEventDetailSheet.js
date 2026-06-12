import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { E, SP, R } from '../../theme/E';
import { formatEventRangeLabel, formatDayTitle, isImportedEvent, eventStartsAt } from './calendar-utils';

export function CalendarEventDetailSheet({ visible, onClose, event, canEditEvents, onEditPress }) {
  if (!event) return null;
  const startDate = eventStartsAt(event);
  const imported = isImportedEvent(event);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} presentationStyle="overFullScreen">
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.handle} />

          <View style={s.header}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.title}>{event.title || 'Untitled event'}</Text>
              <Text style={s.rangeLabel}>{formatEventRangeLabel(event)}</Text>
              {startDate ? <Text style={s.dateLabel}>{formatDayTitle(startDate)}</Text> : null}
            </View>
            <Pressable style={s.closeBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={s.closeBtnText}>Done</Text>
            </Pressable>
          </View>

          <ScrollView style={s.body} contentContainerStyle={s.bodyContent} showsVerticalScrollIndicator={false}>
            {/* Badges */}
            <View style={s.badgeRow}>
              <View style={[s.badge, event.isAllDay ? s.badgeAllDay : s.badgeTimed]}>
                <Text style={[s.badgeText, event.isAllDay ? s.badgeTextAllDay : s.badgeTextTimed]}>
                  {event.isAllDay ? 'All day' : 'Timed'}
                </Text>
              </View>
              {imported ? (
                <View style={s.badgeImported}>
                  <Text style={s.badgeImportedText}>
                    Apple Calendar{event.sourceCalendarName ? ` · ${event.sourceCalendarName}` : ''}
                  </Text>
                </View>
              ) : null}
            </View>

            {event.description ? (
              <View style={s.section}>
                <Text style={s.sectionLabel}>Description</Text>
                <Text style={s.sectionText}>{event.description}</Text>
              </View>
            ) : null}

            {event.location ? (
              <View style={s.section}>
                <Text style={s.sectionLabel}>Location</Text>
                <Text style={s.sectionText}>{event.location}</Text>
              </View>
            ) : null}

            {event.tags?.length > 0 ? (
              <View style={s.section}>
                <Text style={s.sectionLabel}>Tags</Text>
                <View style={s.chipRow}>
                  {event.tags.map((tag) => (
                    <View key={tag.normalizedName} style={s.chip}>
                      <Text style={s.chipText}>{tag.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {event.pertainsTo?.length > 0 ? (
              <View style={s.section}>
                <Text style={s.sectionLabel}>People</Text>
                <View style={s.chipRow}>
                  {event.pertainsTo.map((member) => (
                    <View key={member.id} style={s.memberChip}>
                      <Text style={s.memberChipText}>{member.name || 'Unknown'}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {event.rrule ? (
              <View style={s.section}>
                <Text style={s.sectionLabel}>Recurrence</Text>
                <Text style={s.sectionText}>{event.rrule}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={s.actions}>
            {canEditEvents ? (
              <Pressable
                style={s.editBtn}
                onPress={() => { onClose(); setTimeout(() => onEditPress(event), 200); }}
                accessibilityRole="button"
                accessibilityLabel="Edit this event"
              >
                <Text style={s.editBtnText}>Edit event</Text>
              </Pressable>
            ) : (
              <Text style={s.readOnlyHint}>Read only in kid mode</Text>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,17,17,0.3)', justifyContent: 'flex-end' },
  sheet:    { maxHeight: '75%', backgroundColor: E.bg, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, borderWidth: 1, borderColor: E.border, paddingTop: SP.sm, paddingBottom: SP.lg },
  handle:   { alignSelf: 'center', width: 40, height: 4, borderRadius: R.pill, backgroundColor: E.border, marginBottom: SP.sm },
  header:   { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: SP.lg, gap: SP.sm },
  title:    { fontFamily: 'serif', color: E.ink, fontWeight: '700', fontSize: 20, lineHeight: 26 },
  rangeLabel:{ color: E.ink, fontWeight: '500', fontSize: 13 },
  dateLabel: { color: E.inkMuted, fontSize: 12, fontWeight: '300' },
  closeBtn:     { minHeight: 32, paddingHorizontal: SP.sm, borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 13, color: E.inkSub, fontWeight: '500' },
  body:        { paddingHorizontal: SP.lg, marginTop: SP.sm },
  bodyContent: { gap: SP.md, paddingBottom: SP.md },
  badgeRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs },
  badge:           { borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  badgeAllDay:     { borderColor: E.border, backgroundColor: E.bgDeep },
  badgeTimed:      { borderColor: E.border, backgroundColor: E.bgDeep },
  badgeText:       { fontSize: 11, fontWeight: '500' },
  badgeTextAllDay: { color: E.inkSub },
  badgeTextTimed:  { color: E.inkSub },
  badgeImported:     { borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: E.borderLight, backgroundColor: E.bgDeep },
  badgeImportedText: { color: E.inkMuted, fontSize: 11, fontWeight: '400' },
  section:      { gap: 4 },
  sectionLabel: { color: E.inkMuted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionText:  { color: E.ink, fontSize: 14, lineHeight: 20, fontWeight: '300' },
  chipRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs },
  chip:       { borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep },
  chipText:   { color: E.inkSub, fontSize: 11, fontWeight: '400' },
  memberChip:     { borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep },
  memberChipText: { color: E.ink, fontSize: 11, fontWeight: '500' },
  actions:     { paddingHorizontal: SP.lg, paddingTop: SP.sm, borderTopWidth: 1, borderTopColor: E.borderLight },
  editBtn:     { height: 46, borderRadius: R.pill, backgroundColor: E.ink, alignItems: 'center', justifyContent: 'center' },
  editBtnText: { color: E.white, fontWeight: '600', fontSize: 15 },
  readOnlyHint:{ color: E.inkMuted, textAlign: 'center', fontSize: 13, fontWeight: '300' },
});
