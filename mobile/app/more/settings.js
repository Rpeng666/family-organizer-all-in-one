import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { id, tx } from '@instantdb/react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAppSession } from '../../src/providers/AppProviders';
import { useAppTheme } from '../../src/theme/ThemeProvider';
import { clearPendingParentAction } from '../../src/lib/session-prefs';
import { useParentActionGate } from '../../src/hooks/useParentActionGate';
import { TaskSeriesGradeSettingsSection } from '../../src/features/task-series/grade-settings';
import { getServerUrl, setServerUrl } from '../../src/lib/server-url';
import {
  connectAppleCalendarSync,
  getAppleCalendarSyncStatus,
  runAppleCalendarSync,
  updateAppleCalendarSyncSettings,
} from '../../src/lib/api-client';
import { E, SP, R } from '../../src/theme/E';

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function placementLabel(value) {
  return value === 'after' ? 'After amount' : 'Before amount';
}

function formatExample(unit) {
  const amount = (unit.decimalPlaces ?? (unit.isMonetary ? 2 : 0)) > 0 ? '12.50' : '12';
  return unit.symbolPlacement === 'after'
    ? `${amount}${unit.symbolSpacing ? ' ' : ''}${unit.symbol}`
    : `${unit.symbol}${unit.symbolSpacing ? ' ' : ''}${amount}`;
}

function initialFormState() {
  return { code: '', name: '', symbol: '', isMonetary: true, decimalPlaces: '2', symbolPlacement: 'before', symbolSpacing: false };
}

function formatRelativeDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (absMs < 60_000) return rtf.format(Math.round(diffMs / 1000), 'second');
  if (absMs < 3_600_000) return rtf.format(Math.round(diffMs / 60_000), 'minute');
  if (absMs < 86_400_000) return rtf.format(Math.round(diffMs / 3_600_000), 'hour');
  return rtf.format(Math.round(diffMs / 86_400_000), 'day');
}

function formatDateWithRelative(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return `${date.toLocaleString()} (${formatRelativeDate(value)})`;
}

function formatDurationMs(value) {
  if (!value || value <= 0) return 'Right away';
  if (value < 60_000) return `${Math.round(value / 1000)}s`;
  if (value < 3_600_000) return `${Math.round(value / 60_000)}m`;
  if (value < 86_400_000) return `${Math.round(value / 3_600_000)}h`;
  return `${Math.round(value / 86_400_000)}d`;
}

function pollReasonLabel(value) {
  switch (value) {
    case 'recent_changes': return 'Active polling after recent changes';
    case 'idle_backoff': return 'Light backoff while calendars stay quiet';
    case 'idle_backoff_deep': return 'Deep backoff while calendars stay quiet';
    case 'error_backoff': return 'Retry backoff after recent errors';
    case 'first_run': return 'Waiting for the first poll';
    default: return 'Standard polling cadence';
  }
}

function isPollingHeartbeatOverdue(polling) {
  if (!polling?.lastSuccessfulPollAt) return false;
  const lastPollMs = new Date(polling.lastSuccessfulPollAt).getTime();
  if (Number.isNaN(lastPollMs)) return false;
  const nextPollMs = new Date(polling.nextPollAt || '').getTime();
  if (!Number.isNaN(nextPollMs)) return Date.now() > nextPollMs + 60_000;
  const intervalMs = Math.max(15_000, Number(polling?.pollIntervalMs) || 0);
  return Date.now() - lastPollMs > intervalMs + 60_000;
}

