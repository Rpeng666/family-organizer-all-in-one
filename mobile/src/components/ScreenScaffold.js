import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, StyleSheet } from 'react-native';
import { radii, shadows, spacing, withAlpha } from '../theme/tokens';
import { useAppTheme } from '../theme/ThemeProvider';

function getChipTones(colors) {
  return {
    neutral: { bg: withAlpha(colors.canvasText, 0.08), text: colors.canvasTextMuted, border: colors.canvasLine },
    success: { bg: withAlpha(colors.success, 0.2), text: colors.canvasText, border: withAlpha(colors.success, 0.34) },
    warning: { bg: withAlpha(colors.warning, 0.2), text: colors.canvasText, border: withAlpha(colors.warning, 0.36) },
    accent: { bg: withAlpha(colors.accentDashboard, 0.22), text: colors.canvasText, border: withAlpha(colors.accentDashboard, 0.42) },
  };
}

export function ScreenScaffold({
  title,
  subtitle,
  accent,
  statusChips = [],
  headerAction = null,
  children,
  headerMode = 'default',
  layoutMode = 'default',
}) {
  const { colors, themeName } = useAppTheme();
  const isDark = themeName === 'dark';
  const styles = React.useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const chipTones = React.useMemo(() => getChipTones(colors), [colors]);
  const compactHeader = headerMode === 'compact';
  const compactLayout = layoutMode === 'compact';
  const resolvedAccent = accent || colors.accentMore;
  const headerTopVisible = headerAction || statusChips.length > 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.root}>
        <View style={[styles.headerCanvas, compactHeader && styles.headerCanvasCompact]}>
          <View style={[styles.headerHalo, styles.headerHaloLeft, { backgroundColor: withAlpha(resolvedAccent, 0.18) }]} />
          <View style={[styles.headerHalo, styles.headerHaloRight, { backgroundColor: withAlpha(colors.canvasText, 0.08) }]} />
          <View style={[styles.headerHalo, styles.headerHaloBottom, { backgroundColor: withAlpha(colors.canvasMuted, 0.24) }]} />
          {isDark ? <View style={[styles.headerHalo, styles.headerHaloGlow]} /> : null}

          {headerTopVisible ? (
            <View style={styles.headerTop}>
              <View style={styles.chipsRow}>
                {statusChips.map((chip) => {
                  const tone = chipTones[chip.tone] || chipTones.neutral;
                  return (
                    <View
                      key={`${chip.label}-${chip.tone || 'neutral'}`}
                      style={[styles.chip, { backgroundColor: tone.bg, borderColor: tone.border }]}
                    >
                      <Text style={[styles.chipText, { color: tone.text }]} numberOfLines={1}>
                        {chip.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
              {headerAction ? <View style={styles.headerActionWrap}>{headerAction}</View> : null}
            </View>
          ) : null}

          <View style={styles.titleWrap}>
            <Text style={[styles.title, compactHeader && styles.titleCompact]} numberOfLines={compactHeader ? 2 : undefined}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, compactHeader && styles.subtitleCompact]} numberOfLines={compactHeader ? 2 : undefined}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          <View style={[styles.headerAccentBar, { backgroundColor: resolvedAccent }]} />
        </View>

        <View style={[styles.contentShell, compactLayout && styles.contentShellCompact]}>
          <View style={styles.contentGlow} />
          <View style={styles.content}>{children}</View>
        </View>
      </View>
    </SafeAreaView>
  );
}

export function PlaceholderCard({ title, body }) {
  const { colors, themeName } = useAppTheme();
  const isDark = themeName === 'dark';
  const styles = React.useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
    </View>
  );
}

const createStyles = (colors, isDark) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvasStrong },
  root: { flex: 1, backgroundColor: colors.canvasStrong },
  headerCanvas: {
    position: 'relative',
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.canvas,
  },
  headerCanvasCompact: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  headerHalo: {
    position: 'absolute',
    borderRadius: radii.pill,
  },
  headerHaloLeft: {
    width: 184,
    height: 184,
    left: -44,
    top: -28,
  },
  headerHaloRight: {
    width: 152,
    height: 152,
    right: -26,
    top: 24,
  },
  headerHaloBottom: {
    width: 220,
    height: 220,
    right: 40,
    bottom: -126,
  },
  headerHaloGlow: {
    width: 160,
    height: 160,
    right: 18,
    top: 82,
    backgroundColor: withAlpha(colors.accentMore, 0.15),
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titleWrap: {
    gap: spacing.xs,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    color: colors.canvasText,
    maxWidth: '86%',
  },
  titleCompact: {
    fontSize: 26,
    lineHeight: 31,
    maxWidth: '92%',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  headerActionWrap: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    flexShrink: 1,
    paddingLeft: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.canvasTextMuted,
    lineHeight: 20,
    maxWidth: '92%',
  },
  subtitleCompact: {
    lineHeight: 18,
    fontSize: 13,
  },
  headerAccentBar: {
    width: 88,
    height: 4,
    borderRadius: radii.pill,
  },
  contentShell: {
    flex: 1,
    marginTop: -10,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
    borderTopWidth: isDark ? 1 : 0,
    borderTopColor: isDark ? colors.line : 'transparent',
  },
  contentShellCompact: {
    marginTop: -6,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  contentGlow: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 0,
    height: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    backgroundColor: isDark ? withAlpha(colors.accentDashboard, 0.08) : withAlpha(colors.panel, 0.45),
  },
  content: {
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  card: {
    backgroundColor: isDark ? colors.surfaceMuted : colors.panel,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    ...(isDark ? {} : shadows.card),
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, marginBottom: spacing.xs },
  cardBody: { color: colors.inkMuted, lineHeight: 20 },
  });
