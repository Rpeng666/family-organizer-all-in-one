import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { id, tx } from '@instantdb/react-native';
import { useAppSession } from '../../providers/AppProviders';
import { useAppTheme } from '../../theme/ThemeProvider';
import { radii, shadows, spacing, withAlpha } from '../../theme/tokens';
import { GRADE_TYPE_KINDS } from '../../../../lib/task-response-types';
import { US_LETTER_GRADE_STEPS } from '../../../../lib/grade-utils';

const KIND_LABELS = {
  number: 'Number',
  letter: 'Letter',
  stars: 'Stars',
  freeform: 'Freeform',
};

const KIND_PRESETS = {
  number: { highValue: 100, lowValue: 0, highLabel: '100', lowLabel: '0', name: 'Percentage' },
  letter: { highValue: 100, lowValue: 0, highLabel: 'A+', lowLabel: 'F', name: 'Letter Grade' },
  stars: { highValue: 5, lowValue: 0, highLabel: '5 Stars', lowLabel: '0 Stars', name: '5-Star Rating' },
  freeform: { highValue: 0, lowValue: 0, highLabel: '', lowLabel: '', name: 'Freeform Comment' },
};

function initialForm(kind = 'number') {
  const preset = KIND_PRESETS[kind] || KIND_PRESETS.number;
  return {
    kind,
    name: preset.name,
    highValue: String(preset.highValue),
    lowValue: String(preset.lowValue),
    highLabel: preset.highLabel,
    lowLabel: preset.lowLabel,
    steps: kind === 'letter' ? [...US_LETTER_GRADE_STEPS] : [],
  };
}

function createStyles(colors) {
  return StyleSheet.create({
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
    buttonText: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: '800',
    },
    buttonTextPrimary: {
      color: colors.onAccent,
    },
  });
}

