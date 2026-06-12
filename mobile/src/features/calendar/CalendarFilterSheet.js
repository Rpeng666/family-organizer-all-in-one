import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { E, SP, R } from '../../theme/E';

export function CalendarFilterSheet({
  visible,
  onClose,
  familyMembers = [],
  availableCalendarTags = [],
  excludedMemberIds = [],
  onExcludedMemberIdsChange,
  excludedTagIds = [],
  onExcludedTagIdsChange,
  textQuery = '',
  onTextQueryChange,
}) {
  const excludedMemberSet = useMemo(() => new Set(excludedMemberIds), [excludedMemberIds]);
  const excludedTagSet = useMemo(() => new Set(excludedTagIds), [excludedTagIds]);
  const hasFilters = excludedMemberIds.length > 0 || excludedTagIds.length > 0 || textQuery.length > 0;

  function toggleMember(memberId) {
    const next = excludedMemberSet.has(memberId)
      ? excludedMemberIds.filter((id) => id !== memberId)
      : [...excludedMemberIds, memberId];
    onExcludedMemberIdsChange(next);
  }

  function toggleTag(tagId) {
    const next = excludedTagSet.has(tagId)
      ? excludedTagIds.filter((id) => id !== tagId)
      : [...excludedTagIds, tagId];
    onExcludedTagIdsChange(next);
  }

  function clearAll() {
    onExcludedMemberIdsChange([]);
    onExcludedTagIdsChange([]);
    onTextQueryChange('');
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} presentationStyle="overFullScreen">
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.header}>
            <Text style={s.title}>Filters</Text>
            <View style={s.headerActions}>
              {hasFilters ? (
                <Pressable onPress={clearAll} style={s.clearBtn}>
                  <Text style={s.clearBtnText}>Clear All</Text>
                </Pressable>
              ) : null}
              <Pressable style={s.closeBtn} onPress={onClose}>
                <Text style={s.closeBtnText}>Done</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView style={s.body} contentContainerStyle={s.bodyContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Text search */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Search</Text>
              <TextInput
                style={s.searchInput}
                value={textQuery}
                onChangeText={onTextQueryChange}
                placeholder="Search events…"
                placeholderTextColor={E.inkMuted}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />
            </View>

            {/* Family members */}
            {familyMembers.length > 0 ? (
              <View style={s.section}>
                <Text style={s.sectionLabel}>Family Members</Text>
                <Text style={s.sectionHint}>Unchecked members are hidden from the calendar.</Text>
                <View style={s.chipGrid}>
                  {familyMembers.map((member) => {
                    const excluded = excludedMemberSet.has(member.id);
                    return (
                      <Pressable
                        key={member.id}
                        style={[s.chip, excluded && s.chipExcluded]}
                        onPress={() => toggleMember(member.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: !excluded }}
                        accessibilityLabel={`${excluded ? 'Show' : 'Hide'} ${member.name || 'Unknown'}`}
                      >
                        <View style={[s.chipDot, excluded && s.chipDotExcluded]} />
                        <Text style={[s.chipText, excluded && s.chipTextExcluded]}>{member.name || 'Unknown'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Tags */}
            {availableCalendarTags.length > 0 ? (
              <View style={s.section}>
                <Text style={s.sectionLabel}>Tags</Text>
                <Text style={s.sectionHint}>Unchecked tags are hidden from the calendar.</Text>
                <View style={s.chipGrid}>
                  {availableCalendarTags.map((tag) => {
                    const tagId = tag.id || tag.normalizedName;
                    const excluded = excludedTagSet.has(tagId);
                    return (
                      <Pressable
                        key={tagId}
                        style={[s.chip, excluded && s.chipExcluded]}
                        onPress={() => toggleTag(tagId)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: !excluded }}
                        accessibilityLabel={`${excluded ? 'Show' : 'Hide'} tag ${tag.name}`}
                      >
                        <View style={[s.chipDot, excluded && s.chipDotExcluded]} />
                        <Text style={[s.chipText, excluded && s.chipTextExcluded]}>{tag.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,17,17,0.3)', justifyContent: 'flex-end' },
  sheet:    { maxHeight: '80%', backgroundColor: E.bg, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, borderWidth: 1, borderColor: E.border, paddingTop: SP.sm, paddingBottom: SP.lg },
  handle:   { alignSelf: 'center', width: 40, height: 4, borderRadius: R.pill, backgroundColor: E.border, marginBottom: SP.sm },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SP.lg, marginBottom: SP.sm },
  title:         { fontFamily: 'serif', color: E.ink, fontWeight: '700', fontSize: 20 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SP.xs },
  clearBtn:     { borderRadius: R.pill, borderWidth: 1, borderColor: E.dangerBorder, backgroundColor: E.dangerBg, paddingHorizontal: SP.sm, paddingVertical: 5 },
  clearBtnText: { color: E.dangerText, fontWeight: '600', fontSize: 12 },
  closeBtn:     { minHeight: 30, paddingHorizontal: SP.sm, borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 12, color: E.inkSub, fontWeight: '500' },
  body:        { paddingHorizontal: SP.lg },
  bodyContent: { gap: SP.lg, paddingBottom: SP.lg },
  section:     { gap: SP.xs },
  sectionLabel:{ fontSize: 10, color: E.inkMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  sectionHint: { fontSize: 12, color: E.inkMuted, fontWeight: '300' },
  searchInput: { borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, borderRadius: R.md, paddingHorizontal: SP.sm, paddingVertical: 10, color: E.ink, fontSize: 14 },
  chipGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs, marginTop: 4 },
  chip:             { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, paddingHorizontal: SP.sm, paddingVertical: 6 },
  chipExcluded:     { borderColor: E.borderLight, backgroundColor: E.bg },
  chipDot:          { width: 7, height: 7, borderRadius: 4, backgroundColor: E.ink },
  chipDotExcluded:  { backgroundColor: E.border },
  chipText:         { color: E.ink, fontWeight: '500', fontSize: 13 },
  chipTextExcluded: { color: E.inkMuted, fontWeight: '300' },
});
