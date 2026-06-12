import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { id, tx } from '@instantdb/react-native';
import { E, SP, R } from '../../theme/E';
import { buildCalendarHistoryMetadata, buildCalendarHistorySnapshot } from '../../../../lib/calendar-history';
import { buildHistoryEventTransactions } from '../../../../lib/history-events';
import {
  dedupeCalendarTagRecords,
  normalizeCalendarTagKey,
  normalizeCalendarTagName,
  sortCalendarTagRecords,
  splitCalendarTagDraft,
} from '../../../../lib/calendar-tags';
import {
  DEFAULT_EVENT_STATUS,
  addDays,
  buildInitialForm,
  combineLocalDateAndTime,
  formatYmd,
  formFromEvent,
  getLocalTimeZone,
  isImportedEvent,
  parseYmdLocal,
  shouldRetryLegacyCalendarMutation,
} from './calendar-utils';

export function CalendarEventEditSheet({
  visible,
  onClose,
  editingEvent,
  selectedDate,
  canEditEvents,
  db,
  currentUser,
  recordParentActivity,
  availableCalendarTags,
  onSaved,
}) {
  const [form, setForm] = useState(() =>
    editingEvent ? formFromEvent(editingEvent) : buildInitialForm(selectedDate)
  );
  const [saving, setSaving] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm(editingEvent ? formFromEvent(editingEvent) : buildInitialForm(selectedDate));
      setSaving(false);
    }
  }, [visible, editingEvent?.id, selectedDate]);

  useEffect(() => {
    const subShow = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const subHide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(subShow, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(subHide, () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const availableCalendarTagByKey = useMemo(
    () => new Map(availableCalendarTags.map((tag) => [tag.normalizedName, tag])),
    [availableCalendarTags]
  );

  const selectedTagKeys = useMemo(
    () => new Set((form.tags || []).map((tag) => tag.normalizedName || normalizeCalendarTagKey(tag.name))),
    [form.tags]
  );

  const tagSuggestions = useMemo(() => {
    const draftKey = normalizeCalendarTagKey(form.tagDraft);
    return availableCalendarTags
      .filter((tag) => !selectedTagKeys.has(tag.normalizedName))
      .filter((tag) => !draftKey || tag.normalizedName.includes(draftKey))
      .slice(0, 8);
  }, [availableCalendarTags, form.tagDraft, selectedTagKeys]);

  const isEditingImportedEvent = !!(editingEvent && isImportedEvent(editingEvent));
  const canEditEventDetails = canEditEvents && !saving;
  const canEditEventTags = canEditEvents && !saving;

  function handleChange(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function addTagsToForm(values) {
    const nextValues = Array.isArray(values) ? values : [values];
    setForm((prev) => ({
      ...prev,
      tags: sortCalendarTagRecords(dedupeCalendarTagRecords([...(prev.tags || []), ...nextValues], availableCalendarTagByKey)),
      tagDraft: '',
    }));
  }

  function handleTagDraftChange(value) {
    const { committed, remaining } = splitCalendarTagDraft(value);
    if (committed.length > 0) {
      setForm((prev) => ({
        ...prev,
        tags: sortCalendarTagRecords(dedupeCalendarTagRecords([...(prev.tags || []), ...committed], availableCalendarTagByKey)),
        tagDraft: remaining,
      }));
      return;
    }
    handleChange('tagDraft', value);
  }

  function handleAddTagDraft() {
    const nextTag = normalizeCalendarTagName(form.tagDraft);
    if (!nextTag) { handleChange('tagDraft', ''); return; }
    addTagsToForm([nextTag]);
  }

  function handleRemoveTag(tagKey) {
    setForm((prev) => ({
      ...prev,
      tags: (prev.tags || []).filter((tag) => tag.normalizedName !== tagKey),
    }));
  }

  const appendCalendarHistoryTransactions = useCallback(
    (txOps, input) => {
      if (!currentUser?.id) return txOps;
      const historyEvent = buildHistoryEventTransactions({
        tx,
        createId: id,
        occurredAt: input.occurredAt,
        domain: 'calendar',
        actionType: input.actionType,
        summary: input.summary,
        source: 'manual',
        actorFamilyMemberId: currentUser.id,
        calendarItemId: input.calendarItemId || null,
        metadata: buildCalendarHistoryMetadata({
          title: input.title || null,
          before: input.beforeSnapshot || null,
          after: input.afterSnapshot || null,
          extra: input.metadata || null,
        }),
      });
      return [...txOps, ...historyEvent.transactions];
    },
    [currentUser?.id]
  );

  async function handleSave() {
    recordParentActivity();

    const draftTagName = normalizeCalendarTagName(form.tagDraft);
    const nextTags = sortCalendarTagRecords(
      dedupeCalendarTagRecords(draftTagName ? [...(form.tags || []), draftTagName] : form.tags || [], availableCalendarTagByKey)
    );
    if (draftTagName) {
      setForm((prev) => ({ ...prev, tags: nextTags, tagDraft: '' }));
    }

    const nowIso = new Date().toISOString();

    const buildTagTxOps = (targetEventId, previousTags) => {
      const txOps = [];
      const previousTagIds = new Set(
        dedupeCalendarTagRecords(previousTags || [], availableCalendarTagByKey)
          .map((tag) => availableCalendarTagByKey.get(tag.normalizedName)?.id || tag.id || '')
          .filter(Boolean)
      );
      const resolvedNextTags = [];

      for (const tag of nextTags) {
        const existingTag = availableCalendarTagByKey.get(tag.normalizedName);
        const tagId = existingTag?.id || tag.id || id();
        resolvedNextTags.push({ id: tagId, name: existingTag?.name || tag.name, normalizedName: tag.normalizedName });

        if (!existingTag?.id && !tag.id) {
          txOps.push(tx.calendarTags[tagId].update({
            createdAt: nowIso, name: tag.name, normalizedName: tag.normalizedName, updatedAt: nowIso,
          }));
        }
      }

      const nextTagIds = new Set(resolvedNextTags.map((tag) => tag.id));
      for (const previousTagId of Array.from(previousTagIds)) {
        if (!nextTagIds.has(previousTagId)) txOps.push(tx.calendarItems[targetEventId].unlink({ tags: previousTagId }));
      }
      for (const tag of resolvedNextTags) {
        if (tag.id && !previousTagIds.has(tag.id)) txOps.push(tx.calendarItems[targetEventId].link({ tags: tag.id }));
      }
      return txOps;
    };

    const title = form.title.trim();
    if (!title) { Alert.alert('Missing title', 'Please add an event title.'); return; }

    let payload;

    if (form.isAllDay) {
      const startDate = parseYmdLocal(form.startDate);
      const endDateInclusive = parseYmdLocal(form.endDate);
      if (!startDate || !endDateInclusive) { Alert.alert('Invalid date', 'Use YYYY-MM-DD for start and end dates.'); return; }
      if (endDateInclusive < startDate) { Alert.alert('Invalid range', 'End date must be on or after the start date.'); return; }
      const endDateExclusive = addDays(endDateInclusive, 1);
      payload = {
        title, description: form.description.trim(),
        startDate: formatYmd(startDate), endDate: formatYmd(endDateExclusive),
        isAllDay: true,
        year: startDate.getFullYear(), month: startDate.getMonth() + 1, dayOfMonth: startDate.getDate(),
      };
    } else {
      const start = combineLocalDateAndTime(form.startDate, form.startTime);
      const end = combineLocalDateAndTime(form.endDate, form.endTime);
      if (!start || !end) { Alert.alert('Invalid date/time', 'Use YYYY-MM-DD dates and HH:mm times.'); return; }
      if (end <= start) { Alert.alert('Invalid range', 'End time must be after the start time.'); return; }
      payload = {
        title, description: form.description.trim(),
        startDate: start.toISOString(), endDate: end.toISOString(),
        isAllDay: false,
        year: start.getFullYear(), month: start.getMonth() + 1, dayOfMonth: start.getDate(),
      };
    }

    const legacyPayload = payload;
    const eventId = editingEvent?.id || id();
    const previousSequence = typeof editingEvent?.sequence === 'number' ? editingEvent.sequence : 0;
    const status = String(form.status || editingEvent?.status || DEFAULT_EVENT_STATUS).trim().toLowerCase() || DEFAULT_EVENT_STATUS;
    const payloadBase = {
      uid: editingEvent?.uid || form.uid || eventId,
      sequence: editingEvent?.id ? previousSequence + 1 : previousSequence,
      status,
      createdAt: editingEvent?.createdAt || form.createdAt || nowIso,
      updatedAt: nowIso, dtStamp: nowIso, lastModified: nowIso,
      location: String(form.location || editingEvent?.location || '').trim(),
      timeZone: String(form.timeZone || editingEvent?.timeZone || getLocalTimeZone()).trim(),
      rrule: String(form.rrule || editingEvent?.rrule || '').trim(),
      rdates: Array.isArray(form.rdates) ? form.rdates : Array.isArray(editingEvent?.rdates) ? editingEvent.rdates : [],
      exdates: Array.isArray(form.exdates) ? form.exdates : Array.isArray(editingEvent?.exdates) ? editingEvent.exdates : [],
      recurrenceLines: Array.isArray(form.recurrenceLines) ? form.recurrenceLines : Array.isArray(editingEvent?.recurrenceLines) ? editingEvent.recurrenceLines : [],
      recurrenceId: String(form.recurrenceId || editingEvent?.recurrenceId || '').trim(),
      recurringEventId: String(form.recurringEventId || editingEvent?.recurringEventId || '').trim(),
      recurrenceIdRange: String(form.recurrenceIdRange || editingEvent?.recurrenceIdRange || '').trim(),
      alarms: Array.isArray(form.alarms) ? form.alarms : Array.isArray(editingEvent?.alarms) ? editingEvent.alarms : [],
      eventType: String(form.eventType || editingEvent?.eventType || 'default'),
      visibility: String(form.visibility || editingEvent?.visibility || 'default'),
      transparency: String(form.transparency || editingEvent?.transparency || (form.isAllDay ? 'transparent' : 'opaque')),
      ...(typeof form.travelDurationBeforeMinutes === 'number' ? { travelDurationBeforeMinutes: form.travelDurationBeforeMinutes } : {}),
      ...(typeof form.travelDurationAfterMinutes === 'number' ? { travelDurationAfterMinutes: form.travelDurationAfterMinutes } : {}),
    };

    payload = { ...payload, ...payloadBase };
    const tagTxOps = buildTagTxOps(eventId, editingEvent?.tags || []);
    const summary = `${editingEvent?.id ? 'Updated' : 'Created'} event "${title || 'Untitled event'}"`;
    const buildSaveTxOps = (nextPayload) =>
      appendCalendarHistoryTransactions([tx.calendarItems[eventId].update(nextPayload), ...tagTxOps], {
        occurredAt: nowIso,
        actionType: editingEvent?.id ? 'calendar_event_updated' : 'calendar_event_created',
        summary, calendarItemId: eventId, title: title || 'Untitled event',
        beforeSnapshot: buildCalendarHistorySnapshot(editingEvent),
        afterSnapshot: buildCalendarHistorySnapshot(nextPayload),
      });

    setSaving(true);
    try {
      await db.transact(buildSaveTxOps(payload));
      onSaved?.(parseYmdLocal(form.startDate));
      onClose();
    } catch (error) {
      if (shouldRetryLegacyCalendarMutation(error)) {
        try {
          await db.transact(buildSaveTxOps(legacyPayload));
          onSaved?.(parseYmdLocal(form.startDate));
          onClose();
          return;
        } catch (fallbackError) {
          setSaving(false);
          Alert.alert('Unable to save event', fallbackError?.message || 'Please try again.');
          return;
        }
      }
      setSaving(false);
      Alert.alert('Unable to save event', error?.message || 'Please try again.');
    }
  }

  function handleDelete() {
    if (!editingEvent?.id) return;
    recordParentActivity();
    Alert.alert('Delete event?', 'This will permanently remove the selected calendar item.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              await db.transact(
                appendCalendarHistoryTransactions([tx.calendarItems[editingEvent.id].delete()], {
                  occurredAt: new Date().toISOString(),
                  actionType: 'calendar_event_deleted',
                  summary: `Deleted event "${editingEvent?.title || 'Untitled event'}"`,
                  calendarItemId: editingEvent.id,
                  title: editingEvent?.title || 'Untitled event',
                  beforeSnapshot: buildCalendarHistorySnapshot(editingEvent),
                })
              );
              onClose();
            } catch (error) {
              setSaving(false);
              Alert.alert('Unable to delete event', error?.message || 'Please try again.');
            }
          })();
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} presentationStyle="overFullScreen">
      <View style={s.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
          style={s.kvLayer}
        >
          <Pressable style={s.scrim} onPress={onClose} />
          <View style={s.sheet}>
            <View style={s.handle} />

            <View style={s.header}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.title}>{editingEvent?.id ? 'Edit Event' : 'Add Event'}</Text>
                <Text style={s.subtitle}>
                  {isEditingImportedEvent
                    ? canEditEvents
                      ? 'Apple-synced — changes stay local until next sync.'
                      : 'Apple-synced events can be edited in parent mode.'
                    : canEditEvents
                      ? 'All-day events use exclusive end dates.'
                      : 'Read only in kid mode.'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close event editor"
                onPress={onClose}
                style={s.closeBtn}
              >
                <Text style={s.closeBtnText}>Close</Text>
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[s.form, keyboardVisible && s.formKeyboardOpen]}
              showsVerticalScrollIndicator={false}
            >
              {/* Title */}
              <View style={s.fieldBlock}>
                <Text style={s.fieldLabel}>Title</Text>
                <TextInput
                  accessibilityLabel="Calendar event title"
                  value={form.title}
                  editable={canEditEventDetails}
                  onChangeText={(value) => handleChange('title', value)}
                  placeholder="Family dinner"
                  placeholderTextColor={E.inkMuted}
                  style={[s.input, !canEditEventDetails && s.inputDisabled]}
                  onFocus={recordParentActivity}
                />
              </View>

              {/* Description */}
              <View style={s.fieldBlock}>
                <Text style={s.fieldLabel}>Description</Text>
                <TextInput
                  accessibilityLabel="Calendar event description"
                  value={form.description}
                  editable={canEditEventDetails}
                  onChangeText={(value) => handleChange('description', value)}
                  placeholder="Optional details"
                  placeholderTextColor={E.inkMuted}
                  style={[s.input, s.textArea, !canEditEventDetails && s.inputDisabled]}
                  multiline
                  textAlignVertical="top"
                  onFocus={recordParentActivity}
                />
              </View>

              {/* Tags */}
              <View style={s.fieldBlock}>
                <View style={s.fieldLabelRow}>
                  <Text style={s.fieldLabel}>Tags</Text>
                  <Text style={s.fieldMeta}>Reusable labels for filtering</Text>
                </View>
                {form.tags?.length ? (
                  <View style={s.tagRow}>
                    {form.tags.map((tag) => (
                      <Pressable
                        key={tag.normalizedName}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove tag ${tag.name}`}
                        disabled={!canEditEventTags}
                        onPress={() => handleRemoveTag(tag.normalizedName)}
                        style={[s.tagChip, !canEditEventTags && s.tagChipDisabled]}
                      >
                        <Text style={s.tagChipText}>{tag.name}</Text>
                        {canEditEventTags ? <Text style={s.tagChipDismiss}>×</Text> : null}
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={s.fieldHint}>No tags yet. Add labels to keep related events easy to find.</Text>
                )}
                <View style={s.tagComposerRow}>
                  <TextInput
                    accessibilityLabel="Calendar event tags"
                    value={form.tagDraft}
                    editable={canEditEventTags}
                    onChangeText={handleTagDraftChange}
                    onSubmitEditing={handleAddTagDraft}
                    placeholder="School, travel, birthday"
                    placeholderTextColor={E.inkMuted}
                    style={[s.input, s.tagInput, !canEditEventTags && s.inputDisabled]}
                    autoCapitalize="words"
                    autoCorrect={false}
                    returnKeyType="done"
                    blurOnSubmit={false}
                    onFocus={recordParentActivity}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add tag"
                    disabled={!canEditEventTags}
                    onPress={handleAddTagDraft}
                    style={[s.tagAddBtn, !canEditEventTags && s.tagAddBtnDisabled]}
                  >
                    <Text style={[s.tagAddBtnText, !canEditEventTags && s.textDisabled]}>Add</Text>
                  </Pressable>
                </View>
                {tagSuggestions.length ? (
                  <View style={s.tagSuggestionRow}>
                    {tagSuggestions.map((tag) => (
                      <Pressable
                        key={`sug-${tag.normalizedName}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Use tag ${tag.name}`}
                        disabled={!canEditEventTags}
                        onPress={() => addTagsToForm([tag])}
                        style={[s.tagSuggestion, !canEditEventTags && s.tagChipDisabled]}
                      >
                        <Text style={s.tagSuggestionText}>{tag.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <Text style={s.fieldHint}>Type a label and tap Add, or separate with commas.</Text>
              </View>

              {/* All-day toggle */}
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: !!form.isAllDay, disabled: !canEditEventDetails }}
                disabled={!canEditEventDetails}
                onPress={() => handleChange('isAllDay', !form.isAllDay)}
                style={[s.switchRow, !canEditEventDetails && s.switchRowDisabled]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.switchTitle}>All-day event</Text>
                  <Text style={s.switchMeta}>{form.isAllDay ? 'Date-only event' : 'Timed event with local timezone'}</Text>
                </View>
                <Switch
                  value={!!form.isAllDay}
                  onValueChange={(value) => handleChange('isAllDay', value)}
                  disabled={!canEditEventDetails}
                  trackColor={{ false: E.border, true: E.ok }}
                  thumbColor={E.white}
                />
              </Pressable>

              {/* Dates */}
              <View style={s.inlineRow}>
                <View style={[s.fieldBlock, s.inlineField]}>
                  <Text style={s.fieldLabel}>Start Date</Text>
                  <TextInput
                    accessibilityLabel="Event start date"
                    value={form.startDate}
                    editable={canEditEventDetails}
                    onChangeText={(value) => handleChange('startDate', value)}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={E.inkMuted}
                    style={[s.input, !canEditEventDetails && s.inputDisabled]}
                    keyboardType="numbers-and-punctuation"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={recordParentActivity}
                  />
                </View>
                <View style={[s.fieldBlock, s.inlineField]}>
                  <Text style={s.fieldLabel}>{form.isAllDay ? 'End Date (inclusive)' : 'End Date'}</Text>
                  <TextInput
                    accessibilityLabel="Event end date"
                    value={form.endDate}
                    editable={canEditEventDetails}
                    onChangeText={(value) => handleChange('endDate', value)}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={E.inkMuted}
                    style={[s.input, !canEditEventDetails && s.inputDisabled]}
                    keyboardType="numbers-and-punctuation"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={recordParentActivity}
                  />
                </View>
              </View>

              {/* Times */}
              {!form.isAllDay ? (
                <View style={s.inlineRow}>
                  <View style={[s.fieldBlock, s.inlineField]}>
                    <Text style={s.fieldLabel}>Start Time</Text>
                    <TextInput
                      accessibilityLabel="Event start time"
                      value={form.startTime}
                      editable={canEditEventDetails}
                      onChangeText={(value) => handleChange('startTime', value)}
                      placeholder="HH:mm"
                      placeholderTextColor={E.inkMuted}
                      style={[s.input, !canEditEventDetails && s.inputDisabled]}
                      keyboardType="numbers-and-punctuation"
                      autoCapitalize="none"
                      autoCorrect={false}
                      onFocus={recordParentActivity}
                    />
                  </View>
                  <View style={[s.fieldBlock, s.inlineField]}>
                    <Text style={s.fieldLabel}>End Time</Text>
                    <TextInput
                      accessibilityLabel="Event end time"
                      value={form.endTime}
                      editable={canEditEventDetails}
                      onChangeText={(value) => handleChange('endTime', value)}
                      placeholder="HH:mm"
                      placeholderTextColor={E.inkMuted}
                      style={[s.input, !canEditEventDetails && s.inputDisabled]}
                      keyboardType="numbers-and-punctuation"
                      autoCapitalize="none"
                      autoCorrect={false}
                      onFocus={recordParentActivity}
                    />
                  </View>
                </View>
              ) : null}

              {/* Actions */}
              <View style={s.actions}>
                {editingEvent?.id ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Delete calendar event"
                    disabled={saving}
                    onPress={handleDelete}
                    style={[s.deleteBtn, (saving || !canEditEvents) && s.btnDisabled]}
                  >
                    <Text style={[s.deleteBtnText, (saving || !canEditEvents) && s.textDisabled]}>Delete</Text>
                  </Pressable>
                ) : (
                  <View />
                )}

                <View style={s.actionsRight}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cancel event editing"
                    onPress={onClose}
                    style={s.cancelBtn}
                  >
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Save calendar event"
                    disabled={saving}
                    onPress={() => { void handleSave(); }}
                    style={[s.saveBtn, saving && s.btnDisabled, !canEditEvents && s.saveBtnLocked]}
                  >
                    <Text style={[s.saveBtnText, (saving || !canEditEvents) && s.textDisabled]}>
                      {saving ? 'Saving…' : canEditEvents ? (editingEvent?.id ? 'Save' : 'Create') : 'Parent Login'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop:  { flex: 1, backgroundColor: 'rgba(17,17,17,0.35)', justifyContent: 'flex-end' },
  kvLayer:   { flex: 1, justifyContent: 'flex-end' },
  scrim:     { flex: 1 },
  sheet:     { maxHeight: '88%', backgroundColor: E.bg, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, borderWidth: 1, borderColor: E.border, paddingHorizontal: SP.lg, paddingTop: SP.sm, paddingBottom: SP.lg, gap: SP.sm },
  handle:    { alignSelf: 'center', width: 40, height: 4, borderRadius: R.pill, backgroundColor: E.border, marginBottom: 4 },

  header:      { flexDirection: 'row', alignItems: 'flex-start', gap: SP.sm },
  title:       { fontFamily: 'serif', color: E.ink, fontWeight: '700', fontSize: 20, lineHeight: 26 },
  subtitle:    { color: E.inkMuted, fontSize: 12, fontWeight: '300', lineHeight: 17 },
  closeBtn:    { borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, paddingHorizontal: 12, paddingVertical: 7 },
  closeBtnText:{ color: E.inkSub, fontWeight: '500', fontSize: 13 },

  form:            { gap: SP.md, paddingBottom: SP.lg },
  formKeyboardOpen:{ paddingBottom: SP.xxl },

  fieldBlock:   { gap: 6 },
  fieldLabelRow:{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: SP.sm },
  fieldLabel:   { color: E.inkMuted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  fieldMeta:    { color: E.inkMuted, fontSize: 11, fontWeight: '300' },
  fieldHint:    { color: E.inkMuted, fontSize: 12, fontWeight: '300', lineHeight: 17 },

  input:        { borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, borderRadius: R.md, paddingHorizontal: SP.sm, paddingVertical: 11, color: E.ink, fontSize: 15 },
  textArea:     { minHeight: 88, paddingTop: 10 },
  inputDisabled:{ backgroundColor: E.bg, color: E.inkMuted },

  tagRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs },
  tagChip:          { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, paddingHorizontal: 10, paddingVertical: 5 },
  tagChipDisabled:  { opacity: 0.55 },
  tagChipText:      { color: E.ink, fontSize: 12, fontWeight: '500' },
  tagChipDismiss:   { color: E.inkMuted, fontSize: 14, fontWeight: '400', lineHeight: 16 },
  tagComposerRow:   { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  tagInput:         { flex: 1 },
  tagAddBtn:        { borderRadius: R.md, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, paddingHorizontal: 14, paddingVertical: 11 },
  tagAddBtnDisabled:{ opacity: 0.55 },
  tagAddBtnText:    { color: E.ink, fontWeight: '600', fontSize: 13 },
  tagSuggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs },
  tagSuggestion:    { borderRadius: R.pill, borderWidth: 1, borderColor: E.borderLight, backgroundColor: E.bg, paddingHorizontal: 10, paddingVertical: 5 },
  tagSuggestionText:{ color: E.inkMuted, fontSize: 12, fontWeight: '400' },

  switchRow:        { flexDirection: 'row', alignItems: 'center', gap: SP.md, borderWidth: 1, borderColor: E.border, borderRadius: R.md, backgroundColor: E.bgDeep, padding: SP.md },
  switchRowDisabled:{ backgroundColor: E.bg },
  switchTitle:      { color: E.ink, fontWeight: '600', fontSize: 15 },
  switchMeta:       { color: E.inkMuted, fontSize: 12, fontWeight: '300', marginTop: 2 },

  inlineRow:  { flexDirection: 'row', gap: SP.sm },
  inlineField:{ flex: 1 },

  actions:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SP.sm, paddingTop: SP.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: E.borderLight },
  actionsRight: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  deleteBtn:    { borderRadius: R.pill, borderWidth: 1, borderColor: E.dangerBorder, backgroundColor: E.dangerBg, paddingHorizontal: 14, paddingVertical: 9 },
  deleteBtnText:{ color: E.dangerText, fontWeight: '600', fontSize: 13 },
  cancelBtn:    { borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, paddingHorizontal: 14, paddingVertical: 9 },
  cancelBtnText:{ color: E.inkSub, fontWeight: '500', fontSize: 13 },
  saveBtn:      { borderRadius: R.pill, borderWidth: 1, borderColor: E.ink, backgroundColor: E.ink, paddingHorizontal: 18, paddingVertical: 9 },
  saveBtnLocked:{ borderColor: E.border, backgroundColor: E.bgDeep },
  saveBtnText:  { color: E.white, fontWeight: '600', fontSize: 13 },
  btnDisabled:  { opacity: 0.5 },
  textDisabled: { color: E.inkMuted },
});
