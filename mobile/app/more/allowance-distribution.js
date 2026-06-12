import React, { useEffect, useMemo } from 'react';
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAppSession } from '../../src/providers/AppProviders';
import { clearPendingParentAction } from '../../src/lib/session-prefs';
import { useParentActionGate } from '../../src/hooks/useParentActionGate';
import { E, SP, R } from '../../src/theme/E';

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function formatAmount(code, amount) {
  if (!code || amount == null) return 'Not configured';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: String(code).toUpperCase() }).format(Number(amount) || 0);
  } catch {
    return `${amount} ${String(code).toUpperCase()}`;
  }
}

function recurrenceLabel(rrule) {
  if (!rrule) return 'No recurrence';
  const upper = String(rrule).toUpperCase();
  if (upper.includes('WEEKLY')) return 'Weekly';
  if (upper.includes('MONTHLY')) return 'Monthly';
  if (upper.includes('DAILY')) return 'Daily';
  return 'Custom';
}

export default function AllowanceDistributionScreen() {
  const searchParams = useLocalSearchParams();
  const { requireParentAction } = useParentActionGate();
  const { db, isAuthenticated, instantReady, principalType, isOnline } = useAppSession();

  useEffect(() => {
    if (firstParam(searchParams.resumeParentAction) !== '1') return;
    if (principalType !== 'parent') return;
    void clearPendingParentAction();
  }, [principalType, searchParams.resumeParentAction]);

  const allowanceQuery = db.useQuery(
    isAuthenticated && instantReady && principalType === 'parent'
      ? {
          familyMembers: {
            $: { order: { order: 'asc' } },
            allowanceEnvelopes: {},
          },
        }
      : null
  );

  const members = useMemo(() => allowanceQuery.data?.familyMembers || [], [allowanceQuery.data?.familyMembers]);
  const configuredMembers = useMemo(
    () => members.filter((m) => m.allowanceAmount != null && m.allowanceCurrency),
    [members]
  );

  async function handoffToParent() {
    await requireParentAction({
      actionId: 'more:open:allowanceDistribution',
      actionLabel: 'Allowance Distribution',
      payload: { href: '/more/allowance-distribution' },
      returnPath: '/more/allowance-distribution',
    });
  }

  if (principalType !== 'parent') {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={E.bg} />
        <View style={s.header}>
          <Text style={s.title}>Allowance Distribution</Text>
        </View>
        <View style={s.noticeCard}>
          <Text style={s.noticeTitle}>Parent access required</Text>
          <Text style={s.noticeBody}>Log in as a parent to review payout readiness and per-member allowance settings.</Text>
          <View style={{ alignItems: 'flex-end', marginTop: SP.xs }}>
            <View
              style={s.primaryBtn}
              accessible
              accessibilityRole="button"
              onStartShouldSetResponder={() => true}
              onResponderRelease={() => { void handoffToParent(); }}
            >
              <Text style={s.primaryBtnText}>Switch to parent</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={E.bg} />

      <View style={s.header}>
        <Text style={s.title}>Allowance Distribution</Text>
        <View style={s.statusRow}>
          <View style={[s.statusPill, isOnline ? s.pillOk : s.pillWarn]}>
            <Text style={[s.statusPillText, isOnline ? s.pillOkText : s.pillWarnText]}>{isOnline ? 'Online' : 'Offline'}</Text>
          </View>
          <View style={s.statusPill}>
            <Text style={s.statusPillText}>{configuredMembers.length} configured</Text>
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        <View style={s.infoCard}>
          <Text style={s.infoLabel}>Preview</Text>
          <Text style={s.infoTitle}>Payout readiness</Text>
          <Text style={s.infoBody}>
            The live execution flow is still being ported. This screen surfaces which household members have recurrence, amount, and envelope data in place.
          </Text>
        </View>

        {members.map((member) => {
          const ready = member.allowanceAmount != null && member.allowanceCurrency && (member.allowanceEnvelopes || []).length > 0;
          const envelopeCount = (member.allowanceEnvelopes || []).length;
          return (
            <View key={member.id} style={s.memberCard}>
              <View style={s.memberHeader}>
                <Text style={s.memberName}>{member.name}</Text>
                <View style={[s.statePill, ready ? s.readyPill : s.pendingPill]}>
                  <Text style={[s.stateText, ready ? s.readyText : s.pendingText]}>
                    {ready ? 'Ready' : 'Needs setup'}
                  </Text>
                </View>
              </View>
              <Text style={s.memberMeta}>
                {formatAmount(member.allowanceCurrency, member.allowanceAmount)}
                {' · '}
                {recurrenceLabel(member.allowanceRrule)}
                {' · '}
                {envelopeCount} envelope{envelopeCount === 1 ? '' : 's'}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: E.bg },
  header: { paddingHorizontal: SP.md, paddingTop: SP.md, paddingBottom: SP.sm, gap: SP.xs },
  title:  { fontFamily: 'serif', fontSize: 28, fontWeight: '700', color: E.ink },

  statusRow:      { flexDirection: 'row', gap: SP.xs, flexWrap: 'wrap' },
  statusPill:     { borderWidth: 1, borderColor: E.border, borderRadius: R.pill, paddingHorizontal: SP.sm, paddingVertical: 4, backgroundColor: E.bgDeep },
  pillOk:         { borderColor: E.okBorder, backgroundColor: E.okBg },
  pillWarn:       { borderColor: E.warnBorder, backgroundColor: E.warnBg },
  statusPillText: { fontSize: 11, fontWeight: '500', color: E.inkSub },
  pillOkText:     { color: E.ok },
  pillWarnText:   { color: E.warn },

  content: { gap: SP.md, paddingHorizontal: SP.md, paddingBottom: SP.xl },

  noticeCard:  { margin: SP.md, borderRadius: R.lg, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.lg, gap: SP.sm },
  noticeTitle: { fontFamily: 'serif', fontSize: 20, fontWeight: '700', color: E.ink },
  noticeBody:  { fontSize: 14, color: E.inkSub, lineHeight: 20, fontWeight: '300' },
  primaryBtn:      { minHeight: 38, paddingHorizontal: SP.lg, borderRadius: R.pill, backgroundColor: E.ink, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText:  { fontSize: 13, color: E.white, fontWeight: '600' },

  infoCard:  { borderRadius: R.lg, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, padding: SP.md, gap: SP.xs },
  infoLabel: { fontSize: 10, color: E.inkMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  infoTitle: { fontFamily: 'serif', fontSize: 18, fontWeight: '700', color: E.ink },
  infoBody:  { fontSize: 13, color: E.inkSub, lineHeight: 18, fontWeight: '300' },

  memberCard:   { borderRadius: R.lg, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.md, gap: SP.xs },
  memberHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SP.sm },
  memberName:   { fontFamily: 'serif', fontSize: 17, fontWeight: '700', color: E.ink, flex: 1 },
  memberMeta:   { fontSize: 13, color: E.inkMuted, lineHeight: 18, fontWeight: '300' },

  statePill:   { borderWidth: 1, borderRadius: R.pill, paddingHorizontal: SP.sm, paddingVertical: 4 },
  readyPill:   { borderColor: E.okBorder, backgroundColor: E.okBg },
  pendingPill: { borderColor: E.warnBorder, backgroundColor: E.warnBg },
  stateText:   { fontSize: 11, fontWeight: '600' },
  readyText:   { color: E.ok },
  pendingText: { color: E.warn },
});
