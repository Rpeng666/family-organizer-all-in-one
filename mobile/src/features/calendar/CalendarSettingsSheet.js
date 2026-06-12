import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { E, SP, R } from '../../theme/E';

const DAY_COUNT_OPTIONS = [1, 2, 3, 5, 7, 14];
const ROW_COUNT_OPTIONS = [1, 2];

export function CalendarSettingsSheet({ visible, onClose, settings }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} presentationStyle="overFullScreen">
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.header}>
            <Text style={s.title}>Calendar Settings</Text>
            <Pressable style={s.closeBtn} onPress={onClose}>
              <Text style={s.closeBtnText}>Done</Text>
            </Pressable>
          </View>

          <ScrollView style={s.body} contentContainerStyle={s.bodyContent} showsVerticalScrollIndicator={false}>
            {/* Date display */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Date Display</Text>
              <View style={s.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.switchLabel}>Gregorian dates</Text>
                  <Text style={s.switchHint}>Show standard calendar dates</Text>
                </View>
                <Switch value={settings.showGregorian} onValueChange={settings.setShowGregorian} trackColor={{ false: E.border, true: E.ok }} thumbColor={E.white} />
              </View>
              <View style={s.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.switchLabel}>Bikram Samvat dates</Text>
                  <Text style={s.switchHint}>Show Nepali calendar dates in Devanagari</Text>
                </View>
                <Switch value={settings.showBs} onValueChange={settings.setShowBs} trackColor={{ false: E.border, true: E.ok }} thumbColor={E.white} />
              </View>
            </View>

            {/* Day view */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Day View</Text>

              <View style={s.optionGroup}>
                <Text style={s.optionGroupLabel}>Days visible</Text>
                <View style={s.chips}>
                  {DAY_COUNT_OPTIONS.map((n) => {
                    const active = settings.visibleDayCount === n;
                    return (
                      <Pressable key={`dc-${n}`} style={[s.chip, active && s.chipActive]} onPress={() => settings.setVisibleDayCount(n)} accessibilityRole="button" accessibilityLabel={`Show ${n} day${n > 1 ? 's' : ''}`}>
                        <Text style={[s.chipText, active && s.chipTextActive]}>{n}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={s.optionGroup}>
                <Text style={s.optionGroupLabel}>Rows</Text>
                <View style={s.chips}>
                  {ROW_COUNT_OPTIONS.map((n) => {
                    const active = settings.dayRowCount === n;
                    return (
                      <Pressable key={`rc-${n}`} style={[s.chip, active && s.chipActive]} onPress={() => settings.setDayRowCount(n)} accessibilityRole="button" accessibilityLabel={`${n} row${n > 1 ? 's' : ''}`}>
                        <Text style={[s.chipText, active && s.chipTextActive]}>{n}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={s.optionGroup}>
                <Text style={s.optionGroupLabel}>Hour height</Text>
                <View style={s.chips}>
                  {[32, 44, 60, 80].map((h) => {
                    const active = settings.dayHourHeight === h;
                    const label = h <= 32 ? 'Compact' : h <= 44 ? 'Default' : h <= 60 ? 'Tall' : 'XL';
                    return (
                      <Pressable key={`hh-${h}`} style={[s.chip, active && s.chipActive]} onPress={() => settings.setDayHourHeight(h)} accessibilityRole="button" accessibilityLabel={`${label} hour height`}>
                        <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,17,17,0.3)', justifyContent: 'flex-end' },
  sheet:    { maxHeight: '75%', backgroundColor: E.bg, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, borderWidth: 1, borderColor: E.border, paddingTop: SP.sm, paddingBottom: SP.lg },
  handle:   { alignSelf: 'center', width: 40, height: 4, borderRadius: R.pill, backgroundColor: E.border, marginBottom: SP.sm },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SP.lg, marginBottom: SP.sm },
  title:    { fontFamily: 'serif', color: E.ink, fontWeight: '700', fontSize: 20 },
  closeBtn:     { minHeight: 32, paddingHorizontal: SP.sm, borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 13, color: E.inkSub, fontWeight: '500' },
  body:        { paddingHorizontal: SP.lg },
  bodyContent: { gap: SP.lg, paddingBottom: SP.lg },
  section:     { gap: SP.md },
  sectionLabel:{ fontSize: 10, color: E.inkMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  switchRow:   { flexDirection: 'row', alignItems: 'center', gap: SP.md, borderWidth: 1, borderColor: E.border, borderRadius: R.md, backgroundColor: E.bgDeep, padding: SP.md },
  switchLabel: { color: E.ink, fontWeight: '500', fontSize: 14 },
  switchHint:  { color: E.inkMuted, fontSize: 12, marginTop: 2, fontWeight: '300' },
  optionGroup:      { gap: SP.xs },
  optionGroupLabel: { fontSize: 10, color: E.inkMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  chips:     { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs },
  chip:          { borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, paddingHorizontal: 14, paddingVertical: 7 },
  chipActive:    { borderColor: E.ink, backgroundColor: E.ink },
  chipText:      { color: E.inkSub, fontWeight: '500', fontSize: 13 },
  chipTextActive:{ color: E.white, fontWeight: '600' },
});