export default function SettingsScreen() {
  const searchParams = useLocalSearchParams();
  const { requireParentAction } = useParentActionGate();
  const { themeName, setThemeName, themeOptions } = useAppTheme();
  const {
    db,
    isAuthenticated,
    instantReady,
    principalType,
    isOnline,
    connectionStatus,
    resetDeviceSession,
  } = useAppSession();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(() => initialFormState());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const canManageUnits = principalType === 'parent';
  const [currentServerUrl, setCurrentServerUrl] = useState(() => getServerUrl());
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [editingUrl, setEditingUrl] = useState('');
  const [testStatus, setTestStatus] = useState('');
  const [calendarSyncStatus, setCalendarSyncStatus] = useState(null);
  const [calendarSyncLoading, setCalendarSyncLoading] = useState(false);
  const [calendarSyncError, setCalendarSyncError] = useState('');
  const [calendarSyncSaving, setCalendarSyncSaving] = useState(false);
  const [calendarSyncCredentialsDirty, setCalendarSyncCredentialsDirty] = useState(false);
  const [calendarSyncSelectionDirty, setCalendarSyncSelectionDirty] = useState(false);
  const [calendarSyncForm, setCalendarSyncForm] = useState({
    username: '',
    appSpecificPassword: '',
    accountLabel: 'Apple Calendar',
    selectedCalendarIds: [],
  });

  const currentThemeLabel = useMemo(
    () => themeOptions.find((o) => o.id === themeName)?.label || 'Warm Classic',
    [themeName, themeOptions]
  );

  useEffect(() => {
    if (firstParam(searchParams.resumeParentAction) !== '1') return;
    if (principalType !== 'parent') return;
    void clearPendingParentAction();
  }, [principalType, searchParams.resumeParentAction]);

  useEffect(() => {
    if (!canManageUnits) return;
    let cancelled = false;

    async function loadCalendarSyncStatus({ silent = false } = {}) {
      if (!silent) { setCalendarSyncLoading(true); setCalendarSyncError(''); }
      try {
        const nextStatus = await getAppleCalendarSyncStatus();
        if (cancelled) return;
        setCalendarSyncStatus(nextStatus);
        const nextSelectedCalendarIds = (nextStatus?.calendars || []).filter((c) => c.isEnabled).map((c) => c.remoteCalendarId);
        setCalendarSyncForm((current) => ({
          ...current,
          username: silent && calendarSyncCredentialsDirty ? current.username : (nextStatus?.account?.username || current.username),
          accountLabel: silent && calendarSyncCredentialsDirty ? current.accountLabel : (nextStatus?.account?.accountLabel || current.accountLabel),
          selectedCalendarIds: silent && calendarSyncSelectionDirty ? current.selectedCalendarIds : nextSelectedCalendarIds,
        }));
      } catch (nextError) {
        if (cancelled || silent) return;
        setCalendarSyncError(nextError?.message || 'Unable to load Apple Calendar sync status.');
      } finally {
        if (!cancelled && !silent) setCalendarSyncLoading(false);
      }
    }

    void loadCalendarSyncStatus();
    const intervalId = setInterval(() => { void loadCalendarSyncStatus({ silent: true }); }, 15_000);
    return () => { cancelled = true; clearInterval(intervalId); };
  }, [calendarSyncCredentialsDirty, calendarSyncSelectionDirty, canManageUnits]);

  const settingsQuery = db.useQuery(
    isAuthenticated && instantReady && principalType === 'parent'
      ? { unitDefinitions: { $: { order: { code: 'asc' } } }, settings: {} }
      : null
  );

  const unitDefinitions = useMemo(() => settingsQuery.data?.unitDefinitions || [], [settingsQuery.data?.unitDefinitions]);
  const settingsRows = useMemo(() => settingsQuery.data?.settings || [], [settingsQuery.data?.settings]);

  const calendarSyncSummary = useMemo(() => {
    if (!calendarSyncStatus?.configured) return { label: 'Not connected', body: 'Connect Apple Calendar to start importing events.', tone: 'muted' };
    if (calendarSyncSaving || calendarSyncLoading) return { label: 'Working', body: 'Refreshing sync status or sending a sync request.', tone: 'warn' };
    if (calendarSyncStatus?.lastRun?.status === 'running') return { label: 'Sync in progress', body: 'The server is processing Apple changes right now.', tone: 'ok' };
    if (calendarSyncStatus?.lastRun?.status === 'failed' || calendarSyncStatus?.account?.lastErrorMessage) {
      return { label: 'Needs attention', body: calendarSyncStatus?.account?.lastErrorMessage || calendarSyncStatus?.lastRun?.errorMessage || 'The last sync failed.', tone: 'danger' };
    }
    if (isPollingHeartbeatOverdue(calendarSyncStatus?.polling)) return { label: 'Polling overdue', body: 'The background poller has not checked in on schedule.', tone: 'warn' };
    if (calendarSyncStatus?.polling?.pollReason === 'error_backoff') return { label: 'Retry backoff', body: 'Polling is healthy but spacing checks after errors.', tone: 'warn' };
    return { label: 'Healthy', body: 'Polling is ready to pick up Apple changes quickly.', tone: 'ok' };
  }, [calendarSyncLoading, calendarSyncSaving, calendarSyncStatus]);

  async function handoffToParent() {
    await requireParentAction({ actionId: 'more:open:settings', actionLabel: 'Settings', payload: { href: '/more/settings' }, returnPath: '/more/settings' });
  }

  async function handleTestConnection() {
    setTestStatus('testing');
    try { await fetch(`${currentServerUrl}/api/mobile/device-activate`, { method: 'HEAD' }); setTestStatus('ok'); }
    catch { setTestStatus('error'); }
  }

  async function handleSaveUrl() {
    await setServerUrl(editingUrl);
    setCurrentServerUrl(getServerUrl());
    setIsEditingUrl(false);
    setTestStatus('');
    await resetDeviceSession();
  }

  async function handleCreateUnit() {
    if (submitting) return;
    const code = form.code.trim().toUpperCase();
    const name = form.name.trim();
    const symbol = form.symbol.trim();
    const decimalPlaces = Number(form.decimalPlaces);
    if (!code || code.length < 2) { setError('Enter a short unit code like USD, NPR, XP, or HR.'); return; }
    if (!name) { setError('Unit name is required.'); return; }
    if (!symbol) { setError('A display symbol is required.'); return; }
    if (!Number.isFinite(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 6) { setError('Decimal places must be between 0 and 6.'); return; }
    setSubmitting(true);
    setError('');
    try {
      await db.transact([tx.unitDefinitions[id()].update({ code, name, symbol, isMonetary: form.isMonetary, decimalPlaces, symbolPlacement: form.symbolPlacement, symbolSpacing: form.symbolSpacing })]);
      setForm(initialFormState());
      setIsModalOpen(false);
    } catch (nextError) {
      setError(nextError?.message || 'Unable to create the unit definition.');
    } finally {
      setSubmitting(false);
    }
  }

  async function refreshCalendarSyncStatus() {
    const nextStatus = await getAppleCalendarSyncStatus();
    setCalendarSyncStatus(nextStatus);
    const nextSelectedCalendarIds = (nextStatus?.calendars || []).filter((c) => c.isEnabled).map((c) => c.remoteCalendarId);
    setCalendarSyncForm((current) => ({ ...current, username: nextStatus?.account?.username || current.username, accountLabel: nextStatus?.account?.accountLabel || current.accountLabel, selectedCalendarIds: nextSelectedCalendarIds }));
  }

  async function handleConnectCalendarSync() {
    setCalendarSyncSaving(true); setCalendarSyncError('');
    try {
      await connectAppleCalendarSync(calendarSyncForm);
      setCalendarSyncCredentialsDirty(false); setCalendarSyncSelectionDirty(false);
      setCalendarSyncForm((current) => ({ ...current, appSpecificPassword: '' }));
      await refreshCalendarSyncStatus();
    } catch (nextError) { setCalendarSyncError(nextError?.message || 'Unable to connect Apple Calendar.'); }
    finally { setCalendarSyncSaving(false); }
  }

  async function handleSaveCalendarSelection() {
    if (!calendarSyncStatus?.account?.id) return;
    setCalendarSyncSaving(true); setCalendarSyncError('');
    try {
      const selectedCalendarIds = [...calendarSyncForm.selectedCalendarIds];
      await updateAppleCalendarSyncSettings({ accountId: calendarSyncStatus.account.id, selectedCalendarIds, enabled: true });
      setCalendarSyncSelectionDirty(false);
      setCalendarSyncStatus((current) => current ? { ...current, calendars: (current.calendars || []).map((c) => ({ ...c, isEnabled: selectedCalendarIds.includes(c.remoteCalendarId) })) } : current);
      void refreshCalendarSyncStatus();
    } catch (nextError) { setCalendarSyncError(nextError?.message || 'Unable to save Apple Calendar sync settings.'); }
    finally { setCalendarSyncSaving(false); }
  }

  async function handleRunCalendarSync(trigger = 'manual') {
    if (!calendarSyncStatus?.account?.id) return;
    setCalendarSyncSaving(true); setCalendarSyncError('');
    try {
      const result = await runAppleCalendarSync({ accountId: calendarSyncStatus.account.id, trigger });
      const completedAtIso = new Date().toISOString();
      setCalendarSyncStatus((current) => {
        if (!current?.account) return current;
        return {
          ...current,
          account: { ...current.account, lastAttemptedSyncAt: completedAtIso, lastSuccessfulSyncAt: result?.skipped ? current.account.lastSuccessfulSyncAt : completedAtIso, lastErrorAt: result?.skipped ? current.account.lastErrorAt : '', lastErrorMessage: result?.skipped ? current.account.lastErrorMessage : '' },
          lastRun: result?.skipped ? current.lastRun : { ...(current.lastRun || {}), status: 'success', errorMessage: '', finishedAt: completedAtIso, startedAt: completedAtIso },
          polling: current.polling ? { ...current.polling, lastSuccessfulPollAt: completedAtIso, nextPollAt: result?.nextPollAt || current.polling.nextPollAt, nextPollInMs: typeof result?.nextPollInMs === 'number' ? result.nextPollInMs : current.polling.nextPollInMs, pollIntervalMs: typeof result?.pollIntervalMs === 'number' ? result.pollIntervalMs : current.polling.pollIntervalMs, pollReason: result?.pollReason || current.polling.pollReason } : current.polling,
        };
      });
      await refreshCalendarSyncStatus();
    } catch (nextError) {
      setCalendarSyncError(nextError?.message || (trigger === 'repair' ? 'Unable to sync and rewrite Apple Calendar.' : 'Unable to run Apple Calendar sync.'));
    } finally { setCalendarSyncSaving(false); }
  }

  const summaryTone = { ok: { border: E.okBorder, bg: E.okBg, text: E.ok }, warn: { border: E.warnBorder, bg: E.warnBg, text: E.warn }, danger: { border: E.dangerBorder, bg: E.dangerBg, text: E.dangerText }, muted: { border: E.border, bg: E.bgDeep, text: E.inkMuted } };
  const syncTone = summaryTone[calendarSyncSummary.tone] || summaryTone.muted;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={E.bg} />

      <View style={s.header}>
        <View style={s.headerRow}>
          <Text style={s.title}>Settings</Text>
          {canManageUnits ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a unit definition"
              style={s.ghostBtn}
              onPress={() => { setError(''); setIsModalOpen(true); }}
            >
              <Text style={s.ghostBtnText}>+ Add Unit</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={s.statusRow}>
          <View style={[s.statusPill, isOnline ? s.pillOk : s.pillWarn]}>
            <Text style={[s.statusPillText, isOnline ? s.pillOkText : s.pillWarnText]}>{isOnline ? 'Online' : 'Offline'}</Text>
          </View>
          <View style={s.statusPill}>
            <Text style={s.statusPillText}>{currentThemeLabel}</Text>
          </View>
          {canManageUnits && connectionStatus ? (
            <View style={[s.statusPill, connectionStatus === 'authenticated' ? s.pillOk : s.statusPill]}>
              <Text style={[s.statusPillText, connectionStatus === 'authenticated' ? s.pillOkText : {}]}>
                {connectionStatus === 'authenticated' ? 'Connected' : connectionStatus}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>

        {/* Server connection */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Server Connection</Text>
          <Text style={s.sectionTitle}>API Server</Text>
          {isEditingUrl ? (
            <>
              <TextInput
                testID="settings-server-url-input"
                accessibilityLabel="Server URL"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={editingUrl}
                onChangeText={setEditingUrl}
                placeholder="https://your-server.example.com"
                placeholderTextColor={E.inkMuted}
                style={s.input}
              />
              <Text style={s.warningText}>Changing the server URL will require re-activation of this device.</Text>
              <View style={s.actionRow}>
                <Pressable style={s.ghostBtn} onPress={() => setIsEditingUrl(false)}>
                  <Text style={s.ghostBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={s.primaryBtn} onPress={() => void handleSaveUrl()}>
                  <Text style={s.primaryBtnText}>Save & Reconnect</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={s.monoText} numberOfLines={2}>{currentServerUrl}</Text>
              <View style={s.actionRow}>
                <Pressable style={s.ghostBtn} onPress={() => void handleTestConnection()} disabled={testStatus === 'testing'}>
                  <Text style={s.ghostBtnText}>{testStatus === 'testing' ? 'Testing…' : 'Test Connection'}</Text>
                </Pressable>
                <Pressable style={s.ghostBtn} onPress={() => { setEditingUrl(currentServerUrl); setIsEditingUrl(true); setTestStatus(''); }}>
                  <Text style={s.ghostBtnText}>Change URL</Text>
                </Pressable>
              </View>
              {testStatus === 'ok' ? <Text style={s.okText}>Server reachable</Text> : null}
              {testStatus === 'error' ? <Text style={s.errorText}>Could not reach server</Text> : null}
            </>
          )}
        </View>

        {/* Apple Calendar sync */}
        {canManageUnits ? (
          <View style={s.section}>
            <Text style={s.sectionLabel}>Apple Calendar Sync</Text>
            <Text style={s.sectionTitle}>Read-only import</Text>
            <Text style={s.sectionBody}>Connect one Apple account, choose which calendars to import, and sync events into the shared family calendar.</Text>

            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Apple ID Email</Text>
              <TextInput
                value={calendarSyncForm.username}
                onChangeText={(v) => { setCalendarSyncCredentialsDirty(true); setCalendarSyncForm((c) => ({ ...c, username: v })); }}
                placeholder="parent@example.com"
                placeholderTextColor={E.inkMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={s.input}
              />
            </View>

            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>App-Specific Password</Text>
              <TextInput
                value={calendarSyncForm.appSpecificPassword}
                onChangeText={(v) => { setCalendarSyncCredentialsDirty(true); setCalendarSyncForm((c) => ({ ...c, appSpecificPassword: v })); }}
                placeholder="xxxx-xxxx-xxxx-xxxx"
                placeholderTextColor={E.inkMuted}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={s.input}
              />
            </View>

            <View style={s.actionRow}>
              <Pressable style={s.ghostBtn} disabled={calendarSyncSaving || calendarSyncLoading} onPress={() => void refreshCalendarSyncStatus()}>
                <Text style={s.ghostBtnText}>{calendarSyncLoading ? 'Refreshing…' : 'Refresh'}</Text>
              </Pressable>
              <Pressable style={s.primaryBtn} disabled={calendarSyncSaving} onPress={() => void handleConnectCalendarSync()}>
                <Text style={s.primaryBtnText}>{calendarSyncSaving ? 'Connecting…' : calendarSyncStatus?.configured ? 'Reconnect' : 'Connect'}</Text>
              </Pressable>
            </View>

            {calendarSyncStatus?.configured ? (
              <>
                <Text style={s.okText}>Connected as {calendarSyncStatus.account?.username || 'Apple account'}</Text>
                <View style={[s.summaryBadge, { borderColor: syncTone.border, backgroundColor: syncTone.bg }]}>
                  <Text style={[s.summaryBadgeLabel, { color: syncTone.text }]}>{calendarSyncSummary.label}</Text>
                  <Text style={s.summaryBadgeBody}>{calendarSyncSummary.body}</Text>
                </View>
                <Text style={s.hintText}>Sync Now uses incremental Apple delta sync. Sync and Rewrite forces a full repair pass.</Text>
                <View style={s.dataGrid}>
                  {[
                    ['Last successful sync', formatDateWithRelative(calendarSyncStatus?.account?.lastSuccessfulSyncAt), null],
                    ['Last poll heartbeat', formatDateWithRelative(calendarSyncStatus?.polling?.lastSuccessfulPollAt), null],
                    ['Next poll', formatDateWithRelative(calendarSyncStatus?.polling?.nextPollAt), `About ${formatDurationMs(calendarSyncStatus?.polling?.nextPollInMs)}`],
                    ['Polling mode', pollReasonLabel(calendarSyncStatus?.polling?.pollReason), `Interval ${formatDurationMs(calendarSyncStatus?.polling?.pollIntervalMs)}`],
                  ].map(([label, value, hint]) => (
                    <View key={label} style={s.dataCell}>
                      <Text style={s.dataCellLabel}>{label}</Text>
                      <Text style={s.dataCellValue}>{value}</Text>
                      {hint ? <Text style={s.hintText}>{hint}</Text> : null}
                    </View>
                  ))}
                </View>
                <Text style={s.hintText}>Background polling only updates when the server worker or cron is hitting the Apple sync route.</Text>

                <View style={s.calendarList}>
                  {(calendarSyncStatus.calendars || []).map((calendar) => {
                    const selected = calendarSyncForm.selectedCalendarIds.includes(calendar.remoteCalendarId);
                    return (
                      <Pressable
                        key={calendar.id || calendar.remoteCalendarId}
                        style={[s.calendarChip, selected && s.calendarChipActive]}
                        onPress={() => {
                          setCalendarSyncSelectionDirty(true);
                          setCalendarSyncForm((current) => {
                            const ids = current.selectedCalendarIds.includes(calendar.remoteCalendarId)
                              ? current.selectedCalendarIds.filter((item) => item !== calendar.remoteCalendarId)
                              : [...current.selectedCalendarIds, calendar.remoteCalendarId];
                            return { ...current, selectedCalendarIds: ids };
                          });
                        }}
                      >
                        <Text style={[s.calendarChipText, selected && s.calendarChipTextActive]}>
                          {selected ? 'Imported' : 'Tap to import'} · {calendar.displayName}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={[s.actionRow, { flexWrap: 'wrap' }]}>
                  <Pressable style={s.ghostBtn} disabled={calendarSyncSaving} onPress={() => void handleSaveCalendarSelection()}>
                    <Text style={s.ghostBtnText}>{calendarSyncSaving ? 'Saving…' : 'Save Calendars'}</Text>
                  </Pressable>
                  <Pressable style={s.ghostBtn} disabled={calendarSyncSaving} onPress={() => void handleRunCalendarSync('manual')}>
                    <Text style={s.ghostBtnText}>{calendarSyncSaving ? 'Syncing…' : 'Sync Now'}</Text>
                  </Pressable>
                  <Pressable style={s.primaryBtn} disabled={calendarSyncSaving} onPress={() => void handleRunCalendarSync('repair')}>
                    <Text style={s.primaryBtnText}>{calendarSyncSaving ? 'Syncing…' : 'Sync and Rewrite'}</Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            {calendarSyncStatus?.lastRun?.errorMessage ? <Text style={s.errorText}>{calendarSyncStatus.lastRun.errorMessage}</Text> : null}
            {calendarSyncError ? <Text style={s.errorText}>{calendarSyncError}</Text> : null}
          </View>
        ) : null}

        {/* Theme picker */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Local Appearance</Text>
          <Text style={s.sectionTitle}>App theme</Text>
          <Text style={s.sectionBody}>This changes only this device. It does not sync to the family database.</Text>
          <View style={s.themeOptions}>
            {themeOptions.map((option) => {
              const selected = option.id === themeName;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${option.label} theme`}
                  style={[s.themeOption, selected && s.themeOptionActive]}
                  onPress={() => { void setThemeName(option.id); }}
                >
                  <View style={s.themeOptionHead}>
                    <Text style={[s.themeOptionLabel, selected && s.themeOptionLabelActive]}>{option.label}</Text>
                    <Text style={[s.themeOptionBadge, selected && s.themeOptionBadgeActive]}>{selected ? 'Selected' : 'Tap to apply'}</Text>
                  </View>
                  <Text style={s.themeOptionDesc}>{option.description}</Text>
                  <View style={s.themeSwatchRow}>
                    {option.preview.map((swatch) => (
                      <View key={`${option.id}-${swatch}`} style={[s.themeSwatch, { backgroundColor: swatch }]} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Unit definitions */}
        {canManageUnits ? (
          <>
            <View style={s.section}>
              <Text style={s.sectionLabel}>Household Units</Text>
              <Text style={s.sectionTitle}>Currency and rewards</Text>
              <Text style={s.sectionBody}>The shared unit catalog used by finance totals, chore rewards, and custom point systems.</Text>
            </View>

            <View style={s.panel}>
              <Text style={s.panelTitle}>Unit Definitions</Text>
              {settingsQuery.isLoading ? (
                <Text style={s.helperText}>Loading unit definitions…</Text>
              ) : unitDefinitions.length === 0 ? (
                <Text style={s.helperText}>No units defined yet.</Text>
              ) : (
                unitDefinitions.map((unit) => (
                  <View key={unit.id} style={s.unitCard}>
                    <View style={s.unitHead}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={s.unitCode}>{unit.code}</Text>
                        <Text style={s.unitName}>{unit.name}</Text>
                      </View>
                      <View style={[s.typePill, unit.isMonetary ? s.monetaryPill : s.customPill]}>
                        <Text style={[s.typePillText, unit.isMonetary ? s.monetaryText : s.customText]}>
                          {unit.isMonetary ? 'Monetary' : 'Custom'}
                        </Text>
                      </View>
                    </View>
                    <View style={s.metaRow}>
                      {[['Symbol', unit.symbol], ['Placement', placementLabel(unit.symbolPlacement)], ['Decimals', String(unit.decimalPlaces ?? 0)], ['Example', formatExample(unit)]].map(([label, value]) => (
                        <View key={label} style={s.metaCell}>
                          <Text style={s.metaCellLabel}>{label}</Text>
                          <Text style={s.metaCellValue}>{value}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={s.panel}>
              <Text style={s.panelTitle}>Raw Settings Rows</Text>
              {settingsRows.length === 0 ? (
                <Text style={s.helperText}>No raw settings rows found in this Instant app yet.</Text>
              ) : (
                settingsRows.map((row) => (
                  <View key={row.id} style={s.settingRow}>
                    <Text style={s.settingName}>{row.name}</Text>
                    <Text style={s.settingValue}>{row.value}</Text>
                  </View>
                ))
              )}
            </View>

            <TaskSeriesGradeSettingsSection />
          </>
        ) : (
          <View style={s.noticeCard}>
            <Text style={s.noticeTitle}>Parent access required</Text>
            <Text style={s.noticeBody}>Log in as a parent to review shared currency settings and create new unit definitions. The theme switch above is already available.</Text>
            <Pressable style={s.primaryBtn} onPress={() => { void handoffToParent(); }}>
              <Text style={s.primaryBtnText}>Switch to parent</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* New unit modal */}
      <Modal visible={canManageUnits && isModalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsModalOpen(false)}>
        <SafeAreaView style={s.modalSafe}>
          <View style={s.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle}>New Unit Definition</Text>
              <Text style={s.modalSubtitle}>Create a shared currency or custom reward unit.</Text>
            </View>
            <Pressable style={s.ghostBtn} onPress={() => setIsModalOpen(false)}>
              <Text style={s.ghostBtnText}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={s.formContent} showsVerticalScrollIndicator={false}>
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Code</Text>
              <TextInput value={form.code} onChangeText={(v) => setForm((c) => ({ ...c, code: v.toUpperCase() }))} placeholder="USD" placeholderTextColor={E.inkMuted} autoCapitalize="characters" style={s.input} />
            </View>
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Name</Text>
              <TextInput value={form.name} onChangeText={(v) => setForm((c) => ({ ...c, name: v }))} placeholder="US Dollar" placeholderTextColor={E.inkMuted} style={s.input} />
            </View>
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Symbol</Text>
              <TextInput value={form.symbol} onChangeText={(v) => setForm((c) => ({ ...c, symbol: v }))} placeholder="$" placeholderTextColor={E.inkMuted} style={s.input} />
            </View>

            <View style={s.toggleRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.toggleTitle}>Monetary unit</Text>
                <Text style={s.toggleBody}>Turn off for points, stars, hours, and non-cash rewards.</Text>
              </View>
              <Switch value={form.isMonetary} onValueChange={(v) => setForm((c) => ({ ...c, isMonetary: v }))} trackColor={{ false: E.border, true: E.ok }} thumbColor={E.white} />
            </View>

            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Decimal Places</Text>
              <TextInput value={form.decimalPlaces} onChangeText={(v) => setForm((c) => ({ ...c, decimalPlaces: v }))} placeholder="2" placeholderTextColor={E.inkMuted} keyboardType="number-pad" style={s.input} />
            </View>

            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Symbol Placement</Text>
              <View style={s.choiceRow}>
                {['before', 'after'].map((value) => {
                  const selected = form.symbolPlacement === value;
                  return (
                    <Pressable key={value} style={[s.choiceChip, selected && s.choiceChipActive]} onPress={() => setForm((c) => ({ ...c, symbolPlacement: value }))}>
                      <Text style={[s.choiceChipText, selected && s.choiceChipTextActive]}>{placementLabel(value)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={s.toggleRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.toggleTitle}>Add spacing</Text>
                <Text style={s.toggleBody}>Examples: $ 12.50 or 12.50 XP.</Text>
              </View>
              <Switch value={form.symbolSpacing} onValueChange={(v) => setForm((c) => ({ ...c, symbolSpacing: v }))} trackColor={{ false: E.border, true: E.ok }} thumbColor={E.white} />
            </View>

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <View style={s.actionRow}>
              <Pressable style={[s.ghostBtn, { flex: 1 }]} onPress={() => setIsModalOpen(false)}>
                <Text style={s.ghostBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={[s.primaryBtn, { flex: 1 }]} onPress={() => void handleCreateUnit()}>
                <Text style={s.primaryBtnText}>{submitting ? 'Saving…' : 'Create Unit'}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: E.bg },
  header: { paddingHorizontal: SP.md, paddingTop: SP.md, paddingBottom: SP.sm, gap: SP.xs },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SP.sm },
  title:  { fontFamily: 'serif', fontSize: 28, fontWeight: '700', color: E.ink },

  statusRow:      { flexDirection: 'row', gap: SP.xs, flexWrap: 'wrap' },
  statusPill:     { borderWidth: 1, borderColor: E.border, borderRadius: R.pill, paddingHorizontal: SP.sm, paddingVertical: 4, backgroundColor: E.bgDeep },
  pillOk:         { borderColor: E.okBorder, backgroundColor: E.okBg },
  pillWarn:       { borderColor: E.warnBorder, backgroundColor: E.warnBg },
  statusPillText: { fontSize: 11, fontWeight: '500', color: E.inkSub },
  pillOkText:     { color: E.ok },
  pillWarnText:   { color: E.warn },

  content: { gap: SP.md, paddingHorizontal: SP.md, paddingBottom: SP.xl },

  section:      { borderRadius: R.lg, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.md, gap: SP.sm },
  sectionLabel: { fontSize: 10, color: E.inkMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionTitle: { fontFamily: 'serif', fontSize: 22, fontWeight: '700', color: E.ink },
  sectionBody:  { fontSize: 13, color: E.inkSub, lineHeight: 18, fontWeight: '300' },

  input: { borderWidth: 1, borderColor: E.border, borderRadius: R.md, backgroundColor: E.bgDeep, color: E.ink, paddingHorizontal: SP.sm, paddingVertical: 12, fontSize: 14 },
  monoText:    { fontFamily: 'Courier', fontSize: 13, color: E.ink, lineHeight: 18 },
  warningText: { fontSize: 12, color: E.warn, lineHeight: 18, fontWeight: '400' },
  okText:      { fontSize: 13, color: E.ok, fontWeight: '500' },
  errorText:   { fontSize: 13, color: E.dangerText, fontWeight: '500' },
  hintText:    { fontSize: 11, color: E.inkMuted, lineHeight: 16, fontWeight: '300' },

  actionRow:   { flexDirection: 'row', gap: SP.xs },
  ghostBtn:    { minHeight: 36, paddingHorizontal: SP.sm, borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, alignItems: 'center', justifyContent: 'center' },
  ghostBtnText:{ fontSize: 12, fontWeight: '500', color: E.inkSub },
  primaryBtn:      { minHeight: 36, paddingHorizontal: SP.sm, borderRadius: R.pill, backgroundColor: E.ink, borderWidth: 1, borderColor: E.ink, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText:  { fontSize: 12, color: E.white, fontWeight: '600' },

  summaryBadge:      { borderWidth: 1, borderRadius: R.md, padding: SP.sm, gap: 3 },
  summaryBadgeLabel: { fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
  summaryBadgeBody:  { fontSize: 12, color: E.inkSub, lineHeight: 16, fontWeight: '300' },

  dataGrid: { gap: SP.xs },
  dataCell:      { borderWidth: 1, borderColor: E.borderLight, borderRadius: R.sm, backgroundColor: E.bgDeep, padding: SP.sm, gap: 2 },
  dataCellLabel: { fontSize: 10, color: E.inkMuted, textTransform: 'uppercase', fontWeight: '600', letterSpacing: 0.4 },
  dataCellValue: { fontSize: 13, color: E.ink, fontWeight: '500' },

  calendarList:        { gap: SP.xs },
  calendarChip:        { minHeight: 36, paddingHorizontal: SP.sm, borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, alignItems: 'center', justifyContent: 'center' },
  calendarChipActive:  { borderColor: E.ok, backgroundColor: E.okBg },
  calendarChipText:    { fontSize: 12, color: E.inkSub, fontWeight: '400' },
  calendarChipTextActive: { color: E.ok, fontWeight: '500' },

  themeOptions:   { gap: SP.sm },
  themeOption:    { borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, borderRadius: R.md, padding: SP.md, gap: SP.xs },
  themeOptionActive: { borderColor: E.ink, backgroundColor: E.surface },
  themeOptionHead:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: SP.sm },
  themeOptionLabel:  { fontFamily: 'serif', fontSize: 16, fontWeight: '700', color: E.ink, flex: 1 },
  themeOptionLabelActive: { color: E.ink },
  themeOptionBadge:  { fontSize: 11, color: E.inkMuted, fontWeight: '400' },
  themeOptionBadgeActive: { color: E.ink, fontWeight: '600' },
  themeOptionDesc:   { fontSize: 12, color: E.inkSub, lineHeight: 17, fontWeight: '300' },
  themeSwatchRow: { flexDirection: 'row', gap: SP.xs, paddingTop: 2 },
  themeSwatch:    { width: 18, height: 18, borderRadius: R.pill, borderWidth: 1, borderColor: E.borderLight },

  panel:     { borderRadius: R.lg, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.md, gap: SP.sm },
  panelTitle:{ fontFamily: 'serif', fontSize: 17, fontWeight: '700', color: E.ink },
  helperText:{ fontSize: 13, color: E.inkMuted, fontWeight: '300' },

  unitCard:  { borderWidth: 1, borderColor: E.borderLight, borderRadius: R.md, backgroundColor: E.bgDeep, padding: SP.sm, gap: SP.sm },
  unitHead:  { flexDirection: 'row', justifyContent: 'space-between', gap: SP.sm, alignItems: 'flex-start' },
  unitCode:  { fontFamily: 'serif', fontSize: 17, fontWeight: '700', color: E.ink },
  unitName:  { fontSize: 12, color: E.inkMuted, fontWeight: '300' },
  typePill:       { borderWidth: 1, borderRadius: R.pill, paddingHorizontal: SP.sm, paddingVertical: 4 },
  monetaryPill:   { borderColor: E.okBorder, backgroundColor: E.okBg },
  customPill:     { borderColor: E.warnBorder, backgroundColor: E.warnBg },
  typePillText:   { fontSize: 11, fontWeight: '600' },
  monetaryText:   { color: E.ok },
  customText:     { color: E.warn },
  metaRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs },
  metaCell:       { flex: 1, minWidth: '40%', borderWidth: 1, borderColor: E.borderLight, borderRadius: R.sm, padding: SP.xs, gap: 1 },
  metaCellLabel:  { fontSize: 9, color: E.inkMuted, textTransform: 'uppercase', fontWeight: '600', letterSpacing: 0.4 },
  metaCellValue:  { fontSize: 12, color: E.ink, fontWeight: '500' },

  settingRow:   { borderWidth: 1, borderColor: E.borderLight, borderRadius: R.sm, padding: SP.sm, gap: 3 },
  settingName:  { fontSize: 12, color: E.ink, fontWeight: '600' },
  settingValue: { fontSize: 11, color: E.inkMuted, lineHeight: 16, fontWeight: '300' },

  noticeCard:  { borderRadius: R.lg, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.lg, gap: SP.sm },
  noticeTitle: { fontFamily: 'serif', fontSize: 18, fontWeight: '700', color: E.ink },
  noticeBody:  { fontSize: 13, color: E.inkSub, lineHeight: 18, fontWeight: '300' },

  // Modal
  modalSafe:     { flex: 1, backgroundColor: E.bg },
  modalHeader:   { flexDirection: 'row', alignItems: 'flex-start', gap: SP.md, paddingHorizontal: SP.md, paddingTop: SP.md, paddingBottom: SP.sm },
  modalTitle:    { fontFamily: 'serif', fontSize: 22, fontWeight: '700', color: E.ink },
  modalSubtitle: { fontSize: 13, color: E.inkSub, lineHeight: 18, marginTop: 3, fontWeight: '300' },

  formContent: { gap: SP.md, paddingHorizontal: SP.md, paddingBottom: SP.xl },
  fieldGroup:  { gap: 6 },
  fieldLabel:  { fontSize: 12, color: E.inkSub, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  toggleRow:   { flexDirection: 'row', alignItems: 'center', gap: SP.md, borderWidth: 1, borderColor: E.border, borderRadius: R.md, backgroundColor: E.bgDeep, padding: SP.md },
  toggleTitle: { fontSize: 14, color: E.ink, fontWeight: '500' },
  toggleBody:  { fontSize: 12, color: E.inkMuted, lineHeight: 16, fontWeight: '300' },
  choiceRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs },
  choiceChip:       { minHeight: 34, paddingHorizontal: SP.sm, borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, alignItems: 'center', justifyContent: 'center' },
  choiceChipActive: { borderColor: E.ink, backgroundColor: E.ink },
  choiceChipText:   { fontSize: 12, color: E.inkSub, fontWeight: '400' },
  choiceChipTextActive: { color: E.white, fontWeight: '600' },
});
