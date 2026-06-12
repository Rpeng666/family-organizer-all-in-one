import React, { useEffect, useMemo } from 'react';
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAppSession } from '../../src/providers/AppProviders';
import { AvatarPhotoImage } from '../../src/components/AvatarPhotoImage';
import { clearPendingParentAction } from '../../src/lib/session-prefs';
import { useParentActionGate } from '../../src/hooks/useParentActionGate';
import { E, SP, R } from '../../src/theme/E';

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default function FamilyMembersScreen() {
  const searchParams = useLocalSearchParams();
  const { requireParentAction } = useParentActionGate();
  const {
    db,
    isAuthenticated,
    instantReady,
    principalType,
    isOnline,
  } = useAppSession();

  useEffect(() => {
    if (firstParam(searchParams.resumeParentAction) !== '1') return;
    if (principalType !== 'parent') return;
    void clearPendingParentAction();
  }, [principalType, searchParams.resumeParentAction]);

  const familyQuery = db.useQuery(
    isAuthenticated && instantReady && principalType === 'parent'
      ? {
          familyMembers: {
            $: { order: { order: 'asc' } },
            allowanceEnvelopes: {},
          },
        }
      : null
  );

  const members = useMemo(() => familyQuery.data?.familyMembers || [], [familyQuery.data?.familyMembers]);

  async function handoffToParent() {
    await requireParentAction({
      actionId: 'more:open:familyMembers',
      actionLabel: 'Family Members',
      payload: { href: '/more/family-members' },
      returnPath: '/more/family-members',
    });
  }

  if (principalType !== 'parent') {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={E.bg} />
        <View style={s.header}>
          <Text style={s.title}>Family Members</Text>
        </View>
        <View style={s.noticeCard}>
          <Text style={s.noticeTitle}>Parent access required</Text>
          <Text style={s.noticeBody}>Log in as a parent to review member roles, PIN state, and household ordering.</Text>
          <View style={s.noticeActions}>
            <View
              style={s.primaryBtn}
              accessible
              accessibilityRole="button"
              onStartShouldSetResponder={() => true}
              onResponderRelease={() => { void handoffToParent(); }}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={E.bg} />

      <View style={s.header}>
        <Text style={s.title}>Family Members</Text>
        <View style={s.statusRow}>
          <View style={[s.statusPill, isOnline ? s.pillOk : s.pillWarn]}>
            <Text style={[s.statusPillText, isOnline ? s.pillOkText : s.pillWarnText]}>{isOnline ? 'Online' : 'Offline'}</Text>
          </View>
          <View style={s.statusPill}>
            <Text style={s.statusPillText}>{members.length} members</Text>
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        {familyQuery.isLoading ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyTitle}>Loading family members…</Text>
          </View>
        ) : members.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyTitle}>No members found</Text>
            <Text style={s.emptyBody}>Create members on the web app first, then they will appear here for mobile admin review.</Text>
          </View>
        ) : (
          members.map((member, index) => {
            const role = member.role || 'child';
            const roleIsParent = role === 'parent';
            return (
              <View key={member.id} style={s.memberCard}>
                <View style={s.memberHeader}>
                  <AvatarPhotoImage
                    photoUrls={member.photoUrls}
                    preferredSize="320"
                    style={s.avatarImage}
                    fallback={
                      <View style={s.avatarFallback}>
                        <Text style={s.avatarLetter}>{(member.name || '?').slice(0, 1).toUpperCase()}</Text>
                      </View>
                    }
                  />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={s.memberName}>{member.name}</Text>
                    <Text style={s.memberMeta}>Order #{index + 1}</Text>
                  </View>
                  <View style={[s.rolePill, roleIsParent ? s.parentPill : s.childPill]}>
                    <Text style={[s.roleText, roleIsParent ? s.parentText : s.childText]}>{role}</Text>
                  </View>
                </View>

                <View style={s.detailGrid}>
                  <View style={s.detailRow}>
                    <View style={s.detailCell}>
                      <Text style={s.detailLabel}>PIN</Text>
                      <Text style={s.detailValue}>{member.pinHash ? 'Configured' : 'Not set'}</Text>
                    </View>
                    <View style={s.detailCell}>
                      <Text style={s.detailLabel}>Envelopes</Text>
                      <Text style={s.detailValue}>{(member.allowanceEnvelopes || []).length} total</Text>
                    </View>
                  </View>
                  <View style={s.detailCell}>
                    <Text style={s.detailLabel}>Email</Text>
                    <Text style={s.detailValue}>{member.email || 'No email'}</Text>
                  </View>
                  <View style={s.detailCell}>
                    <Text style={s.detailLabel}>View preferences</Text>
                    <Text style={s.detailValue}>
                      {member.viewShowChoreDescriptions ? 'Descriptions on' : 'Descriptions off'}
                      {' · '}
                      {member.viewShowTaskDetails ? 'Tasks on' : 'Tasks off'}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: E.bg },
  header:  { paddingHorizontal: SP.md, paddingTop: SP.md, paddingBottom: SP.sm, gap: SP.xs },
  title:   { fontFamily: 'serif', fontSize: 28, fontWeight: '700', color: E.ink },
  statusRow: { flexDirection: 'row', gap: SP.xs, flexWrap: 'wrap' },
  statusPill:     { borderWidth: 1, borderColor: E.border, borderRadius: R.pill, paddingHorizontal: SP.sm, paddingVertical: 4, backgroundColor: E.bgDeep },
  pillOk:         { borderColor: E.okBorder, backgroundColor: E.okBg },
  pillWarn:       { borderColor: E.warnBorder, backgroundColor: E.warnBg },
  statusPillText: { fontSize: 11, fontWeight: '500', color: E.inkSub },
  pillOkText:     { color: E.ok },
  pillWarnText:   { color: E.warn },

  content: { gap: SP.md, paddingHorizontal: SP.md, paddingBottom: SP.xl },

  noticeCard:    { margin: SP.md, borderRadius: R.lg, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.lg, gap: SP.sm },
  noticeTitle:   { fontFamily: 'serif', fontSize: 20, fontWeight: '700', color: E.ink },
  noticeBody:    { fontSize: 14, color: E.inkSub, lineHeight: 20, fontWeight: '300' },
  noticeActions: { alignItems: 'flex-end', marginTop: SP.xs },
  primaryBtn:    { minHeight: 38, paddingHorizontal: SP.lg, borderRadius: R.pill, backgroundColor: E.ink, alignItems: 'center', justifyContent: 'center' },

  emptyCard:  { borderRadius: R.lg, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.lg, gap: SP.xs },
  emptyTitle: { fontFamily: 'serif', fontSize: 18, fontWeight: '700', color: E.ink },
  emptyBody:  { fontSize: 13, color: E.inkMuted, lineHeight: 18, fontWeight: '300' },

  memberCard:   { borderRadius: R.lg, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.md, gap: SP.md },
  memberHeader: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  avatarImage:  { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: E.border },
  avatarFallback: { width: 52, height: 52, borderRadius: 26, backgroundColor: E.bgDeep, borderWidth: 1, borderColor: E.border, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontFamily: 'serif', fontSize: 20, fontWeight: '700', color: E.ink },
  memberName:   { fontFamily: 'serif', fontSize: 17, fontWeight: '700', color: E.ink },
  memberMeta:   { fontSize: 11, color: E.inkMuted, fontWeight: '300' },

  rolePill:   { borderWidth: 1, borderRadius: R.pill, paddingHorizontal: SP.sm, paddingVertical: 4 },
  parentPill: { borderColor: E.border, backgroundColor: E.bgDeep },
  childPill:  { borderColor: E.borderLight, backgroundColor: E.bgDeep },
  roleText:   { fontSize: 11, fontWeight: '600' },
  parentText: { color: E.ink },
  childText:  { color: E.inkSub },

  detailGrid: { gap: SP.xs },
  detailRow:  { flexDirection: 'row', gap: SP.xs },
  detailCell: { flex: 1, borderWidth: 1, borderColor: E.borderLight, borderRadius: R.sm, padding: SP.sm, gap: 2, backgroundColor: E.bgDeep },
  detailLabel:{ fontSize: 10, color: E.inkMuted, textTransform: 'uppercase', fontWeight: '600', letterSpacing: 0.6 },
  detailValue:{ fontSize: 13, color: E.ink, lineHeight: 18, fontWeight: '400' },
});