function GradeTypeForm({ value, colors, onChange, onSave, onCancel }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const currentPreset = KIND_PRESETS[value.kind] || KIND_PRESETS.number;

  function updateKind(kind) {
    const preset = KIND_PRESETS[kind] || KIND_PRESETS.number;
    onChange({
      ...value,
      kind,
      name: value.name || preset.name,
      highValue: String(preset.highValue),
      lowValue: String(preset.lowValue),
      highLabel: preset.highLabel,
      lowLabel: preset.lowLabel,
      steps: kind === 'letter' ? [...US_LETTER_GRADE_STEPS] : [],
    });
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.panel }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {GRADE_TYPE_KINDS.map((kind) => {
          const active = value.kind === kind;
          return (
            <Pressable key={kind} onPress={() => updateKind(kind)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{KIND_LABELS[kind]}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <TextInput value={value.name} onChangeText={(name) => onChange({ ...value, name })} placeholder={currentPreset.name} placeholderTextColor={withAlpha(colors.ink, 0.34)} style={styles.input} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <TextInput value={value.highValue} onChangeText={(highValue) => onChange({ ...value, highValue })} placeholder="High value" placeholderTextColor={withAlpha(colors.ink, 0.34)} keyboardType="numeric" style={[styles.input, { flex: 1 }]} />
        <TextInput value={value.lowValue} onChangeText={(lowValue) => onChange({ ...value, lowValue })} placeholder="Low value" placeholderTextColor={withAlpha(colors.ink, 0.34)} keyboardType="numeric" style={[styles.input, { flex: 1 }]} />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <TextInput value={value.highLabel} onChangeText={(highLabel) => onChange({ ...value, highLabel })} placeholder="High label" placeholderTextColor={withAlpha(colors.ink, 0.34)} style={[styles.input, { flex: 1 }]} />
        <TextInput value={value.lowLabel} onChangeText={(lowLabel) => onChange({ ...value, lowLabel })} placeholder="Low label" placeholderTextColor={withAlpha(colors.ink, 0.34)} style={[styles.input, { flex: 1 }]} />
      </View>
      {value.kind === 'letter' ? (
        <View style={{ gap: spacing.sm }}>
          {value.steps.map((step, index) => (
            <View key={`${step.label}-${index}`} style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TextInput value={step.label} onChangeText={(label) => onChange({ ...value, steps: value.steps.map((currentStep, currentIndex) => (currentIndex === index ? { ...currentStep, label } : currentStep)) })} placeholder="Label" placeholderTextColor={withAlpha(colors.ink, 0.34)} style={[styles.input, { flex: 1 }]} />
              <TextInput value={String(step.value)} onChangeText={(stepValue) => onChange({ ...value, steps: value.steps.map((currentStep, currentIndex) => (currentIndex === index ? { ...currentStep, value: Number(stepValue) || 0 } : currentStep)) })} placeholder="Value" placeholderTextColor={withAlpha(colors.ink, 0.34)} keyboardType="numeric" style={[styles.input, { width: 100 }]} />
              <Pressable
                onPress={() => onChange({ ...value, steps: value.steps.filter((_, currentIndex) => currentIndex !== index) })}
                style={[styles.button, { minHeight: 42 }]}
              >
                <Text style={styles.buttonText}>Remove</Text>
              </Pressable>
            </View>
          ))}
          <Pressable
            onPress={() => onChange({ ...value, steps: [...value.steps, { label: '', value: 0 }] })}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Add Step</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Pressable onPress={onCancel} style={[styles.button, { flex: 1 }]}>
          <Text style={styles.buttonText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={onSave} style={[styles.button, styles.buttonPrimary, { flex: 1 }]}>
          <Text style={[styles.buttonText, styles.buttonTextPrimary]}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function TaskSeriesGradeSettingsSection() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { db, isAuthenticated, instantReady, principalType } = useAppSession();
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(initialForm());

  const query = db.useQuery(
    isAuthenticated && instantReady && principalType === 'parent'
      ? {
          gradeTypes: {
            $: { order: { createdAt: 'asc' } },
          },
        }
      : null
  );

  const gradeTypes = query.data?.gradeTypes || [];

  async function saveGradeType() {
    const isCreating = !editingId || editingId === 'new';
    const existing = !isCreating ? gradeTypes.find((gradeType) => gradeType.id === editingId) : null;
    const targetId = isCreating ? id() : editingId;
    const isDefault = isCreating ? gradeTypes.length === 0 : existing?.isDefault;
    const now = Date.now();
    await db.transact([
      tx.gradeTypes[targetId].update({
        name: form.name.trim() || KIND_PRESETS[form.kind].name,
        kind: form.kind,
        highValue: Number(form.highValue) || 0,
        lowValue: Number(form.lowValue) || 0,
        highLabel: form.highLabel.trim() || KIND_PRESETS[form.kind].highLabel,
        lowLabel: form.lowLabel.trim() || KIND_PRESETS[form.kind].lowLabel,
        steps: form.kind === 'letter' ? form.steps : null,
        isDefault,
        order: isCreating ? gradeTypes.length : existing?.order || 0,
        createdAt: isCreating ? now : existing?.createdAt || now,
        updatedAt: now,
      }),
    ]);
    setEditingId(null);
    setForm(initialForm());
  }

  async function setDefaultGradeType(gradeTypeId) {
    const transactions = gradeTypes.map((gradeType) =>
      tx.gradeTypes[gradeType.id].update({
        isDefault: gradeType.id === gradeTypeId,
        updatedAt: Date.now(),
      })
    );
    await db.transact(transactions);
  }

  async function deleteGradeType(gradeTypeId) {
    const target = gradeTypes.find((gradeType) => gradeType.id === gradeTypeId);
    const transactions = [tx.gradeTypes[gradeTypeId].delete()];
    if (target?.isDefault) {
      const nextDefault = gradeTypes.find((gradeType) => gradeType.id !== gradeTypeId);
      if (nextDefault) {
        transactions.push(
          tx.gradeTypes[nextDefault.id].update({
            isDefault: true,
            updatedAt: Date.now(),
          })
        );
      }
    }
    await db.transact(transactions);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Grade Types</Text>
      <Text style={styles.body}>Use the same grade scales the web task review flow already supports.</Text>
      {editingId || !gradeTypes.length ? (
        <GradeTypeForm
          value={form}
          colors={colors}
          onChange={setForm}
          onCancel={() => {
            setEditingId(null);
            setForm(initialForm());
          }}
          onSave={() => {
            void saveGradeType();
          }}
        />
      ) : null}
      {gradeTypes.map((gradeType) => (
        <View key={gradeType.id} style={[styles.card, { backgroundColor: colors.panel, gap: spacing.sm }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{gradeType.name}</Text>
              <Text style={styles.body}>{KIND_LABELS[gradeType.kind] || gradeType.kind}</Text>
            </View>
            {gradeType.isDefault ? (
              <View style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: withAlpha(colors.success, 0.28), backgroundColor: withAlpha(colors.success, 0.12), paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
                <Text style={{ color: colors.success, fontSize: 11, fontWeight: '800' }}>Default</Text>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable
              onPress={() => {
                setEditingId(gradeType.id);
                setForm({
                  kind: gradeType.kind,
                  name: gradeType.name,
                  highValue: String(gradeType.highValue),
                  lowValue: String(gradeType.lowValue),
                  highLabel: gradeType.highLabel,
                  lowLabel: gradeType.lowLabel,
                  steps: gradeType.steps || [],
                });
              }}
              style={[styles.button, { flex: 1 }]}
            >
              <Text style={styles.buttonText}>Edit</Text>
            </Pressable>
            {!gradeType.isDefault ? (
              <Pressable onPress={() => void setDefaultGradeType(gradeType.id)} style={[styles.button, { flex: 1 }]}>
                <Text style={styles.buttonText}>Make default</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => void deleteGradeType(gradeType.id)} style={[styles.button, { flex: 1 }]}>
              <Text style={styles.buttonText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {!editingId ? (
        <Pressable
          onPress={() => {
            setForm(initialForm());
            setEditingId('new');
          }}
          style={[styles.button, styles.buttonPrimary]}
        >
          <Text style={[styles.buttonText, styles.buttonTextPrimary]}>Add Grade Type</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
