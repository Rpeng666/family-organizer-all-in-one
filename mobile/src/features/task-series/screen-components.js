import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { id, tx } from '@instantdb/react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { E, SP, R } from '../../theme/E';
import { AttachmentPreviewModal } from '../../components/AttachmentPreviewModal';
import {
  captureCameraImage,
  captureCameraVideo,
  createRecordedAudioAttachment,
  pickAttachmentDocuments,
  pickLibraryMedia,
  uploadPendingAttachments,
} from '../../lib/attachments';
import { RichTextHtmlEditor } from './RichTextHtmlEditor';
import { clearTaskUpdateDraft, loadTaskUpdateDraft, saveTaskUpdateDraft } from './drafts';
import { buildTaskUpdateTransactions, validateUpdateSubmission } from '../../../../lib/task-update-mutations';
import {
  getTaskHistoryEntries,
  getLatestTaskResponseThread,
  getTaskResponseSubmissions,
  getTaskUpdateActorName,
  getTaskUpdateAffectedName,
  getTaskUpdateFeedbackReplies,
  getTaskUpdateReplyToId,
  getTaskStatusLabel,
  getTaskWorkflowState,
  getTaskProgressPlaceholder,
  sortTaskUpdates,
  taskUpdateHasMeaningfulFeedbackContent,
  taskUpdateHasStateTransition,
} from '../../../../lib/task-progress';
import { formatGradeDisplay } from '../../../../lib/grade-utils';
import { RESPONSE_FIELD_TYPE_LABELS } from '../../../../lib/task-response-types';
import { getTaskUpdateStateLabel } from '../../../../lib/task-update-ui';
import {
  firstRef,
  formatTimestamp,
  stripHtml,
  resolveField,
  resolveGradeType,
  parseDateKey,
  buildTaskStatusOptions,
  getDefaultParentPanelMode,
} from './screen-utils';

// ─── StatusPill ───────────────────────────────────────────────────────────────

