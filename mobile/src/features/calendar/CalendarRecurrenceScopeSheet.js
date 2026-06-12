import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { E, SP, R } from '../../theme/E';

const SCOPE_OPTIONS = [
  { value: 'single',    label: 'This event only',           description: 'Only modify this one occurrence.', icon: 'circle' },
  { value: 'following', label: 'This and following events', description: 'Modify this and all future occurrences.', icon: 'forward' },
  { value: 'all',       label: 'All events in series',      description: 'Modify every occurrence of this recurring event.', icon: 'repeat' },
];

function ScopeIcon({ type }) {
  if (type === 'circle') {
    return <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: E.accent }} />;
  }
  if (type === 'forward') {
    return (
      <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 10, height: 10, borderTopWidth: 1.5, borderRightWidth: 1.5, borderColor: E.accent, transform: [{ rotate: '45deg' }] }} />
      </View>
    );
  }
  // repeat
  return (
    <View style={{ width: 18, height: 14, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
      <View style={{ width: 14, height: 1.5, borderRadius: 1, backgroundColor: E.accent }} />
      <View style={{ width: 14, height: 1.5, borderRadius: 1, backgroundColor: E.accent }} />
    </View>
  );
}

export function CalendarRecurrenceScopeSheet({ visible, onClose, onSelect, actionLabel = 'Edit' }) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose} presentationStyle="overFullScreen">
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={s.sheet}>
          <Text style={s.title}>{actionLabel} recurring event</Text>
          <Text style={s.subtitle}>This event is part of a series. What would you like to {actionLabel.toLowerCase()}?</Text>

          <View style={s.options}>
            {SCOPE_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={s.option}
                onPress={() => { onSelect(option.value); onClose(); }}
                accessibilityRole="button"
                accessibilityLabel={option.label}
              >
                <ScopeIcon type={option.icon} />
                <View style={{ flex: 1 }}>
                  <Text style={s.optionLabel}>{option.label}</Text>
                  <Text style={s.optionDesc}>{option.description}</Text>
                </View>
                <View style={s.chevron} />
              </Pressable>
            ))}
          </View>

          <Pressable style={s.cancelBtn} onPress={onClose}>
            <Text style={s.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,17,17,0.35)', justifyContent: 'center', alignItems: 'center', padding: SP.lg },
  sheet:    { width: '100%', maxWidth: 380, backgroundColor: E.bg, borderRadius: R.lg, borderWidth: 1, borderColor: E.border, padding: SP.lg, gap: SP.md },
  title:    { fontFamily: 'serif', color: E.ink, fontWeight: '700', fontSize: 18 },
  subtitle: { color: E.inkMuted, fontSize: 13, lineHeight: 18, fontWeight: '300' },
  options:  { gap: SP.xs },
  option:   { flexDirection: 'row', alignItems: 'center', gap: SP.sm, padding: SP.md, borderRadius: R.md, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface },
  optionLabel: { color: E.ink, fontWeight: '500', fontSize: 14 },
  optionDesc:  { color: E.inkMuted, fontSize: 12, marginTop: 2, fontWeight: '300' },
  chevron:     { width: 6, height: 6, borderTopWidth: 1.5, borderRightWidth: 1.5, borderColor: E.inkMuted, transform: [{ rotate: '45deg' }] },
  cancelBtn:   { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: SP.lg },
  cancelText:  { color: E.inkMuted, fontWeight: '500', fontSize: 14 },
});
