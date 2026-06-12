/**
 * Editorial luxury design system — warm paper palette, serif headings, refined primitives.
 * All screens use this instead of theme tokens, giving a consistent Kinfolk/Muji aesthetic
 * regardless of the active color theme.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─── Palette ────────────────────────────────────────────────────────────────
export const E = {
  bg:          '#F5F3EE',
  bgDeep:      '#EFECE5',
  surface:     '#F9F7F3',
  ink:         '#111111',
  inkSub:      '#5A5752',
  inkMuted:    '#9A958D',
  border:      '#E0DBD3',
  borderLight: '#EAE6DF',
  accent:      '#C8B89C',
  accentDeep:  '#B8A88B',

  // Status — muted, never saturated
  ok:          '#3A7A5A',
  okBg:        'rgba(58,122,90,0.07)',
  okBorder:    'rgba(58,122,90,0.18)',
  warn:        '#8A6A2A',
  warnBg:      'rgba(138,106,42,0.07)',
  warnBorder:  'rgba(138,106,42,0.18)',
  danger:      '#9A3A2A',
  dangerBg:    'rgba(154,58,42,0.06)',
  dangerBorder:'rgba(154,58,42,0.18)',

  white:       '#FFFFFF',
};

// ─── Spacing ─────────────────────────────────────────────────────────────────
export const SP = {
  xs: 6,
  sm: 12,
  md: 20,
  lg: 28,
  xl: 40,
  xxl: 56,
};

// ─── Radii ────────────────────────────────────────────────────────────────────
export const R = {
  sm: 14,
  md: 20,
  lg: 28,
  pill: 999,
};

// ─── Typography helpers ──────────────────────────────────────────────────────
export const T = {
  display: { fontFamily: 'serif', fontSize: 42, lineHeight: 48, letterSpacing: -0.5, fontWeight: '700', color: E.ink },
  h1:      { fontFamily: 'serif', fontSize: 32, lineHeight: 38, letterSpacing: -0.3, fontWeight: '700', color: E.ink },
  h2:      { fontFamily: 'serif', fontSize: 24, lineHeight: 30, letterSpacing: -0.2, fontWeight: '700', color: E.ink },
  h3:      { fontSize: 18, lineHeight: 24, fontWeight: '600', color: E.ink },
  body:    { fontSize: 15, lineHeight: 24, fontWeight: '300', color: E.inkSub },
  caption: { fontSize: 13, lineHeight: 20, fontWeight: '300', color: E.inkMuted },
  label:   { fontSize: 10, lineHeight: 14, fontWeight: '500', letterSpacing: 1.8, color: E.inkMuted },
  num:     { fontFamily: 'serif', fontSize: 28, lineHeight: 34, fontWeight: '600', color: E.ink },
};

// ─── EScreen ─────────────────────────────────────────────────────────────────
// Full-page editorial wrapper — warm paper bg, safe area, scroll-aware.
export function EScreen({ children, style }) {
  return (
    <SafeAreaView style={[es.safe, style]} edges={['top', 'left', 'right', 'bottom']}>
      {children}
    </SafeAreaView>
  );
}

const es = StyleSheet.create({
  safe: { flex: 1, backgroundColor: E.bg },
});

// ─── ECard ────────────────────────────────────────────────────────────────────
// Paper-sheet card — large radius, hairline border, no heavy shadow.
export function ECard({ children, style, onPress }) {
  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [ec.card, pressed && ec.cardPressed, style]}
        onPress={onPress}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[ec.card, style]}>{children}</View>;
}

const ec = StyleSheet.create({
  card: {
    backgroundColor: E.surface,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: E.border,
    padding: SP.md,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardPressed: { opacity: 0.75 },
});

// ─── EDivider ─────────────────────────────────────────────────────────────────
export function EDivider({ style }) {
  return <View style={[ed.line, style]} />;
}
const ed = StyleSheet.create({ line: { height: 1, backgroundColor: E.border } });

// ─── ELabel ───────────────────────────────────────────────────────────────────
export function ELabel({ children, style }) {
  return <Text style={[T.label, el.label, style]}>{children}</Text>;
}
const el = StyleSheet.create({ label: { textTransform: 'uppercase' } });

// ─── EButton ─────────────────────────────────────────────────────────────────
// Primary: dark pill. Secondary: outline pill.
export function EButton({ label, onPress, disabled, variant = 'primary', style }) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        eb.btn,
        isPrimary ? eb.primary : eb.secondary,
        disabled && eb.disabled,
        pressed && !disabled && eb.pressed,
        style,
      ]}
    >
      <Text style={[eb.text, !isPrimary && eb.textSecondary]}>{label}</Text>
    </Pressable>
  );
}
const eb = StyleSheet.create({
  btn:          { height: 52, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SP.xl },
  primary:      { backgroundColor: E.ink },
  secondary:    { backgroundColor: 'transparent', borderWidth: 1, borderColor: E.border },
  disabled:     { opacity: 0.3 },
  pressed:      { opacity: 0.65 },
  text:         { color: E.white, fontSize: 16, fontWeight: '600', letterSpacing: 0.3 },
  textSecondary:{ color: E.ink },
});

// ─── EStatusDot ───────────────────────────────────────────────────────────────
export function EStatusDot({ ok }) {
  return (
    <View style={[esd.dot, ok ? esd.dotOk : esd.dotWarn]} />
  );
}
const esd = StyleSheet.create({
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotOk: { backgroundColor: E.ok },
  dotWarn: { backgroundColor: E.warn },
});
