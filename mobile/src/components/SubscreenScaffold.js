import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ScreenScaffold } from './ScreenScaffold';
import { radii, spacing, withAlpha } from '../theme/tokens';
import { useAppTheme } from '../theme/ThemeProvider';

export function SubscreenScaffold({
  title,
  subtitle,
  accent,
  statusChips = [],
  action = null,
  children,
}) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const resolvedAccent = accent || colors.accentMore;

  return (
    <ScreenScaffold title={title} subtitle={subtitle} accent={resolvedAccent} statusChips={statusChips} headerMode="compact">
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        {action ? <View>{action}</View> : <View />}
      </View>
      {children}
    </ScreenScaffold>
  );
}

export function ParentAccessNotice({
  title = 'Parent login required',
  body,
  onContinue,
  continueLabel = 'Continue as parent',
}) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.noticeCard}>
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.noticeBody}>{body}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={continueLabel}
        style={styles.noticeButton}
        onPress={() => {
          void onContinue?.();
        }}
      >
        <Text style={styles.noticeButtonText}>{continueLabel}</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    color: colors.ink,
    fontWeight: '700',
  },
  noticeCard: {
    backgroundColor: withAlpha(colors.warning, 0.1),
    borderWidth: 1,
    borderColor: withAlpha(colors.warning, 0.24),
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  noticeTitle: {
    color: colors.warning,
    fontSize: 16,
    fontWeight: '800',
  },
  noticeBody: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  noticeButton: {
    alignSelf: 'flex-start',
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.panelElevated,
    borderWidth: 1,
    borderColor: withAlpha(colors.warning, 0.3),
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeButtonText: {
    color: colors.warning,
    fontWeight: '700',
  },
  });