export function StatusPill({ label, tone = 'neutral' }) {
  const bg =
    tone === 'success' ? E.okBg
    : tone === 'warning' ? E.warnBg
    : tone === 'danger'  ? E.dangerBg
    : tone === 'accent'  ? 'rgba(200,184,156,0.15)'
    : E.surface;
  const border =
    tone === 'success' ? E.okBorder
    : tone === 'warning' ? E.warnBorder
    : tone === 'danger'  ? E.dangerBorder
    : tone === 'accent'  ? E.border
    : E.border;
  const color =
    tone === 'success' ? E.ok
    : tone === 'warning' ? E.warn
    : tone === 'danger'  ? E.danger
    : tone === 'accent'  ? E.inkSub
    : E.inkMuted;

  return (
    <View style={[sc.pill, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[sc.pillText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── AttachmentChips ──────────────────────────────────────────────────────────

export function AttachmentChips({ attachments, onOpen }) {
  if (!attachments?.length) return null;
  return (
    <View style={sc.attachRow}>
      {attachments.map((a) => (
        <Pressable
          key={a.id || a.url}
          accessibilityRole="button"
          accessibilityLabel={`Open ${a.name || 'attachment'}`}
          onPress={() => onOpen?.(a)}
          style={sc.attachChip}
        >
          <Text style={sc.attachChipText}>{a.name || 'Attachment'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── ResponseFieldValueSummary ────────────────────────────────────────────────

export function ResponseFieldValueSummary({ entry, onOpenAttachment }) {
  const values = (entry?.responseFieldValues || []).filter((v) => {
    return !!stripHtml(v.richTextContent) || !!v.fileUrl;
  });
  if (!values.length) return null;

  return (
    <View style={{ gap: SP.sm }}>
      {values.map((v, i) => {
        const field = resolveField(v.field);
        const label = field?.label || 'Response';
        return (
          <View key={v.id || `${label}-${i}`} style={sc.fieldCard}>
            <Text style={sc.eyebrow}>{label}</Text>
            {stripHtml(v.richTextContent) ? (
              <Text style={sc.body}>{stripHtml(v.richTextContent)}</Text>
            ) : null}
            {v.fileUrl ? (
              <AttachmentChips
                attachments={[{
                  id: v.id || `response-${i}`,
                  name: v.fileName || 'Response file',
                  type: v.fileType || '',
                  url: v.fileUrl,
                  thumbnailUrl: v.thumbnailUrl || null,
                }]}
                onOpen={onOpenAttachment}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

// ─── FeedbackReplies ──────────────────────────────────────────────────────────

export function FeedbackReplies({ replies, onOpenAttachment }) {
  const visibleReplies = getTaskUpdateFeedbackReplies(replies);
  if (!visibleReplies.length) return null;

  return (
    <View style={{ gap: SP.sm }}>
      {visibleReplies.map((reply) => {
        const gradeType = resolveGradeType(reply);
        const gradeLabel =
          reply.gradeNumericValue != null
            ? gradeType
              ? formatGradeDisplay(reply.gradeNumericValue, gradeType)
              : reply.gradeDisplayValue || String(reply.gradeNumericValue)
            : reply.gradeDisplayValue || '';
        const toState = reply.toState ? getTaskStatusLabel(reply.toState) : null;
        const fromState = reply.fromState ? getTaskStatusLabel(reply.fromState) : null;
        const hasStateTransition = taskUpdateHasStateTransition(reply);

        return (
          <View key={reply.id} style={sc.accentCard}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs }}>
              {getTaskUpdateActorName(reply) ? (
                <Text style={sc.accentName}>{getTaskUpdateActorName(reply)}</Text>
              ) : null}
              {reply.createdAt ? (
                <Text style={sc.metaText}>{formatTimestamp(reply.createdAt)}</Text>
              ) : null}
            </View>
            {hasStateTransition && toState ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs, alignItems: 'center' }}>
                <StatusPill
                  label={toState}
                  tone={reply.toState === 'done' ? 'success' : reply.toState === 'needs_review' ? 'warning' : reply.toState === 'blocked' ? 'danger' : reply.toState === 'in_progress' ? 'accent' : 'neutral'}
                />
                {fromState && fromState !== toState ? (
                  <Text style={sc.metaText}>from {fromState}</Text>
                ) : null}
              </View>
            ) : null}
            {gradeLabel ? <Text style={sc.gradeText}>Grade: {gradeLabel}</Text> : null}
            {reply.note ? <Text style={sc.body}>{reply.note}</Text> : null}
            <AttachmentChips attachments={reply.attachments || []} onOpen={onOpenAttachment} />
          </View>
        );
      })}
    </View>
  );
}

// ─── UpdateHistoryList ────────────────────────────────────────────────────────

export function UpdateHistoryList({ task, onOpenAttachment }) {
  const updates = getTaskHistoryEntries(task?.updates || []);
  const updatesById = new Map((task?.updates || []).map((e) => [e.id, e]));

  if (!updates.length) {
    return (
      <View style={sc.emptyBox}>
        <Text style={sc.metaText}>No saved task updates yet.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: SP.sm }}>
      {updates.map((entry) => {
        const gradeType = resolveGradeType(entry);
        const gradeLabel =
          entry.gradeNumericValue != null
            ? gradeType
              ? formatGradeDisplay(entry.gradeNumericValue, gradeType)
              : entry.gradeDisplayValue || String(entry.gradeNumericValue)
            : entry.gradeDisplayValue || '';
        const replyToId = getTaskUpdateReplyToId(entry);
        const replyTarget = replyToId ? updatesById.get(replyToId) || null : null;
        const replyTargetActorName = getTaskUpdateActorName(replyTarget);
        const isStatusOnlyReply = !!replyToId && !taskUpdateHasMeaningfulFeedbackContent(entry);
        const fromState = entry.fromState ? getTaskStatusLabel(entry.fromState) : null;
        const toState = entry.toState ? getTaskStatusLabel(entry.toState) : getTaskStatusLabel('not_started');

        return (
          <View key={entry.id} style={sc.historyCard}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs }}>
              {replyToId && !isStatusOnlyReply ? <StatusPill label="Feedback" tone="accent" /> : null}
              <StatusPill
                label={toState}
                tone={entry.toState === 'done' ? 'success' : entry.toState === 'needs_review' ? 'warning' : entry.toState === 'blocked' ? 'danger' : entry.toState === 'in_progress' ? 'accent' : 'neutral'}
              />
              {fromState && toState && fromState !== toState ? (
                <Text style={sc.metaText}>from {fromState}</Text>
              ) : null}
              {getTaskUpdateActorName(entry) ? (
                <Text style={sc.metaText}>by {getTaskUpdateActorName(entry)}</Text>
              ) : null}
              {getTaskUpdateAffectedName(entry) && getTaskUpdateAffectedName(entry) !== getTaskUpdateActorName(entry) ? (
                <Text style={sc.metaText}>for {getTaskUpdateAffectedName(entry)}</Text>
              ) : null}
              {replyTargetActorName && !isStatusOnlyReply ? (
                <Text style={sc.metaText}>on {replyTargetActorName}'s response</Text>
              ) : null}
              {entry.createdAt ? (
                <Text style={sc.metaText}>{formatTimestamp(entry.createdAt)}</Text>
              ) : null}
            </View>
            {gradeLabel ? <Text style={sc.gradeText}>Grade: {gradeLabel}</Text> : null}
            {entry.note ? <Text style={sc.body}>{entry.note}</Text> : null}
            <ResponseFieldValueSummary entry={entry} onOpenAttachment={onOpenAttachment} />
            <AttachmentChips attachments={entry.attachments || []} onOpen={onOpenAttachment} />
            {!replyToId ? (
              <FeedbackReplies replies={entry.replies} onOpenAttachment={onOpenAttachment} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

// ─── FieldFileButtons ─────────────────────────────────────────────────────────

export function FieldFileButtons({ type, onPickDocument, onPickLibrary, onCapturePhoto, onCaptureVideo }) {
  const buttons =
    type === 'photo'
      ? [{ key: 'library', label: 'Library', onPress: onPickLibrary }, { key: 'camera', label: 'Camera', onPress: onCapturePhoto }]
      : type === 'video'
      ? [{ key: 'library', label: 'Library', onPress: onPickLibrary }, { key: 'camera', label: 'Video', onPress: onCaptureVideo }]
      : [{ key: 'files', label: 'Choose File', onPress: onPickDocument }];

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm }}>
      {buttons.map((btn) => (
        <Pressable
          key={btn.key}
          accessibilityRole="button"
          accessibilityLabel={btn.label}
          onPress={() => { void btn.onPress?.(); }}
          style={sc.fileBtn}
        >
          <Text style={sc.fileBtnText}>{btn.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── TaskResponseFieldInputCard ───────────────────────────────────────────────

export function TaskResponseFieldInputCard({ field, value, onChangeValue, onOpenAttachment }) {
  async function uploadFieldFiles(files) {
    if (!files?.length) return;
    const uploaded = await uploadPendingAttachments(files, id);
    const attachment = uploaded[0];
    if (!attachment) return;
    onChangeValue(field.id, {
      fieldId: field.id,
      existingValueId: value?.existingValueId || null,
      richTextContent: value?.richTextContent || null,
      fileUrl: attachment.url,
      fileName: attachment.name,
      fileType: attachment.type,
      fileSizeBytes: attachment.sizeBytes ?? null,
      thumbnailUrl: attachment.thumbnailUrl || null,
    });
  }

  async function pickDocument() { await uploadFieldFiles((await pickAttachmentDocuments()).slice(0, 1)); }
  async function pickLibrary() {
    const files = (await pickLibraryMedia()).filter((f) =>
      field.type === 'photo' ? f.kind === 'image' : field.type === 'video' ? f.kind === 'video' : true
    );
    await uploadFieldFiles(files.slice(0, 1));
  }
  async function capturePhoto() { await uploadFieldFiles((await captureCameraImage()).slice(0, 1)); }
  async function captureVideo() { await uploadFieldFiles((await captureCameraVideo()).slice(0, 1)); }

  return (
    <View style={sc.fieldCard}>
      <View style={{ gap: 4 }}>
        <Text style={sc.fieldLabel}>{field.label || 'Response'}{field.required ? ' *' : ''}</Text>
        {field.description ? <Text style={sc.metaText}>{field.description}</Text> : null}
      </View>
      {field.type === 'rich_text' ? (
        <RichTextHtmlEditor
          value={value?.richTextContent || ''}
          onChange={(content) =>
            onChangeValue(field.id, {
              fieldId: field.id,
              existingValueId: value?.existingValueId || null,
              richTextContent: content,
              fileUrl: value?.fileUrl || null,
              fileName: value?.fileName || null,
              fileType: value?.fileType || null,
            })
          }
        />
      ) : value?.fileUrl ? (
        <View style={{ gap: SP.sm }}>
          <AttachmentChips
            attachments={[{
              id: value.existingValueId || field.id,
              name: value.fileName || RESPONSE_FIELD_TYPE_LABELS[field.type] || 'Response file',
              type: value.fileType || '',
              url: value.fileUrl,
              thumbnailUrl: value.thumbnailUrl || null,
            }]}
            onOpen={onOpenAttachment}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm }}>
            <FieldFileButtons type={field.type} onPickDocument={pickDocument} onPickLibrary={pickLibrary} onCapturePhoto={capturePhoto} onCaptureVideo={captureVideo} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Clear ${field.label}`}
              onPress={() =>
                onChangeValue(field.id, {
                  fieldId: field.id,
                  existingValueId: value?.existingValueId || null,
                  richTextContent: value?.richTextContent || null,
                  fileUrl: null,
                  fileName: null,
                  fileType: null,
                  thumbnailUrl: null,
                })
              }
              style={sc.removeBtn}
            >
              <Text style={sc.removeBtnText}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <FieldFileButtons type={field.type} onPickDocument={pickDocument} onPickLibrary={pickLibrary} onCapturePhoto={capturePhoto} onCaptureVideo={captureVideo} />
      )}
    </View>
  );
}

// ─── TaskUpdateComposerCard ───────────────────────────────────────────────────

export function TaskUpdateComposerCard({ db, task, series, chore, allTasks, selectedDateKey, currentUser, gradeTypes, onSaved }) {
  const isParentReviewer = currentUser?.role === 'parent';
  const owner = firstRef(series?.familyMember);
  const currentState = getTaskWorkflowState(task);
  const submissions = useMemo(() => getTaskResponseSubmissions(task?.updates || []), [task?.updates]);
  const canShowFeedbackMode = isParentReviewer && submissions.length > 0;
  const [parentPanelMode, setParentPanelMode] = useState(getDefaultParentPanelMode(currentState, canShowFeedbackMode));
  const reviewMode = canShowFeedbackMode && parentPanelMode === 'feedback';
  const [selectedSubmissionIndex, setSelectedSubmissionIndex] = useState(0);
  const [noteMode, setNoteMode] = useState('feedback');
  const [selectedState, setSelectedState] = useState(getTaskWorkflowState(task));
  const [note, setNote] = useState('');
  const [showGrade, setShowGrade] = useState(false);
  const [gradeValue, setGradeValue] = useState('');
  const [selectedGradeTypeId, setSelectedGradeTypeId] = useState(gradeTypes?.[0]?.id || null);
  const [fieldValues, setFieldValues] = useState({});
  const [files, setFiles] = useState([]);
  const [restoreTiming, setRestoreTiming] = useState(null);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const draftTimerRef = useRef(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const audioRecorderState = useAudioRecorderState(audioRecorder, 200);
  const latestUpdate = useMemo(
    () => sortTaskUpdates((task?.updates || []).filter((e) => !e.isDraft))[0] || null,
    [task?.updates]
  );
  const selectedSubmission = reviewMode ? submissions[selectedSubmissionIndex] || null : null;
  const ownerName = owner?.name || 'Task owner';

  useEffect(() => {
    setParentPanelMode(getDefaultParentPanelMode(currentState, canShowFeedbackMode));
  }, [task?.id, currentState, canShowFeedbackMode]);

  useEffect(() => {
    if (selectedSubmissionIndex < submissions.length) return;
    setSelectedSubmissionIndex(0);
  }, [selectedSubmissionIndex, submissions.length]);

  useEffect(() => {
    let cancelled = false;
    async function hydrateDraft() {
      const draft = await loadTaskUpdateDraft(task?.id);
      if (cancelled || !draft) return;
      if (draft.selectedState) setSelectedState(draft.selectedState);
      if (typeof draft.note === 'string') setNote(draft.note);
      if (typeof draft.gradeValue === 'string') setGradeValue(draft.gradeValue);
      if (draft.selectedGradeTypeId) setSelectedGradeTypeId(draft.selectedGradeTypeId);
      setShowGrade(!!draft.showGrade);
      if (draft.noteMode) setNoteMode(draft.noteMode);
      if (draft.fieldValues && typeof draft.fieldValues === 'object') {
        setFieldValues((c) => ({ ...c, ...draft.fieldValues }));
      }
    }

    setSelectedState(getTaskWorkflowState(task));
    setNote('');
    setShowGrade(false);
    setGradeValue('');
    setSelectedGradeTypeId(gradeTypes?.[0]?.id || null);
    setNoteMode('feedback');
    setParentPanelMode(getDefaultParentPanelMode(getTaskWorkflowState(task), isParentReviewer && submissions.length > 0));
    setFiles([]);
    setRestoreTiming(null);
    setSelectedSubmissionIndex(0);

    const initialValues = {};
    for (const v of latestUpdate?.responseFieldValues || []) {
      const field = resolveField(v.field);
      if (!field?.id) continue;
      initialValues[field.id] = {
        fieldId: field.id,
        existingValueId: v.id,
        richTextContent: v.richTextContent || null,
        fileUrl: v.fileUrl || null,
        fileName: v.fileName || null,
        fileType: v.fileType || null,
        thumbnailUrl: v.thumbnailUrl || null,
      };
    }
    setFieldValues(initialValues);
    void hydrateDraft();
    return () => { cancelled = true; };
  }, [gradeTypes, isParentReviewer, latestUpdate, submissions.length, task]);

  useEffect(() => {
    const hasDraft =
      (note || '').trim().length > 0 ||
      selectedState !== getTaskWorkflowState(task) ||
      showGrade ||
      (gradeValue || '').trim().length > 0 ||
      Object.values(fieldValues).some((v) => !!stripHtml(v?.richTextContent) || !!v?.fileUrl);

    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    if (!hasDraft) { void clearTaskUpdateDraft(task?.id); return undefined; }

    draftTimerRef.current = setTimeout(() => {
      void saveTaskUpdateDraft(task?.id, { selectedState, note, showGrade, gradeValue, selectedGradeTypeId, noteMode, fieldValues, savedAt: Date.now() });
    }, 600);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [fieldValues, gradeValue, note, noteMode, selectedGradeTypeId, selectedState, showGrade, task]);

  const selectedGradeType = (gradeTypes || []).find((g) => g.id === selectedGradeTypeId) || null;
  const filledFieldIds = useMemo(() => {
    const ids = new Set();
    Object.values(fieldValues).forEach((v) => {
      if (!!stripHtml(v.richTextContent) || !!v.fileUrl) ids.add(v.fieldId);
    });
    return ids;
  }, [fieldValues]);

  const validation = useMemo(
    () => validateUpdateSubmission({
      toState: selectedState,
      requiredResponseFields: (task?.responseFields || []).filter((f) => f.required),
      filledFieldIds,
      isParentReviewingExistingSubmission: isParentReviewer,
    }),
    [filledFieldIds, isParentReviewer, selectedState, task?.responseFields]
  );

  async function pickEvidenceFiles() { const p = await pickAttachmentDocuments(); if (p.length) setFiles((c) => [...c, ...p]); }
  async function pickEvidenceLibrary() { const p = await pickLibraryMedia(); if (p.length) setFiles((c) => [...c, ...p]); }
  async function captureEvidencePhoto() { const p = await captureCameraImage(); if (p.length) setFiles((c) => [...c, ...p]); }
  async function captureEvidenceVideo() { const p = await captureCameraVideo(); if (p.length) setFiles((c) => [...c, ...p]); }

  async function toggleAudioRecording() {
    if (audioRecorderState.isRecording) {
      try {
        await audioRecorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        const recordedFile = createRecordedAudioAttachment({ uri: audioRecorder.uri || audioRecorderState.uri, durationMillis: audioRecorderState.durationMillis });
        if (recordedFile?.uri) setFiles((c) => [...c, recordedFile]);
      } catch (err) { Alert.alert('Unable to stop recording', err?.message || 'Please try again.'); }
      return;
    }
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) { Alert.alert('Microphone required', 'Allow microphone access to record audio evidence.'); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (err) { Alert.alert('Unable to record audio', err?.message || 'Please try again.'); }
  }

  async function handleSubmit() {
    if (!currentUser?.id) { Alert.alert('Login required', 'Choose a family member before updating task status.'); return; }
    if (validation && !validation.valid) return;

    const nextState = validation?.routedState || selectedState;
    const replyToUpdateId = reviewMode && noteMode === 'feedback' && selectedSubmission?.update?.id ? selectedSubmission.update.id : null;
    const grade = showGrade && selectedGradeType && Number.isFinite(Number(gradeValue))
      ? { numericValue: Number(gradeValue), displayValue: gradeValue, gradeTypeId: selectedGradeType.id, isProvisional: false }
      : null;

    setIsSaving(true);
    try {
      const attachments = files.length ? await uploadPendingAttachments(files, id) : [];
      const { transactions } = buildTaskUpdateTransactions({
        tx, createId: id, taskId: task.id, allTasks, nextState, selectedDateKey,
        note: note.trim() || undefined,
        actorFamilyMemberId: currentUser.id,
        affectedFamilyMemberId: owner?.id || currentUser.id,
        restoreTiming,
        schedule: chore ? { startDate: chore.startDate, rrule: chore.rrule || null, exdates: chore.exdates || null } : null,
        referenceDate: parseDateKey(selectedDateKey),
        attachments, responseFieldValues: Object.values(fieldValues), grade,
        taskSeriesId: series?.id || null, choreId: chore?.id || null, replyToUpdateId,
      });
      await db.transact(transactions);
    } catch (err) {
      try { await onSaved?.(err); } catch { /* no-op */ }
      Alert.alert('Unable to update task', err?.message || 'Please try again.');
      setIsSaving(false);
      return;
    }

    await clearTaskUpdateDraft(task.id);
    setFiles([]);
    setNote('');
    setShowGrade(false);
    setGradeValue('');
    setRestoreTiming(null);
    onSaved?.();
    setIsSaving(false);
  }

  function onChangeFieldValue(fieldId, nextValue) {
    setFieldValues((c) => ({ ...c, [fieldId]: nextValue }));
  }

  const latestResponseThread = getLatestTaskResponseThread(task);

  return (
    <View style={{ gap: SP.md }}>
      {/* Panel mode toggle (parent only) */}
      {canShowFeedbackMode ? (
        <View style={{ flexDirection: 'row', gap: SP.sm }}>
          {[{ key: 'response', label: 'Submit response' }, { key: 'feedback', label: 'Feedback on previous response' }].map((mode) => {
            const active = parentPanelMode === mode.key;
            return (
              <Pressable key={mode.key} accessibilityRole="button" accessibilityLabel={mode.label} onPress={() => setParentPanelMode(mode.key)}
                style={[sc.modeBtn, active && sc.modeBtnActive, { flex: 1 }]}>
                <Text style={[sc.modeBtnText, active && sc.modeBtnTextActive]}>{mode.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* Review mode sub-panel */}
      {reviewMode ? (
        <View style={{ gap: SP.sm }}>
          <View style={{ flexDirection: 'row', gap: SP.sm }}>
            {['feedback', 'general'].map((mode) => {
              const active = noteMode === mode;
              return (
                <Pressable key={mode} accessibilityRole="button" onPress={() => setNoteMode(mode)}
                  style={[sc.modeBtn, active && sc.modeBtnActive, { flex: 1 }]}>
                  <Text style={[sc.modeBtnText, active && sc.modeBtnTextActive]}>
                    {mode === 'feedback' ? 'Feedback on a response' : 'General task update'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {noteMode === 'feedback' && selectedSubmission ? (
            <View style={sc.accentCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SP.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={sc.accentName}>{`${getTaskUpdateActorName(selectedSubmission.update) || ownerName}'s response`}</Text>
                  {selectedSubmission.update.createdAt ? <Text style={sc.metaText}>{formatTimestamp(selectedSubmission.update.createdAt)}</Text> : null}
                </View>
                {submissions.length > 1 ? (
                  <View style={{ flexDirection: 'row', gap: SP.sm }}>
                    <Pressable onPress={() => setSelectedSubmissionIndex((i) => Math.max(0, i - 1))} style={{ paddingHorizontal: SP.sm, paddingVertical: SP.xs }}>
                      <Text style={sc.accentName}>Prev</Text>
                    </Pressable>
                    <Pressable onPress={() => setSelectedSubmissionIndex((i) => Math.min(submissions.length - 1, i + 1))} style={{ paddingHorizontal: SP.sm, paddingVertical: SP.xs }}>
                      <Text style={sc.accentName}>Next</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              {selectedSubmission.update.note ? <Text style={sc.body}>{selectedSubmission.update.note}</Text> : null}
              <ResponseFieldValueSummary entry={selectedSubmission.update} onOpenAttachment={setPreviewAttachment} />
              <AttachmentChips attachments={selectedSubmission.update.attachments || []} onOpen={setPreviewAttachment} />
              <FeedbackReplies replies={selectedSubmission.update.replies} onOpenAttachment={setPreviewAttachment} />
            </View>
          ) : null}
        </View>
      ) : latestResponseThread ? (
        <View style={sc.accentCard}>
          <Text style={sc.accentName}>Latest response</Text>
          {latestResponseThread.submission.note ? <Text style={sc.body}>{latestResponseThread.submission.note}</Text> : null}
          <ResponseFieldValueSummary entry={latestResponseThread.submission} onOpenAttachment={setPreviewAttachment} />
          <FeedbackReplies replies={latestResponseThread.feedbackReplies} onOpenAttachment={setPreviewAttachment} />
        </View>
      ) : null}

      {/* Response fields */}
      {(reviewMode ? noteMode === 'general' : true) && (task.responseFields || []).length ? (
        <View style={{ gap: SP.sm }}>
          {(task.responseFields || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map((field) => (
            <TaskResponseFieldInputCard key={field.id} field={field} value={fieldValues[field.id]} onChangeValue={onChangeFieldValue} onOpenAttachment={setPreviewAttachment} />
          ))}
        </View>
      ) : null}

      {/* Note text area */}
      <TextInput
        multiline
        value={note}
        onChangeText={setNote}
        placeholder={reviewMode && noteMode === 'feedback' ? 'Add feedback for this response…' : getTaskProgressPlaceholder(selectedState)}
        placeholderTextColor={E.inkMuted}
        style={sc.textArea}
      />

      {/* Status chips */}
      <View style={{ gap: SP.sm }}>
        <Text style={sc.eyebrow}>Status</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm }}>
          {buildTaskStatusOptions(task, isParentReviewer).map((state) => {
            const active = selectedState === state;
            const stateLabel = getTaskUpdateStateLabel(currentState, state, { isReviewMode: reviewMode });
            return (
              <Pressable key={state} accessibilityRole="button" accessibilityLabel={`Set task state to ${stateLabel}`} onPress={() => setSelectedState(state)}
                style={[sc.stateChip, active && sc.stateChipActive]}>
                <Text style={[sc.stateChipText, active && sc.stateChipTextActive]}>{stateLabel}</Text>
              </Pressable>
            );
          })}
          {isParentReviewer && gradeTypes?.length ? (
            <Pressable accessibilityRole="button" accessibilityLabel={showGrade ? 'Hide grade input' : 'Add grade'} onPress={() => setShowGrade((c) => !c)}
              style={[sc.gradeChip, showGrade && sc.gradeChipActive]}>
              <Text style={sc.gradeChipText}>{showGrade ? 'Hide grade' : 'Add grade'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Grade input */}
      {showGrade && selectedGradeType ? (
        <View style={sc.gradeBox}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SP.sm }}>
            {(gradeTypes || []).map((gt) => {
              const active = selectedGradeTypeId === gt.id;
              return (
                <Pressable key={gt.id} accessibilityRole="button" onPress={() => setSelectedGradeTypeId(gt.id)}
                  style={[sc.stateChip, active && sc.gradeChipActive]}>
                  <Text style={[sc.stateChipText, active && { color: E.ok }]}>{gt.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <TextInput
            value={gradeValue}
            onChangeText={setGradeValue}
            keyboardType="numeric"
            placeholder={`${selectedGradeType.lowValue}–${selectedGradeType.highValue}`}
            placeholderTextColor={E.inkMuted}
            style={sc.input}
          />
        </View>
      ) : null}

      {/* Restore timing */}
      {(currentState === 'blocked' || currentState === 'skipped' || currentState === 'needs_review') ? (
        <View style={{ gap: SP.sm }}>
          <Text style={sc.eyebrow}>Restore Timing</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm }}>
            {[{ key: 'now', label: 'Restore now' }, { key: 'next_scheduled', label: 'Next scheduled day' }].map((opt) => {
              const active = restoreTiming === opt.key;
              return (
                <Pressable key={opt.key} accessibilityRole="button" accessibilityLabel={opt.label} onPress={() => setRestoreTiming(opt.key)}
                  style={[sc.stateChip, active && sc.warnChipActive]}>
                  <Text style={[sc.stateChipText, active && { color: E.warn }]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Evidence */}
      <View style={{ gap: SP.sm }}>
        <Text style={sc.eyebrow}>Evidence</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SP.sm }}>
          {[
            { key: 'files', label: 'Files', onPress: pickEvidenceFiles },
            { key: 'library', label: 'Library', onPress: pickEvidenceLibrary },
            { key: 'photo', label: 'Photo', onPress: captureEvidencePhoto },
            { key: 'video', label: 'Video', onPress: captureEvidenceVideo },
            { key: 'audio', label: audioRecorderState.isRecording ? `Stop ${Math.round((audioRecorderState.durationMillis || 0) / 1000)}s` : 'Audio', onPress: toggleAudioRecording },
          ].map((action) => (
            <Pressable key={action.key} accessibilityRole="button" accessibilityLabel={`Add ${action.label}`} onPress={() => { void action.onPress?.(); }} style={sc.fileBtn}>
              <Text style={sc.fileBtnText}>{action.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {files.length ? (
          <View style={{ gap: SP.sm }}>
            {files.map((file, index) => (
              <View key={`${file.name}-${index}`} style={sc.fileRow}>
                <View style={{ flex: 1 }}>
                  <Text style={sc.fileName} numberOfLines={1}>{file.name}</Text>
                  <Text style={sc.metaText}>{file.kind || 'file'}</Text>
                </View>
                <Pressable onPress={() => setFiles((c) => c.filter((_, i) => i !== index))}>
                  <Text style={sc.removeText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <View style={sc.emptyBox}>
            <Text style={sc.metaText}>Attach photos, documents, audio, or video for this update.</Text>
          </View>
        )}
      </View>

      {/* Validation notices */}
      {validation && !validation.valid ? (
        <View style={sc.warnBox}>
          <Text style={sc.warnText}>{validation.message}</Text>
        </View>
      ) : null}
      {validation?.routedState ? (
        <View style={sc.accentBox}>
          <Text style={sc.accentBoxText}>{validation.message}</Text>
        </View>
      ) : null}

      {/* Submit */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save task update"
        disabled={isSaving || audioRecorderState.isRecording || Boolean(validation && !validation.valid)}
        onPress={() => { void handleSubmit(); }}
        style={[sc.submitBtn, (isSaving || audioRecorderState.isRecording || (validation && !validation.valid)) && { opacity: 0.5 }]}
      >
        <Text style={sc.submitBtnText}>
          {audioRecorderState.isRecording ? 'Stop recording first' : isSaving ? 'Saving…' : `Submit as ${getTaskStatusLabel(validation?.routedState || selectedState)}`}
        </Text>
      </Pressable>

      <AttachmentPreviewModal attachment={previewAttachment} visible={!!previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </View>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const sc = StyleSheet.create({
  // Pills
  pill:       { borderRadius: R.pill, borderWidth: 1, paddingHorizontal: SP.sm, paddingVertical: 4 },
  pillText:   { fontSize: 11, fontWeight: '800' },

  // Attachments
  attachRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm },
  attachChip:     { borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, paddingHorizontal: SP.md, paddingVertical: SP.xs },
  attachChipText: { color: E.ink, fontSize: 12, fontWeight: '700' },

  // Cards
  fieldCard:   { borderRadius: R.md, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.md, gap: SP.xs },
  historyCard: { borderRadius: R.md, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.md, gap: SP.xs },
  accentCard:  { borderRadius: R.md, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, padding: SP.md, gap: SP.sm },
  emptyBox:    { borderRadius: R.md, borderWidth: 1, borderColor: E.borderLight, borderStyle: 'dashed', backgroundColor: E.bgDeep, padding: SP.md },
  warnBox:     { borderRadius: R.md, borderWidth: 1, borderColor: E.warnBorder, backgroundColor: E.warnBg, padding: SP.md },
  accentBox:   { borderRadius: R.md, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, padding: SP.md },
  gradeBox:    { borderRadius: R.md, borderWidth: 1, borderColor: E.okBorder, backgroundColor: E.okBg, padding: SP.md, gap: SP.sm },

  // Typography
  eyebrow:     { color: E.inkMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  body:        { color: E.inkSub, fontSize: 13, lineHeight: 18 },
  metaText:    { color: E.inkMuted, fontSize: 12 },
  fieldLabel:  { color: E.ink, fontSize: 14, fontWeight: '800' },
  gradeText:   { color: E.ok, fontSize: 13, fontWeight: '800' },
  accentName:  { color: E.inkSub, fontSize: 12, fontWeight: '800' },
  warnText:    { color: E.warn, fontSize: 12, lineHeight: 17 },
  accentBoxText:{ color: E.inkSub, fontSize: 12, lineHeight: 17 },

  // Inputs
  input:    { minHeight: 42, borderRadius: R.md, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, color: E.ink, paddingHorizontal: SP.md, paddingVertical: SP.sm, fontSize: 14 },
  textArea: { minHeight: 110, borderRadius: R.md, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, color: E.ink, paddingHorizontal: SP.md, paddingVertical: SP.md, textAlignVertical: 'top', fontSize: 14 },

  // Mode toggles
  modeBtn:          { borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, paddingHorizontal: SP.md, paddingVertical: SP.sm, alignItems: 'center' },
  modeBtnActive:    { borderColor: E.ink, backgroundColor: E.ink },
  modeBtnText:      { color: E.inkMuted, fontWeight: '800', fontSize: 12 },
  modeBtnTextActive:{ color: E.white },

  // State chips
  stateChip:         { borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, paddingHorizontal: SP.md, paddingVertical: SP.xs },
  stateChipActive:   { borderColor: E.ink, backgroundColor: E.ink },
  stateChipText:     { color: E.inkMuted, fontSize: 12, fontWeight: '800' },
  stateChipTextActive:{ color: E.white },
  gradeChip:         { borderRadius: R.pill, borderWidth: 1, borderColor: E.okBorder, backgroundColor: E.okBg, paddingHorizontal: SP.md, paddingVertical: SP.xs },
  gradeChipActive:   { backgroundColor: 'rgba(58,122,90,0.18)' },
  gradeChipText:     { color: E.ok, fontSize: 12, fontWeight: '800' },
  warnChipActive:    { borderColor: E.warnBorder, backgroundColor: E.warnBg },

  // File buttons
  fileBtn:     { borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, paddingHorizontal: SP.md, paddingVertical: SP.xs },
  fileBtnText: { color: E.ink, fontSize: 12, fontWeight: '700' },
  removeBtn:     { borderRadius: R.pill, borderWidth: 1, borderColor: E.dangerBorder, backgroundColor: E.dangerBg, paddingHorizontal: SP.md, paddingVertical: SP.xs },
  removeBtnText: { color: E.danger, fontSize: 12, fontWeight: '700' },
  removeText:    { color: E.danger, fontSize: 12, fontWeight: '700' },
  fileRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SP.sm, borderRadius: R.md, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, paddingHorizontal: SP.md, paddingVertical: SP.sm },
  fileName:    { color: E.ink, fontSize: 13, fontWeight: '700' },

  // Submit
  submitBtn:     { borderRadius: R.pill, borderWidth: 1, borderColor: E.ink, backgroundColor: E.ink, paddingHorizontal: SP.md, paddingVertical: SP.sm, alignItems: 'center', justifyContent: 'center' },
  submitBtnText: { color: E.white, fontSize: 13, fontWeight: '800' },
});
