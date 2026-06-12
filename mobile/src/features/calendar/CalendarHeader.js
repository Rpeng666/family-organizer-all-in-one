import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { E, SP, R } from '../../theme/E';

const VIEW_MODE_LABELS = { month: 'Month', day: 'Day', agenda: 'Agenda' };
const VIEW_MODE_OPTIONS = ['month', 'day', 'agenda'];

export function CalendarHeader({
  viewMode,
  onViewModeChange,
  periodLabel,
  periodLabelSecondary,
  showTodayButton,
  onTodayPress,
  hasActiveFilters,
  onFilterPress,
  onSettingsPress,
}) {
  const [dropdownVisible, setDropdownVisible] = useState(false);

  return (
    <View style={s.container}>
      {/* Left: view picker */}
      <Pressable
        style={s.viewPicker}
        onPress={() => setDropdownVisible(true)}
        accessibilityRole="button"
        accessibilityLabel={`Current view: ${VIEW_MODE_LABELS[viewMode]}. Tap to change.`}
      >
        <Text style={s.viewPickerText}>{VIEW_MODE_LABELS[viewMode]}</Text>
        <View style={s.chevronDown} />
      </Pressable>

      {/* Center: period label + today button */}
      <View style={s.center}>
        <View style={s.periodLabelWrap}>
          <Text style={s.periodLabel} numberOfLines={1}>{periodLabel}</Text>
          {periodLabelSecondary ? (
            <Text style={s.periodLabelSecondary} numberOfLines={1}>{periodLabelSecondary}</Text>
          ) : null}
        </View>
        {showTodayButton ? (
          <Pressable style={s.todayBtn} onPress={onTodayPress} accessibilityRole="button" accessibilityLabel="Jump to today">
            <Text style={s.todayBtnText}>Today</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Right: filter + settings */}
      <View style={s.rightIcons}>
        <Pressable style={s.iconBtn} onPress={onFilterPress} accessibilityRole="button" accessibilityLabel="Open filters">
          {/* Funnel shape */}
          <View style={[s.funnelIcon, hasActiveFilters && s.funnelIconActive]}>
            <View style={s.funnelTop} />
            <View style={s.funnelMiddle} />
            <View style={s.funnelBottom} />
          </View>
          {hasActiveFilters ? <View style={s.filterBadge} /> : null}
        </Pressable>
        <Pressable style={s.iconBtn} onPress={onSettingsPress} accessibilityRole="button" accessibilityLabel="Calendar settings">
          {/* Gear approximation: circle + ring */}
          <View style={s.gearIcon}>
            <View style={s.gearRing} />
            <View style={s.gearCenter} />
          </View>
        </Pressable>
      </View>

      {/* View mode dropdown */}
      <Modal visible={dropdownVisible} transparent animationType="fade" onRequestClose={() => setDropdownVisible(false)}>
        <Pressable style={s.dropdownOverlay} onPress={() => setDropdownVisible(false)}>
          <View style={s.dropdownSheet}>
            <Text style={s.dropdownHeading}>Calendar View</Text>
            {VIEW_MODE_OPTIONS.map((mode) => {
              const active = mode === viewMode;
              return (
                <Pressable
                  key={mode}
                  style={[s.dropdownOption, active && s.dropdownOptionActive]}
                  onPress={() => { onViewModeChange(mode); setDropdownVisible(false); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch to ${VIEW_MODE_LABELS[mode]} view`}
                >
                  <Text style={[s.dropdownOptionText, active && s.dropdownOptionTextActive]}>
                    {VIEW_MODE_LABELS[mode]}
                  </Text>
                  {active ? <View style={s.checkMark} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SP.sm, paddingVertical: SP.xs, gap: SP.xs, minHeight: 44 },

  viewPicker:     { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, paddingHorizontal: SP.sm, paddingVertical: 6 },
  viewPickerText: { color: E.inkSub, fontWeight: '600', fontSize: 13 },
  chevronDown:    { width: 6, height: 6, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: E.inkMuted, transform: [{ rotate: '45deg' }], marginTop: -3 },

  center:              { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP.xs },
  periodLabelWrap:     { alignItems: 'center' },
  periodLabel:         { fontFamily: 'serif', color: E.ink, fontWeight: '700', fontSize: 15, textAlign: 'center' },
  periodLabelSecondary:{ color: E.inkMuted, fontWeight: '400', fontSize: 11, textAlign: 'center' },
  todayBtn:     { borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, paddingHorizontal: 8, paddingVertical: 3 },
  todayBtnText: { color: E.ink, fontWeight: '600', fontSize: 11 },

  rightIcons: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconBtn:    { padding: 7, position: 'relative', alignItems: 'center', justifyContent: 'center' },

  // Funnel icon (3 horizontal bars narrowing)
  funnelIcon:       { alignItems: 'center', gap: 2 },
  funnelIconActive: {},
  funnelTop:    { width: 14, height: 1.5, borderRadius: 1, backgroundColor: E.inkMuted },
  funnelMiddle: { width: 10, height: 1.5, borderRadius: 1, backgroundColor: E.inkMuted },
  funnelBottom: { width: 6,  height: 1.5, borderRadius: 1, backgroundColor: E.inkMuted },
  filterBadge:  { position: 'absolute', top: 5, right: 4, width: 6, height: 6, borderRadius: R.pill, backgroundColor: E.ink },

  // Gear icon (ring + center dot)
  gearIcon:   { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  gearRing:   { position: 'absolute', width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: E.inkMuted },
  gearCenter: { width: 5, height: 5, borderRadius: 3, backgroundColor: E.inkMuted },

  // Dropdown
  dropdownOverlay: { flex: 1, backgroundColor: 'rgba(17,17,17,0.3)', justifyContent: 'flex-start', paddingTop: 100 },
  dropdownSheet:   { marginHorizontal: SP.xl, backgroundColor: E.bg, borderRadius: R.lg, borderWidth: 1, borderColor: E.border, padding: SP.lg, gap: SP.sm },
  dropdownHeading: { fontFamily: 'serif', color: E.ink, fontWeight: '700', fontSize: 17, marginBottom: SP.xs },
  dropdownOption:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: SP.md, borderRadius: R.md },
  dropdownOptionActive: { backgroundColor: E.bgDeep },
  dropdownOptionText:       { color: E.ink, fontWeight: '400', fontSize: 15 },
  dropdownOptionTextActive: { color: E.ink, fontWeight: '700' },
  checkMark: { width: 8, height: 5, borderBottomWidth: 1.5, borderLeftWidth: 1.5, borderColor: E.ink, transform: [{ rotate: '-45deg' }], marginTop: -3 },
});
