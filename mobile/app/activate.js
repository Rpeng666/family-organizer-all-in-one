import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { mobileDeviceActivate } from '../src/lib/api-client';
import { getServerUrl, setServerUrl } from '../src/lib/server-url';
import { useAppSession } from '../src/providers/AppProviders';
import { useBootstrap } from './_layout';

// Fixed editorial palette — warm paper, not theme-dependent
const C = {
  bg: '#F5F3EE',
  surface: '#EFECE5',
  ink: '#111111',
  inkMuted: '#8E8A84',
  border: '#E0DBD3',
  accent: '#C8B89C',
  dangerText: '#9A3A2A',
  dangerBorder: 'rgba(154,58,42,0.22)',
  dangerBg: 'rgba(154,58,42,0.06)',
  successText: '#3A7A5A',
  white: '#FFFFFF',
};

function normalizeUrl(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, '');
}

// Minimal seal illustration — concentric circles with a small inner mark
function SealMark() {
  return (
    <View style={seal.outer}>
      <View style={seal.middle}>
        <View style={seal.dot} />
      </View>
    </View>
  );
}

const seal = StyleSheet.create({
  outer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.accent,
  },
});

export default function ActivateScreen() {
  const { completeActivation, activationRequired, activationIssue, clearActivationIssue, isBootstrapping } =
    useAppSession();
  const { rebootstrap } = useBootstrap();
  const [serverUrl, setServerUrlState] = useState(() => getServerUrl() || '');
  const [accessKey, setAccessKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [urlStatus, setUrlStatus] = useState('');

  useEffect(() => {
    if (!isBootstrapping && !activationRequired) {
      router.replace('/lock');
    }
  }, [isBootstrapping, activationRequired]);

  async function handleTestConnection() {
    const testUrl = normalizeUrl(serverUrl);
    if (!testUrl) { setUrlStatus('error'); return; }
    setUrlStatus('testing');
    try {
      await fetch(`${testUrl}/api/mobile/device-activate`, { method: 'HEAD' });
      setUrlStatus('ok');
    } catch {
      setUrlStatus('error');
    }
  }

  async function handleActivate() {
    setSubmitting(true);
    setError('');
    try {
      await setServerUrl(serverUrl);
      const result = await mobileDeviceActivate({
        accessKey: accessKey.trim(),
        platform: 'ios',
        deviceName: Constants.deviceName || 'iPhone',
        appVersion: Constants.expoConfig?.version,
      });
      await completeActivation(result.deviceSessionToken);
      await rebootstrap({ resetDb: true });
    } catch (e) {
      setError(e?.message || 'Activation failed');
    } finally {
      setSubmitting(false);
    }
  }

  const canActivate = !submitting && accessKey.trim() && serverUrl.trim();

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Illustration */}
          <View style={s.illustrationWrap}>
            <SealMark />
          </View>

          {/* Heading */}
          <Text style={s.heading}>Connect{'\n'}your device.</Text>
          <Text style={s.subtext}>
            Enter the address of your home server and the device access key to link this phone to your family organizer.
          </Text>

          {/* Re-activation issue */}
          {activationIssue ? (
            <View style={s.issueCard}>
              <Text style={s.issueTitle}>Re-activation required</Text>
              <Text style={s.issueBody}>{activationIssue.message}</Text>
              {activationIssue.details ? (
                <Text style={s.issueMeta} numberOfLines={2}>{activationIssue.details}</Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
                onPress={clearActivationIssue}
                style={s.issueDismiss}
              >
                <Text style={s.issueDismissText}>Dismiss</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Server URL */}
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>SERVER ADDRESS</Text>
            <View style={s.urlRow}>
              <TextInput
                testID="server-url-input"
                accessibilityLabel="Server URL"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={serverUrl}
                onChangeText={(text) => { setServerUrlState(text); setUrlStatus(''); }}
                placeholder="https://your-server.example.com"
                placeholderTextColor={C.border}
                style={[s.input, { flex: 1 }]}
              />
              <Pressable
                testID="test-connection-button"
                accessibilityRole="button"
                accessibilityLabel="Test connection"
                onPress={handleTestConnection}
                disabled={urlStatus === 'testing' || !serverUrl.trim()}
                style={({ pressed }) => [s.testBtn, pressed && s.pressed]}
              >
                <Text style={[s.testBtnText, (!serverUrl.trim() || urlStatus === 'testing') && s.testBtnDisabled]}>
                  {urlStatus === 'testing' ? 'Testing…' : 'Test'}
                </Text>
              </Pressable>
            </View>
            {urlStatus === 'ok' && <Text style={s.statusOk}>Server reachable</Text>}
            {urlStatus === 'error' && <Text style={s.statusError}>Could not reach server</Text>}
          </View>

          {/* Thin rule */}
          <View style={s.rule} />

          {/* Device key */}
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>DEVICE KEY</Text>
            <TextInput
              testID="activation-key-input"
              accessibilityLabel="Device access key"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              value={accessKey}
              onChangeText={setAccessKey}
              placeholder="Enter activation key"
              placeholderTextColor={C.border}
              style={s.input}
            />
          </View>

          {error ? <Text style={s.errorText}>{error}</Text> : null}

          {/* Primary action */}
          <View style={s.actionRow}>
            <Pressable
              testID="activate-device-button"
              accessibilityRole="button"
              accessibilityLabel={submitting ? 'Activating device' : 'Activate device'}
              disabled={!canActivate}
              onPress={handleActivate}
              style={({ pressed }) => [s.btn, !canActivate && s.btnDisabled, pressed && canActivate && s.pressed]}
            >
              <Text style={s.btnText}>
                {submitting ? 'Connecting…' : 'Continue'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: C.bg },
  content: {
    paddingHorizontal: 32,
    paddingTop: 52,
    paddingBottom: 52,
  },

  // Illustration
  illustrationWrap: {
    alignItems: 'center',
    marginBottom: 44,
  },

  // Typography
  heading: {
    fontFamily: 'serif',
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -0.5,
    color: C.ink,
    fontWeight: '700',
    marginBottom: 16,
  },
  subtext: {
    fontSize: 15,
    lineHeight: 24,
    color: C.inkMuted,
    fontWeight: '300',
    marginBottom: 40,
  },

  // Issue card
  issueCard: {
    borderWidth: 1,
    borderColor: C.dangerBorder,
    backgroundColor: C.dangerBg,
    borderRadius: 18,
    padding: 20,
    gap: 8,
    marginBottom: 32,
  },
  issueTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: C.dangerText,
    letterSpacing: 0.2,
  },
  issueBody: {
    fontSize: 14,
    color: C.dangerText,
    lineHeight: 20,
    fontWeight: '300',
    opacity: 0.85,
  },
  issueMeta: {
    fontSize: 12,
    color: C.dangerText,
    opacity: 0.6,
    lineHeight: 17,
  },
  issueDismiss: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  issueDismissText: {
    fontSize: 13,
    color: C.dangerText,
    fontWeight: '500',
    textDecorationLine: 'underline',
    textDecorationStyle: 'solid',
  },

  // Fields
  fieldGroup: {
    gap: 10,
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 10,
    letterSpacing: 1.8,
    color: C.inkMuted,
    fontWeight: '500',
  },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 12,
    fontSize: 15,
    color: C.ink,
    backgroundColor: 'transparent',
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  testBtn: {
    paddingBottom: 12,
    paddingLeft: 4,
  },
  testBtnText: {
    fontSize: 14,
    color: C.accent,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  testBtnDisabled: {
    opacity: 0.45,
  },
  statusOk: {
    fontSize: 13,
    color: C.successText,
    fontWeight: '400',
    marginTop: 2,
  },
  statusError: {
    fontSize: 13,
    color: C.dangerText,
    fontWeight: '400',
    marginTop: 2,
  },

  // Rule
  rule: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 28,
  },

  // Error
  errorText: {
    fontSize: 13,
    color: C.dangerText,
    fontWeight: '400',
    marginTop: 16,
    lineHeight: 19,
  },

  // Button
  actionRow: {
    marginTop: 40,
  },
  btn: {
    height: 52,
    backgroundColor: C.ink,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.3,
  },
  btnText: {
    color: C.white,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  pressed: {
    opacity: 0.7,
  },
});
