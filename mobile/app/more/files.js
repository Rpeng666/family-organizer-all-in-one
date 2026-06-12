import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAppSession } from '../../src/providers/AppProviders';
import { clearPendingParentAction } from '../../src/lib/session-prefs';
import { useParentActionGate } from '../../src/hooks/useParentActionGate';
import { getPresignedFileUrl, getMobileFilesList } from '../../src/lib/api-client';
import { E, SP, R } from '../../src/theme/E';

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = Number(bytes) || 0;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatTimestamp(value) {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function FilesScreen() {
  const searchParams = useLocalSearchParams();
  const { requireParentAction } = useParentActionGate();
  const { principalType, isOnline } = useAppSession();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (firstParam(searchParams.resumeParentAction) !== '1') return;
    if (principalType !== 'parent') return;
    void clearPendingParentAction();
  }, [principalType, searchParams.resumeParentAction]);

  useEffect(() => {
    if (principalType !== 'parent') return;
    void loadFiles();
  }, [principalType]);

  async function handoffToParent() {
    await requireParentAction({
      actionId: 'more:open:files',
      actionLabel: 'Files',
      payload: { href: '/more/files' },
      returnPath: '/more/files',
    });
  }

  async function loadFiles() {
    setLoading(true);
    setError('');
    try {
      const response = await getMobileFilesList();
      setFiles(response.files || []);
    } catch (err) {
      setError(err?.message || 'Unable to load files.');
    } finally {
      setLoading(false);
    }
  }

  async function openFile(fileKey) {
    try {
      const url = await getPresignedFileUrl(fileKey);
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert('Unable to open file', err?.message || 'Please try again.');
    }
  }

  if (principalType !== 'parent') {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={E.bg} />
        <View style={s.header}>
          <Text style={s.title}>Files</Text>
        </View>
        <View style={s.noticeCard}>
          <Text style={s.noticeTitle}>Parent access required</Text>
          <Text style={s.noticeBody}>Log in as a parent to browse uploaded files and open them through the mobile bearer-auth route.</Text>
          <Pressable style={s.primaryBtn} onPress={() => { void handoffToParent(); }}>
            <Text style={s.primaryBtnText}>Switch to parent</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={E.bg} />

      <View style={s.header}>
        <View style={s.headerRow}>
          <Text style={s.title}>Files</Text>
          <Pressable style={s.refreshBtn} onPress={() => void loadFiles()}>
            <Text style={s.refreshBtnText}>{loading ? 'Refreshing…' : 'Refresh'}</Text>
          </Pressable>
        </View>
        <View style={s.statusRow}>
          <View style={[s.statusPill, isOnline ? s.pillOk : s.pillWarn]}>
            <Text style={[s.statusPillText, isOnline ? s.pillOkText : s.pillWarnText]}>{isOnline ? 'Online' : 'Offline'}</Text>
          </View>
          <View style={s.statusPill}>
            <Text style={s.statusPillText}>{files.length} files</Text>
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        <View style={s.infoCard}>
          <Text style={s.infoLabel}>Storage</Text>
          <Text style={s.infoTitle}>Mobile file browser</Text>
          <Text style={s.infoBody}>Opening a file uses the bearer-auth mobile route, so downloads stay aligned with the existing shared-device security model.</Text>
        </View>

        {loading ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyTitle}>Loading files…</Text>
          </View>
        ) : error ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyTitle}>Couldn't load files</Text>
            <Text style={s.emptyBody}>{error}</Text>
          </View>
        ) : files.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyTitle}>No uploaded files yet</Text>
            <Text style={s.emptyBody}>Once attachments or file-manager uploads land in this environment, they will appear here.</Text>
          </View>
        ) : (
          files.map((file) => (
            <View key={file.key} style={s.fileCard}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={s.fileName} numberOfLines={2}>{file.key}</Text>
                <Text style={s.fileMeta}>{formatSize(file.size)} · {formatTimestamp(file.lastModified)}</Text>
              </View>
              <Pressable style={s.openBtn} onPress={() => void openFile(file.key)}>
                <Text style={s.openBtnText}>Open</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: E.bg },
  header: { paddingHorizontal: SP.md, paddingTop: SP.md, paddingBottom: SP.sm, gap: SP.xs },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SP.sm },
  title:  { fontFamily: 'serif', fontSize: 28, fontWeight: '700', color: E.ink },

  refreshBtn:     { minHeight: 34, paddingHorizontal: SP.sm, borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, alignItems: 'center', justifyContent: 'center' },
  refreshBtnText: { fontSize: 12, fontWeight: '500', color: E.inkSub },

  statusRow:      { flexDirection: 'row', gap: SP.xs, flexWrap: 'wrap' },
  statusPill:     { borderWidth: 1, borderColor: E.border, borderRadius: R.pill, paddingHorizontal: SP.sm, paddingVertical: 4, backgroundColor: E.bgDeep },
  pillOk:         { borderColor: E.okBorder, backgroundColor: E.okBg },
  pillWarn:       { borderColor: E.warnBorder, backgroundColor: E.warnBg },
  statusPillText: { fontSize: 11, fontWeight: '500', color: E.inkSub },
  pillOkText:     { color: E.ok },
  pillWarnText:   { color: E.warn },

  content: { gap: SP.md, paddingHorizontal: SP.md, paddingBottom: SP.xl },

  noticeCard:     { margin: SP.md, borderRadius: R.lg, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.lg, gap: SP.sm },
  noticeTitle:    { fontFamily: 'serif', fontSize: 20, fontWeight: '700', color: E.ink },
  noticeBody:     { fontSize: 14, color: E.inkSub, lineHeight: 20, fontWeight: '300' },
  primaryBtn:     { minHeight: 40, paddingHorizontal: SP.lg, borderRadius: R.pill, backgroundColor: E.ink, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
  primaryBtnText: { fontSize: 13, color: E.white, fontWeight: '600' },

  infoCard:  { borderRadius: R.lg, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, padding: SP.md, gap: SP.xs },
  infoLabel: { fontSize: 10, color: E.inkMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  infoTitle: { fontFamily: 'serif', fontSize: 18, fontWeight: '700', color: E.ink },
  infoBody:  { fontSize: 13, color: E.inkSub, lineHeight: 18, fontWeight: '300' },

  emptyCard:  { borderRadius: R.lg, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.lg, gap: SP.xs },
  emptyTitle: { fontFamily: 'serif', fontSize: 18, fontWeight: '700', color: E.ink },
  emptyBody:  { fontSize: 13, color: E.inkMuted, lineHeight: 18, fontWeight: '300' },

  fileCard:  { borderRadius: R.lg, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.md, flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  fileName:  { fontSize: 13, color: E.ink, fontWeight: '500', lineHeight: 18 },
  fileMeta:  { fontSize: 11, color: E.inkMuted, lineHeight: 15, fontWeight: '300' },
  openBtn:     { minHeight: 34, paddingHorizontal: SP.sm, borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, alignItems: 'center', justifyContent: 'center' },
  openBtnText: { fontSize: 12, fontWeight: '500', color: E.inkSub },
});
