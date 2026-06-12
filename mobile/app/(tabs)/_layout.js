import React, { useState } from 'react';
import { Tabs, Redirect, router } from 'expo-router';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppSession } from '../../src/providers/AppProviders';
import { db } from '../../src/lib/instant-db';
import { AvatarPhotoImage } from '../../src/components/AvatarPhotoImage';
import { revokeMobileDeviceSession } from '../../src/lib/api-client';
import { countUnreadThreadMemberships } from '../../src/lib/message-memberships';
import { E, SP, R } from '../../src/theme/E';

function createInitials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
}

// Tab icon — simple geometric marks, no Ionicons dependency
function TabMark({ name, focused }) {
  const color = focused ? E.ink : E.border;
  const size = 18;
  const marks = {
    dashboard: () => (
      // 3×3 dot grid (today/sparkle concept)
      <View style={{ width: size, height: size, flexDirection: 'row', flexWrap: 'wrap', gap: 3, alignItems: 'center', justifyContent: 'center' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color }} />
        ))}
      </View>
    ),
    chores: () => (
      // Checkmark in circle
      <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: focused ? 0 : 1.5, borderColor: color, backgroundColor: focused ? E.ink : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 9, height: 5, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: focused ? E.bg : color, transform: [{ rotate: '-45deg' }], marginTop: -2 }} />
      </View>
    ),
    tasks: () => (
      // Three horizontal lines
      <View style={{ width: size, height: size, justifyContent: 'center', gap: 4 }}>
        {[10, 14, 10].map((w, i) => (
          <View key={i} style={{ height: 1.5, width: w, backgroundColor: color, borderRadius: 1 }} />
        ))}
      </View>
    ),
    calendar: () => (
      // Small calendar block
      <View style={{ width: size - 2, height: size - 2, borderRadius: 4, borderWidth: 1.5, borderColor: color, overflow: 'hidden', alignItems: 'center' }}>
        <View style={{ height: 5, width: '100%', backgroundColor: focused ? E.ink : E.border }} />
      </View>
    ),
    messages: () => (
      // Speech bubble outline
      <View style={{ width: size, height: size - 2, borderRadius: 6, borderWidth: 1.5, borderColor: color, alignItems: 'flex-end', justifyContent: 'flex-end', paddingRight: 3, paddingBottom: 1 }}>
        <View style={{ width: 5, height: 3, backgroundColor: color, borderRadius: 1 }} />
      </View>
    ),
    finance: () => (
      // Coin / circle with inner dot
      <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: focused ? E.ink : 'transparent', borderWidth: focused ? 0 : 1, borderColor: color }} />
      </View>
    ),
    more: () => (
      // 2×2 grid
      <View style={{ width: size, height: size, flexDirection: 'row', flexWrap: 'wrap', gap: 3.5, alignItems: 'center', justifyContent: 'center' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={{ width: 6, height: 6, borderRadius: 2, backgroundColor: color }} />
        ))}
      </View>
    ),
  };
  const render = marks[name];
  return render ? render() : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

