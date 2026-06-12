import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { id, tx } from '@instantdb/react-native';
import { useAppSession } from '../../providers/AppProviders';
import { useParentActionGate } from '../../hooks/useParentActionGate';
import { useAppTheme } from '../../theme/ThemeProvider';
import { radii, shadows, spacing, withAlpha } from '../../theme/tokens';
import { ParentAccessNotice, SubscreenScaffold } from '../../components/SubscreenScaffold';
import { AttachmentPreviewModal } from '../../components/AttachmentPreviewModal';
import { pickAttachmentDocuments, uploadPendingAttachments } from '../../lib/attachments';
import { RESPONSE_FIELD_TYPE_LABELS, RESPONSE_FIELD_TYPES } from '../../../../lib/task-response-types';
import { taskHasData } from '../../../../lib/task-data-guard';
import { openTaskHistory, openTaskSeriesChecklist, openTaskSeriesDiscussion } from './navigation';

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function firstRef(value) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
}

function toDateKey(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function createStyles(colors) {
  return StyleSheet.create({
    content: {
      gap: spacing.md,
      paddingBottom: spacing.xxl,
    },
    card: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.panelElevated,
      padding: spacing.md,
      gap: spacing.sm,
      ...shadows.card,
    },
    title: {
      color: colors.ink,
      fontSize: 16,
      fontWeight: '800',
    },
    body: {
      color: colors.inkMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    input: {
      minHeight: 42,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.panel,
      color: colors.ink,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 14,
    },
    textArea: {
      minHeight: 96,
      textAlignVertical: 'top',
    },
    chipRow: {
      gap: spacing.sm,
    },
    chip: {
      minHeight: 34,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.panel,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipActive: {
      borderColor: withAlpha(colors.accentMore, 0.28),
      backgroundColor: withAlpha(colors.accentMore, 0.12),
    },
    chipText: {
      color: colors.inkMuted,
      fontSize: 12,
      fontWeight: '800',
    },
    chipTextActive: {
      color: colors.accentMore,
    },
    button: {
      minHeight: 38,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.panel,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonPrimary: {
      backgroundColor: colors.accentMore,
      borderColor: colors.accentMore,
    },
    buttonDanger: {
      borderColor: withAlpha(colors.danger, 0.28),
      backgroundColor: withAlpha(colors.danger, 0.08),
    },
    buttonText: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: '800',
    },
    buttonTextPrimary: {
      color: colors.onAccent,
    },
    buttonTextDanger: {
      color: colors.danger,
    },
    taskCard: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.panel,
      padding: spacing.md,
      gap: spacing.sm,
    },
    fieldRow: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.panelElevated,
      padding: spacing.md,
      gap: spacing.xs,
    },
  });
}

function deriveParentIds(tasks) {
  const parentIds = {};
  const stack = [];

  for (const task of tasks) {
    if (task.isDayBreak) {
      stack.length = 0;
      parentIds[task.id] = null;
      continue;
    }

    while (stack.length && stack[stack.length - 1].indentationLevel >= task.indentationLevel) {
      stack.pop();
    }

    parentIds[task.id] = stack.length ? stack[stack.length - 1].id : null;
    stack.push({ id: task.id, indentationLevel: task.indentationLevel });
  }

  return parentIds;
}

function createLocalTask(source = {}) {
  return {
    id: source.id || id(),
    text: source.text || '',
    order: Number.isFinite(source.order) ? source.order : 0,
    indentationLevel: Number.isFinite(source.indentationLevel) ? source.indentationLevel : 0,
    isDayBreak: !!source.isDayBreak,
    notes: source.notes || '',
    specificTime: source.specificTime || '',
    overrideWorkAhead: !!source.overrideWorkAhead,
    weight: Number.isFinite(source.weight) ? source.weight : 0,
    attachments: (source.attachments || []).map((attachment) => ({ ...attachment })),
    responseFields: (source.responseFields || []).map((field) => ({ ...field })),
    updates: source.updates || [],
    persisted: !!source.id,
  };
}