export default function TabsLayout() {
  const {
    activationRequired,
    canRenderCachedData,
    currentUser,
    isAuthenticated,
    instantReady,
    isBootstrapping,
    isOffline,
    connectionStatus,
    principalType,
    lock,
    resetDeviceSession,
  } = useAppSession();
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);

  const unreadMessagesQuery = db.useQuery(
    isAuthenticated && instantReady && currentUser ? { messageThreadMembers: {} } : null
  );
  const unreadMessageCount = React.useMemo(
    () => countUnreadThreadMemberships(unreadMessagesQuery.data?.messageThreadMembers || []),
    [unreadMessagesQuery.data?.messageThreadMembers]
  );

  if (activationRequired) return <Redirect href="/activate" />;
  if (!isAuthenticated) return <Redirect href="/lock" />;

  if ((isBootstrapping && !canRenderCachedData) || !instantReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: E.bg }}>
        <ActivityIndicator size="small" color={E.accent} />
      </View>
    );
  }

  async function handleSwitchUser() {
    setProfileMenuVisible(false);
    await lock();
    router.replace('/lock?intent=switch-user');
  }

  async function handleLogout() {
    setProfileMenuVisible(false);
    try { await revokeMobileDeviceSession(); } catch {}
    await resetDeviceSession();
    router.replace('/activate');
  }

  function handleOpenSettings() {
    setProfileMenuVisible(false);
    router.push('/more/settings');
  }

  return (
    <>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: E.ink,
          tabBarInactiveTintColor: E.border,
          tabBarStyle: {
            backgroundColor: E.bg,
            borderTopWidth: 1,
            borderTopColor: E.borderLight,
            height: 72,
            paddingTop: 8,
            paddingBottom: 10,
            shadowColor: '#000',
            shadowOpacity: 0.04,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: -2 },
            elevation: 4,
          },
          tabBarItemStyle: { paddingTop: 2 },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '500',
            letterSpacing: 0.4,
          },
          tabBarIcon: ({ focused }) => {
            if (route.name === 'profile-menu') {
              return (
                <View style={[s.profileIcon, focused && s.profileIconFocused]}>
                  <AvatarPhotoImage
                    photoUrls={currentUser?.photoUrls}
                    preferredSize="64"
                    style={s.profileAvatar}
                    fallback={
                      <View style={s.profileFallback}>
                        <Text style={[s.profileFallbackText, focused && s.profileFallbackTextFocused]}>
                          {createInitials(currentUser?.name)}
                        </Text>
                      </View>
                    }
                  />
                </View>
              );
            }
            return <TabMark name={route.name} focused={focused} />;
          },
          sceneStyle: { backgroundColor: E.bg },
          tabBarBadge:
            route.name === 'messages' && unreadMessageCount > 0 ? String(unreadMessageCount)
            : route.name === 'more' && isOffline ? '!'
            : route.name === 'more' && principalType === 'parent' ? 'P'
            : undefined,
          tabBarBadgeStyle: {
            backgroundColor: isOffline ? E.dangerText : E.accentDeep,
            color: E.white,
            fontSize: 9,
            minWidth: 16,
            height: 16,
          },
        })}
      >
        <Tabs.Screen name="dashboard" options={{ title: 'Today',    tabBarButtonTestID: 'tab-dashboard' }} />
        <Tabs.Screen name="chores"    options={{ title: 'Chores',   tabBarButtonTestID: 'tab-chores' }} />
        <Tabs.Screen name="tasks"     options={{ title: 'Tasks',    tabBarButtonTestID: 'tab-tasks' }} />
        <Tabs.Screen name="calendar"  options={{ title: 'Calendar', tabBarButtonTestID: 'tab-calendar' }} />
        <Tabs.Screen name="messages"  options={{ title: 'Messages', tabBarButtonTestID: 'tab-messages' }} />
        <Tabs.Screen name="finance"   options={{ title: 'Finance',  tabBarButtonTestID: 'tab-finance' }} />
        <Tabs.Screen name="more"      options={{ title: 'More',     tabBarButtonTestID: 'tab-more' }} />
        <Tabs.Screen
          name="profile-menu"
          options={{ title: currentUser?.name || 'Me', tabBarButtonTestID: 'tab-profile-menu' }}
          listeners={{
            tabPress: (e) => { e.preventDefault(); setProfileMenuVisible(true); },
          }}
        />
      </Tabs>

      {/* Profile sheet */}
      <Modal visible={profileMenuVisible} transparent animationType="fade" onRequestClose={() => setProfileMenuVisible(false)}>
        <View style={s.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setProfileMenuVisible(false)} />
          <View style={s.sheet}>
            {/* Header */}
            <View style={s.sheetHeader}>
              <AvatarPhotoImage
                photoUrls={currentUser?.photoUrls}
                preferredSize="320"
                style={s.sheetAvatar}
                fallback={
                  <View style={s.sheetAvatarFallback}>
                    <Text style={s.sheetAvatarLetter}>{createInitials(currentUser?.name)}</Text>
                  </View>
                }
              />
              <View style={{ flex: 1 }}>
                <Text style={s.sheetName}>{currentUser?.name || 'Family member'}</Text>
                <Text style={s.sheetRole}>{currentUser?.role === 'parent' ? 'Parent' : 'Kid'}</Text>
              </View>
            </View>

            {/* Actions */}
            <View style={s.actions}>
              <Pressable accessibilityRole="button" testID="profile-menu-settings-button" onPress={handleOpenSettings}
                style={({ pressed }) => [s.actionRow, pressed && s.actionRowPressed]}>
                <Text style={s.actionLabel}>Settings</Text>
                <Text style={s.actionArrow}>›</Text>
              </Pressable>
              <Pressable accessibilityRole="button" testID="profile-menu-switch-user-button" onPress={() => { void handleSwitchUser(); }}
                style={({ pressed }) => [s.actionRow, s.actionRowBorder, pressed && s.actionRowPressed]}>
                <Text style={s.actionLabel}>Switch user</Text>
                <Text style={s.actionArrow}>›</Text>
              </Pressable>
              <Pressable accessibilityRole="button" testID="profile-menu-logout-button" onPress={() => { void handleLogout(); }}
                style={({ pressed }) => [s.actionRow, s.actionRowBorder, pressed && s.actionRowPressed]}>
                <Text style={[s.actionLabel, { color: E.danger }]}>Log out</Text>
              </Pressable>
            </View>

            <Pressable accessibilityRole="button" onPress={() => setProfileMenuVisible(false)} style={s.doneBtn}>
              <Text style={s.doneBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  // Profile tab icon
  profileIcon:            { width: 28, height: 28, borderRadius: 14, overflow: 'hidden' },
  profileIconFocused:     { borderWidth: 1.5, borderColor: E.ink },
  profileAvatar:          { width: 28, height: 28, borderRadius: 14 },
  profileFallback:        { width: 28, height: 28, borderRadius: 14, backgroundColor: E.bgDeep, alignItems: 'center', justifyContent: 'center' },
  profileFallbackText:    { fontSize: 10, fontWeight: '600', color: E.inkMuted },
  profileFallbackTextFocused: { color: E.ink },

  // Profile sheet
  overlay:          { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,17,17,0.2)' },
  sheet:            { backgroundColor: E.bg, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, borderTopWidth: 1, borderColor: E.border, paddingHorizontal: SP.md, paddingTop: SP.lg, paddingBottom: SP.xxl, gap: SP.md },
  sheetHeader:      { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  sheetAvatar:      { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: E.border },
  sheetAvatarFallback: { width: 52, height: 52, borderRadius: 26, backgroundColor: E.bgDeep, borderWidth: 1, borderColor: E.border, alignItems: 'center', justifyContent: 'center' },
  sheetAvatarLetter:   { fontFamily: 'serif', fontSize: 20, fontWeight: '700', color: E.ink },
  sheetName:        { fontFamily: 'serif', fontSize: 22, fontWeight: '700', color: E.ink },
  sheetRole:        { fontSize: 12, color: E.inkMuted, letterSpacing: 0.5, marginTop: 2 },

  actions:          { backgroundColor: E.surface, borderRadius: R.md, borderWidth: 1, borderColor: E.border, overflow: 'hidden' },
  actionRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SP.md, paddingVertical: 16 },
  actionRowBorder:  { borderTopWidth: 1, borderTopColor: E.borderLight },
  actionRowPressed: { backgroundColor: E.bgDeep },
  actionLabel:      { flex: 1, fontSize: 15, fontWeight: '400', color: E.ink },
  actionArrow:      { fontSize: 20, color: E.border, lineHeight: 22 },

  doneBtn:          { height: 52, backgroundColor: E.ink, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center' },
  doneBtnText:      { color: E.white, fontSize: 15, fontWeight: '600', letterSpacing: 0.3 },
});