function TaskFieldEditor({ field, colors, onChange, onDelete }) {
  return (
    <View style={{ borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: spacing.md, gap: spacing.sm }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {RESPONSE_FIELD_TYPES.map((type) => {
          const active = field.type === type;
          return (
            <Pressable
              key={type}
              onPress={() => onChange({ ...field, type })}
              style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: active ? colors.accentMore : colors.line, backgroundColor: active ? withAlpha(colors.accentMore, 0.14) : colors.panelElevated, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}
            >
              <Text style={{ color: active ? colors.accentMore : colors.inkMuted, fontSize: 12, fontWeight: '800' }}>{RESPONSE_FIELD_TYPE_LABELS[type]}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <TextInput
        value={field.label}
        onChangeText={(label) => onChange({ ...field, label })}
        placeholder="Field label"
        placeholderTextColor={withAlpha(colors.ink, 0.34)}
        style={{ minHeight: 40, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelElevated, color: colors.ink, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
      />
      <TextInput
        multiline
        value={field.description || ''}
        onChangeText={(description) => onChange({ ...field, description })}
        placeholder="Instructions"
        placeholderTextColor={withAlpha(colors.ink, 0.34)}
        style={{ minHeight: 72, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelElevated, color: colors.ink, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, textAlignVertical: 'top' }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '700' }}>Required</Text>
          <Text style={{ color: colors.inkMuted, fontSize: 11 }}>Kids must fill this before review/done.</Text>
        </View>
        <Switch value={!!field.required} onValueChange={(required) => onChange({ ...field, required })} />
      </View>
      <TextInput
        value={String(field.weight || 0)}
        onChangeText={(weight) => onChange({ ...field, weight: Math.max(0, Number(weight) || 0) })}
        keyboardType="numeric"
        placeholder="Weight"
        placeholderTextColor={withAlpha(colors.ink, 0.34)}
        style={{ minHeight: 40, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelElevated, color: colors.ink, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
      />
      <Pressable onPress={onDelete} style={{ alignSelf: 'flex-start', borderRadius: radii.pill, borderWidth: 1, borderColor: withAlpha(colors.danger, 0.28), backgroundColor: withAlpha(colors.danger, 0.08), paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
        <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '800' }}>Remove field</Text>
      </Pressable>
    </View>
  );
}

function TaskCard({
  task,
  index,
  colors,
  seriesId,
  choreId,
  onChangeTask,
  onMove,
  onAddTaskBelow,
  onAddBreakBelow,
  onDeleteTask,
  onOpenAttachment,
}) {
  async function addAttachment() {
    const files = await pickAttachmentDocuments();
    if (!files.length) return;
    const uploaded = await uploadPendingAttachments(files.slice(0, 1), id);
    if (!uploaded.length) return;
    onChangeTask({
      ...task,
      attachments: [...(task.attachments || []), uploaded[0]],
    });
  }

  return (
    <View style={{ borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: spacing.md, gap: spacing.sm, marginLeft: Math.min(task.indentationLevel, 4) * 16 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between' }}>
        <Text style={{ color: colors.inkMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>
          {task.isDayBreak ? `Day Break ${index + 1}` : `Task ${index + 1}`}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Pressable onPress={() => onMove('up')} style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelElevated, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
            <Text style={{ color: colors.inkMuted, fontSize: 11, fontWeight: '800' }}>Up</Text>
          </Pressable>
          <Pressable onPress={() => onMove('down')} style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelElevated, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
            <Text style={{ color: colors.inkMuted, fontSize: 11, fontWeight: '800' }}>Down</Text>
          </Pressable>
          {!task.isDayBreak ? (
            <>
              <Pressable onPress={() => onMove('outdent')} style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelElevated, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
                <Text style={{ color: colors.inkMuted, fontSize: 11, fontWeight: '800' }}>Outdent</Text>
              </Pressable>
              <Pressable onPress={() => onMove('indent')} style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelElevated, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
                <Text style={{ color: colors.inkMuted, fontSize: 11, fontWeight: '800' }}>Indent</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>

      {!task.isDayBreak ? (
        <TextInput
          value={task.text}
          onChangeText={(text) => onChangeTask({ ...task, text })}
          placeholder="Task title"
          placeholderTextColor={withAlpha(colors.ink, 0.34)}
          style={{ minHeight: 42, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelElevated, color: colors.ink, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 15, fontWeight: '700' }}
        />
      ) : (
        <View style={{ borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', backgroundColor: withAlpha(colors.ink, 0.04), padding: spacing.md }}>
          <Text style={{ color: colors.inkMuted, fontSize: 12 }}>Day break markers split the series into scheduled blocks.</Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Pressable onPress={onAddTaskBelow} style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelElevated, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
          <Text style={{ color: colors.inkMuted, fontSize: 11, fontWeight: '800' }}>Add task below</Text>
        </Pressable>
        <Pressable onPress={onAddBreakBelow} style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelElevated, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
          <Text style={{ color: colors.inkMuted, fontSize: 11, fontWeight: '800' }}>Add day break</Text>
        </Pressable>
        <Pressable onPress={onDeleteTask} style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: withAlpha(colors.danger, 0.28), backgroundColor: withAlpha(colors.danger, 0.08), paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
          <Text style={{ color: colors.danger, fontSize: 11, fontWeight: '800' }}>Delete</Text>
        </Pressable>
      </View>

      {!task.isDayBreak ? (
        <>
          <TextInput
            multiline
            value={task.notes}
            onChangeText={(notes) => onChangeTask({ ...task, notes })}
            placeholder="Notes and instructions"
            placeholderTextColor={withAlpha(colors.ink, 0.34)}
            style={{ minHeight: 88, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelElevated, color: colors.ink, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, textAlignVertical: 'top' }}
          />
          <TextInput
            value={task.specificTime}
            onChangeText={(specificTime) => onChangeTask({ ...task, specificTime })}
            placeholder="Specific time (HH:MM)"
            placeholderTextColor={withAlpha(colors.ink, 0.34)}
            style={{ minHeight: 42, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelElevated, color: colors.ink, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
          />
          <TextInput
            value={String(task.weight || 0)}
            onChangeText={(weight) => onChangeTask({ ...task, weight: Math.max(0, Number(weight) || 0) })}
            keyboardType="numeric"
            placeholder="Task weight"
            placeholderTextColor={withAlpha(colors.ink, 0.34)}
            style={{ minHeight: 42, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelElevated, color: colors.ink, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '700' }}>Allow early completion</Text>
              <Text style={{ color: colors.inkMuted, fontSize: 11 }}>Override series work-ahead rules for this task.</Text>
            </View>
            <Switch value={!!task.overrideWorkAhead} onValueChange={(overrideWorkAhead) => onChangeTask({ ...task, overrideWorkAhead })} />
          </View>

          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
              <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '800' }}>Attachments</Text>
              <Pressable onPress={() => void addAttachment()} style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelElevated, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
                <Text style={{ color: colors.inkMuted, fontSize: 11, fontWeight: '800' }}>Upload</Text>
              </Pressable>
            </View>
            {(task.attachments || []).length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {(task.attachments || []).map((attachment) => (
                  <Pressable key={attachment.id || attachment.url} onPress={() => onOpenAttachment(attachment)} style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelElevated, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
                    <Text style={{ color: colors.ink, fontSize: 11, fontWeight: '700' }}>{attachment.name || 'Attachment'}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={{ color: colors.inkMuted, fontSize: 12 }}>No task attachments yet.</Text>
            )}
          </View>

          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
              <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '800' }}>Response Fields</Text>
              <Pressable
                onPress={() =>
                  onChangeTask({
                    ...task,
                    responseFields: [
                      ...(task.responseFields || []),
                      {
                        id: id(),
                        type: 'rich_text',
                        label: 'Response',
                        description: '',
                        weight: 0,
                        required: false,
                        order: (task.responseFields || []).length,
                      },
                    ],
                  })
                }
                style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelElevated, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}
              >
                <Text style={{ color: colors.inkMuted, fontSize: 11, fontWeight: '800' }}>Add field</Text>
              </Pressable>
            </View>
            {(task.responseFields || []).length ? (
              (task.responseFields || []).map((field, fieldIndex) => (
                <TaskFieldEditor
                  key={field.id}
                  field={field}
                  colors={colors}
                  onChange={(nextField) =>
                    onChangeTask({
                      ...task,
                      responseFields: (task.responseFields || []).map((currentField, currentIndex) => (currentIndex === fieldIndex ? nextField : currentField)),
                    })
                  }
                  onDelete={() =>
                    onChangeTask({
                      ...task,
                      responseFields: (task.responseFields || []).filter((_, currentIndex) => currentIndex !== fieldIndex).map((currentField, currentIndex) => ({ ...currentField, order: currentIndex })),
                    })
                  }
                />
              ))
            ) : (
              <Text style={{ color: colors.inkMuted, fontSize: 12 }}>No response fields. Kids can mark this task normally.</Text>
            )}
          </View>
        </>
      ) : null}

      {!task.isDayBreak && task.updates?.length ? (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/task-series/task',
              params: {
                taskId: task.id,
                seriesId: seriesId || '',
                choreId: choreId || '',
                date: toDateKey(new Date()),
              },
            })
          }
          style={{ alignSelf: 'flex-start', borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelElevated, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}
        >
          <Text style={{ color: colors.inkMuted, fontSize: 11, fontWeight: '800' }}>
            {task.updates.length} update{task.updates.length === 1 ? '' : 's'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function TaskSeriesEditorScreen() {
  const params = useLocalSearchParams();
  const routeSeriesId = firstParam(params.seriesId);
  const isNew = routeSeriesId === 'new' || routeSeriesId === undefined;
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const { requireParentAction } = useParentActionGate();
  const { db, isAuthenticated, instantReady, principalType } = useAppSession();
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(toDateKey(new Date()));
  const [targetEndDate, setTargetEndDate] = useState('');
  const [workAheadAllowed, setWorkAheadAllowed] = useState(false);
  const [dependsOnSeriesId, setDependsOnSeriesId] = useState(null);
  const [breakType, setBreakType] = useState('');
  const [breakStartDate, setBreakStartDate] = useState('');
  const [breakDelayValue, setBreakDelayValue] = useState('');
  const [breakDelayUnit, setBreakDelayUnit] = useState('');
  const [familyMemberId, setFamilyMemberId] = useState(null);
  const [scheduledActivityId, setScheduledActivityId] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [removedTaskIds, setRemovedTaskIds] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  const screenSeriesId = routeSeriesId && routeSeriesId !== 'new' ? routeSeriesId : null;

  const query = db.useQuery(
    isAuthenticated && instantReady && principalType === 'parent'
      ? {
          taskSeries: {
            tasks: {
              parentTask: {},
              attachments: {},
              responseFields: {},
              updates: {
                actor: {},
                affectedPerson: {},
                attachments: {},
                responseFieldValues: { field: {} },
                gradeType: {},
                replyTo: {},
                replies: {
                  actor: {},
                  affectedPerson: {},
                  attachments: {},
                  gradeType: {},
                },
              },
            },
            familyMember: {},
            scheduledActivity: {},
          },
          familyMembers: {
            $: { order: { order: 'asc' } },
          },
          chores: {},
        }
      : null
  );

  const allSeries = query.data?.taskSeries || [];
  const series = screenSeriesId ? allSeries.find((item) => item.id === screenSeriesId) || null : null;

  useEffect(() => {
    if (!series) {
      if (isNew) {
        setName('');
        setDescription('');
        setStartDate(toDateKey(new Date()));
        setTargetEndDate('');
        setWorkAheadAllowed(false);
        setDependsOnSeriesId(null);
        setBreakType('');
        setBreakStartDate('');
        setBreakDelayValue('');
        setBreakDelayUnit('');
        setFamilyMemberId(null);
        setScheduledActivityId(null);
        setTasks([createLocalTask({ text: '', order: 0 })]);
      }
      return;
    }

    setName(series.name || '');
    setDescription(series.description || '');
    setStartDate(toDateKey(series.startDate || new Date()));
    setTargetEndDate(toDateKey(series.targetEndDate || ''));
    setWorkAheadAllowed(!!series.workAheadAllowed);
    setDependsOnSeriesId(series.dependsOnSeriesId || null);
    setBreakType(series.breakType || '');
    setBreakStartDate(toDateKey(series.breakStartDate || ''));
    setBreakDelayValue(series.breakDelayValue != null ? String(series.breakDelayValue) : '');
    setBreakDelayUnit(series.breakDelayUnit || '');
    setFamilyMemberId(firstRef(series.familyMember)?.id || null);
    setScheduledActivityId(firstRef(series.scheduledActivity)?.id || null);
    setTasks((series.tasks || []).slice().sort((left, right) => (left.order || 0) - (right.order || 0)).map((task) => createLocalTask(task)));
    setRemovedTaskIds([]);
  }, [isNew, series]);

  if (principalType !== 'parent') {
    return (
      <SubscreenScaffold title="Series Editor" subtitle="Parent mode is required for task-series editing." accent={colors.accentMore}>
        <ParentAccessNotice
          body="Log in as a parent to create and edit task series."
          onContinue={() =>
            requireParentAction({
              actionId: screenSeriesId ? `task-series:edit:${screenSeriesId}` : 'task-series:new',
              actionLabel: 'Task Series Editor',
              payload: { href: screenSeriesId ? `/more/task-series/${screenSeriesId}` : '/more/task-series/new' },
              returnPath: screenSeriesId ? `/more/task-series/${screenSeriesId}` : '/more/task-series/new',
            })
          }
        />
      </SubscreenScaffold>
    );
  }

  function updateTask(index, nextTask) {
    setTasks((current) => current.map((task, currentIndex) => (currentIndex === index ? { ...nextTask, order: currentIndex } : task)));
  }

  function moveTask(index, direction) {
    setTasks((current) => {
      const next = [...current];
      if (direction === 'up' && index > 0) {
        [next[index - 1], next[index]] = [next[index], next[index - 1]];
      } else if (direction === 'down' && index < next.length - 1) {
        [next[index + 1], next[index]] = [next[index], next[index + 1]];
      } else if (direction === 'indent') {
        next[index] = { ...next[index], indentationLevel: Math.min(4, (next[index].indentationLevel || 0) + 1) };
      } else if (direction === 'outdent') {
        next[index] = { ...next[index], indentationLevel: Math.max(0, (next[index].indentationLevel || 0) - 1) };
      }

      return next.map((task, currentIndex) => ({ ...task, order: currentIndex }));
    });
  }

  function addTaskBelow(index, isDayBreak = false) {
    setTasks((current) => {
      const next = [...current];
      next.splice(index + 1, 0, createLocalTask({ isDayBreak, order: index + 1, indentationLevel: isDayBreak ? 0 : current[index]?.indentationLevel || 0 }));
      return next.map((task, currentIndex) => ({ ...task, order: currentIndex }));
    });
  }

  function deleteTask(index) {
    const task = tasks[index];
    if (!task) return;

    if (taskHasData(task)) {
      Alert.alert(
        'Delete task?',
        `"${task.text || 'This task'}" has saved data that will be deleted.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              setTasks((current) => current.filter((_, currentIndex) => currentIndex !== index).map((currentTask, currentIndex) => ({ ...currentTask, order: currentIndex })));
              if (task.persisted) {
                setRemovedTaskIds((current) => [...current, task.id]);
              }
            },
          },
        ]
      );
      return;
    }

    setTasks((current) => current.filter((_, currentIndex) => currentIndex !== index).map((currentTask, currentIndex) => ({ ...currentTask, order: currentIndex })));
    if (task.persisted) {
      setRemovedTaskIds((current) => [...current, task.id]);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Series name required', 'Give this task series a name before saving.');
      return;
    }

    setIsSaving(true);
    try {
      const nextSeriesId = screenSeriesId || id();
      const transactions = [];

      transactions.push(
        tx.taskSeries[nextSeriesId].update({
          name: name.trim(),
          description: description.trim() || null,
          startDate: startDate ? new Date(`${startDate}T00:00:00Z`) : null,
          targetEndDate: targetEndDate ? new Date(`${targetEndDate}T00:00:00Z`) : null,
          workAheadAllowed,
          dependsOnSeriesId: dependsOnSeriesId || null,
          breakType: breakType || null,
          breakStartDate: breakStartDate ? new Date(`${breakStartDate}T00:00:00Z`) : null,
          breakDelayValue: breakDelayValue ? Number(breakDelayValue) || 0 : null,
          breakDelayUnit: breakDelayUnit || null,
          createdAt: series?.createdAt || new Date(),
          updatedAt: new Date(),
        })
      );

      const currentOwnerId = firstRef(series?.familyMember)?.id || null;
      const currentActivityId = firstRef(series?.scheduledActivity)?.id || null;
      if (currentOwnerId && currentOwnerId !== familyMemberId) {
        transactions.push(tx.taskSeries[nextSeriesId].unlink({ familyMember: currentOwnerId }));
      }
      if (familyMemberId && currentOwnerId !== familyMemberId) {
        transactions.push(tx.taskSeries[nextSeriesId].link({ familyMember: familyMemberId }));
      }
      if (currentActivityId && currentActivityId !== scheduledActivityId) {
        transactions.push(tx.taskSeries[nextSeriesId].unlink({ scheduledActivity: currentActivityId }));
      }
      if (scheduledActivityId && currentActivityId !== scheduledActivityId) {
        transactions.push(tx.taskSeries[nextSeriesId].link({ scheduledActivity: scheduledActivityId }));
      }

      const localTasks = tasks.map((task, index) => ({ ...task, order: index }));
      const parentIds = deriveParentIds(localTasks);
      const persistedTaskMap = new Map((series?.tasks || []).map((task) => [task.id, task]));

      for (const task of localTasks) {
        transactions.push(
          tx.tasks[task.id].update({
            text: task.isDayBreak ? '' : task.text,
            order: task.order,
            indentationLevel: task.indentationLevel || 0,
            isDayBreak: !!task.isDayBreak,
            notes: task.notes || null,
            specificTime: task.specificTime || null,
            overrideWorkAhead: !!task.overrideWorkAhead,
            weight: Number(task.weight || 0),
            updatedAt: new Date(),
            createdAt: persistedTaskMap.get(task.id)?.createdAt || new Date(),
          }),
          tx.taskSeries[nextSeriesId].link({ tasks: task.id })
        );

        const currentParentId = firstRef(persistedTaskMap.get(task.id)?.parentTask)?.id || null;
        const nextParentId = parentIds[task.id];
        if (currentParentId && currentParentId !== nextParentId) {
          transactions.push(tx.tasks[task.id].unlink({ parentTask: currentParentId }));
        }
        if (nextParentId && nextParentId !== currentParentId) {
          transactions.push(tx.tasks[task.id].link({ parentTask: nextParentId }));
        }

        const nextFieldIds = new Set((task.responseFields || []).map((field) => field.id));
        for (const field of task.responseFields || []) {
          transactions.push(
            tx.taskResponseFields[field.id].update({
              type: field.type,
              label: field.label || RESPONSE_FIELD_TYPE_LABELS[field.type] || 'Response',
              description: field.description || null,
              weight: Number(field.weight || 0),
              required: !!field.required,
              order: Number(field.order || 0),
              createdAt: field.createdAt || Date.now(),
              updatedAt: Date.now(),
            }),
            tx.taskResponseFields[field.id].link({ task: task.id })
          );
        }
        for (const field of persistedTaskMap.get(task.id)?.responseFields || []) {
          if (!nextFieldIds.has(field.id)) {
            transactions.push(tx.taskResponseFields[field.id].delete());
          }
        }

        for (const attachment of task.attachments || []) {
          transactions.push(
            tx.taskAttachments[attachment.id].update({
              blurhash: attachment.blurhash || null,
              createdAt: attachment.createdAt ? new Date(attachment.createdAt) : new Date(),
              durationSec: attachment.durationSec ?? null,
              height: attachment.height ?? null,
              kind: attachment.kind || null,
              name: attachment.name,
              sizeBytes: attachment.sizeBytes ?? null,
              thumbnailHeight: attachment.thumbnailHeight ?? null,
              thumbnailUrl: attachment.thumbnailUrl || null,
              thumbnailWidth: attachment.thumbnailWidth ?? null,
              type: attachment.type,
              updatedAt: new Date(),
              url: attachment.url,
              waveformPeaks: attachment.waveformPeaks || null,
              width: attachment.width ?? null,
            }),
            tx.tasks[task.id].link({ attachments: attachment.id })
          );
        }
      }

      for (const taskId of removedTaskIds) {
        const persistedTask = persistedTaskMap.get(taskId);
        for (const field of persistedTask?.responseFields || []) {
          transactions.push(tx.taskResponseFields[field.id].delete());
        }
        for (const attachment of persistedTask?.attachments || []) {
          transactions.push(tx.taskAttachments[attachment.id].delete());
        }
        transactions.push(tx.tasks[taskId].delete());
      }

      await db.transact(transactions);
      if (!screenSeriesId) {
        router.replace(`/more/task-series/${nextSeriesId}`);
      }
    } catch (error) {
      Alert.alert('Unable to save series', error?.message || 'Please try again.');
      setIsSaving(false);
      return;
    }

    setRemovedTaskIds([]);
    setIsSaving(false);
    Alert.alert('Series saved', 'Task series changes were saved.');
  }

  return (
    <SubscreenScaffold
      title={isNew ? 'New Task Series' : name || 'Series Editor'}
      subtitle="Metadata, task structure, attachments, and response fields."
      accent={colors.accentMore}
      action={
        <Pressable testID="task-series-editor-save" onPress={() => void handleSave()} style={[styles.button, styles.buttonPrimary]}>
          <Text style={[styles.buttonText, styles.buttonTextPrimary]}>{isSaving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      }
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={{ flexDirection: width >= 1100 ? 'row' : 'column', gap: spacing.md, alignItems: 'flex-start' }}>
          <View style={{ flex: width >= 1100 ? 0.95 : 1, width: '100%', gap: spacing.md }}>
            <View style={styles.card}>
              <Text style={styles.title}>Series Metadata</Text>
              <TextInput testID="task-series-editor-name" value={name} onChangeText={setName} placeholder="Series name" placeholderTextColor={withAlpha(colors.ink, 0.34)} style={styles.input} />
              <TextInput multiline value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor={withAlpha(colors.ink, 0.34)} style={[styles.input, styles.textArea]} />
              <View style={{ flexDirection: width >= 900 ? 'row' : 'column', gap: spacing.sm }}>
                <TextInput value={startDate} onChangeText={setStartDate} placeholder="Start date YYYY-MM-DD" placeholderTextColor={withAlpha(colors.ink, 0.34)} style={[styles.input, { flex: 1 }]} />
                <TextInput value={targetEndDate} onChangeText={setTargetEndDate} placeholder="Target end YYYY-MM-DD" placeholderTextColor={withAlpha(colors.ink, 0.34)} style={[styles.input, { flex: 1 }]} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '700' }}>Allow work ahead</Text>
                  <Text style={{ color: colors.inkMuted, fontSize: 11 }}>Kids can pull future blocks forward when today is finished.</Text>
                </View>
                <Switch value={workAheadAllowed} onValueChange={setWorkAheadAllowed} />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <Pressable onPress={() => setFamilyMemberId(null)} style={[styles.chip, !familyMemberId && styles.chipActive]}>
                  <Text style={[styles.chipText, !familyMemberId && styles.chipTextActive]}>No assignee</Text>
                </Pressable>
                {(query.data?.familyMembers || []).map((member) => {
                  const active = familyMemberId === member.id;
                  return (
                    <Pressable key={member.id} onPress={() => setFamilyMemberId(member.id)} style={[styles.chip, active && styles.chipActive]}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{member.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <Pressable onPress={() => setScheduledActivityId(null)} style={[styles.chip, !scheduledActivityId && styles.chipActive]}>
                  <Text style={[styles.chipText, !scheduledActivityId && styles.chipTextActive]}>No linked chore</Text>
                </Pressable>
                {(query.data?.chores || []).map((chore) => {
                  const active = scheduledActivityId === chore.id;
                  return (
                    <Pressable key={chore.id} onPress={() => setScheduledActivityId(chore.id)} style={[styles.chip, active && styles.chipActive]}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{chore.title || 'Untitled chore'}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <Pressable onPress={() => setDependsOnSeriesId(null)} style={[styles.chip, !dependsOnSeriesId && styles.chipActive]}>
                  <Text style={[styles.chipText, !dependsOnSeriesId && styles.chipTextActive]}>No dependency</Text>
                </Pressable>
                {allSeries.filter((item) => item.id !== screenSeriesId).map((item) => {
                  const active = dependsOnSeriesId === item.id;
                  return (
                    <Pressable key={item.id} onPress={() => setDependsOnSeriesId(item.id)} style={[styles.chip, active && styles.chipActive]}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.name || 'Untitled series'}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>Break Scheduling</Text>
              <TextInput value={breakType} onChangeText={setBreakType} placeholder="Break type (optional)" placeholderTextColor={withAlpha(colors.ink, 0.34)} style={styles.input} />
              <TextInput value={breakStartDate} onChangeText={setBreakStartDate} placeholder="Break start YYYY-MM-DD" placeholderTextColor={withAlpha(colors.ink, 0.34)} style={styles.input} />
              <View style={{ flexDirection: width >= 900 ? 'row' : 'column', gap: spacing.sm }}>
                <TextInput value={breakDelayValue} onChangeText={setBreakDelayValue} placeholder="Break delay value" placeholderTextColor={withAlpha(colors.ink, 0.34)} keyboardType="numeric" style={[styles.input, { flex: 1 }]} />
                <TextInput value={breakDelayUnit} onChangeText={setBreakDelayUnit} placeholder="Break delay unit" placeholderTextColor={withAlpha(colors.ink, 0.34)} style={[styles.input, { flex: 1 }]} />
              </View>
              <Text style={styles.body}>These fields map directly to the existing Instant series metadata so mobile can edit the same dependency and break controls as web.</Text>
            </View>

            {screenSeriesId ? (
              <View style={styles.card}>
                <Text style={styles.title}>Series Actions</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  <Pressable
                    testID="task-series-editor-open-checklist"
                    onPress={() =>
                      openTaskSeriesChecklist({
                        seriesId: screenSeriesId,
                        choreId: scheduledActivityId || '',
                        date: startDate || '',
                        memberId: familyMemberId || '',
                      })
                    }
                    style={styles.button}
                  >
                    <Text style={styles.buttonText}>Checklist</Text>
                  </Pressable>
                  <Pressable testID="task-series-editor-open-history" onPress={() => openTaskHistory({ seriesId: screenSeriesId, title: name || 'Task Series History' })} style={styles.button}>
                    <Text style={styles.buttonText}>History</Text>
                  </Pressable>
                  <Pressable testID="task-series-editor-open-discussion" onPress={() => void openTaskSeriesDiscussion({ seriesId: screenSeriesId, seriesName: name })} style={styles.button}>
                    <Text style={styles.buttonText}>Discussion</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>

          <View style={{ flex: width >= 1100 ? 1.05 : 1, width: '100%', gap: spacing.md }}>
            {tasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                colors={colors}
                seriesId={screenSeriesId}
                choreId={scheduledActivityId}
                onChangeTask={(nextTask) => updateTask(index, nextTask)}
                onMove={(direction) => moveTask(index, direction)}
                onAddTaskBelow={() => addTaskBelow(index, false)}
                onAddBreakBelow={() => addTaskBelow(index, true)}
                onDeleteTask={() => deleteTask(index)}
                onOpenAttachment={setPreviewAttachment}
              />
            ))}

            <View style={styles.card}>
              <Text style={styles.body}>Task cards support notes, attachments, response fields, weights, specific times, and guarded deletes. Save writes the full structure back to Instant using the existing schema.</Text>
              <Pressable testID="task-series-editor-add-task" onPress={() => setTasks((current) => [...current, createLocalTask({ order: current.length })])} style={[styles.button, styles.buttonPrimary]}>
                <Text style={[styles.buttonText, styles.buttonTextPrimary]}>Add Task</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
      <AttachmentPreviewModal attachment={previewAttachment} visible={!!previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </SubscreenScaffold>
  );
}
