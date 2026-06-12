import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppProviders } from '../src/providers/AppProviders';
import { recordDiagnostic } from '../src/lib/diagnostics';
import { ThemeProvider, useAppTheme } from '../src/theme/ThemeProvider';
import { preloadServerConfig, preloadServerUrl, refreshServerConfig } from '../src/lib/server-url';
import { getInstantDbConfig, initInstantDb, resetInstantDb } from '../src/lib/instant-db';

const BootstrapContext = createContext(null);

export function useBootstrap() {
  return useContext(BootstrapContext);
}

function ServerUrlGate({ children }) {
  const [ready, setReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState(null);
  // Incrementing the key forces AppProviders to fully remount after re-bootstrap
  const [mountKey, setMountKey] = useState(0);

  const runBootstrap = useCallback(async ({ resetDb = false } = {}) => {
    setBootstrapError(null);
    recordDiagnostic('bootstrap_config', 'start', { resetDb });
    await preloadServerUrl();
    const cachedConfig = await preloadServerConfig();
    recordDiagnostic('bootstrap_config', 'cache_probe', {
      hasCachedConfig: Boolean(cachedConfig?.instantAppId),
    });

    if (resetDb) {
      resetInstantDb();
    }

    if (cachedConfig?.instantAppId) {
      recordDiagnostic('bootstrap_config', 'init_from_cache', {
        appId: cachedConfig.instantAppId,
      });
      await initInstantDb(
        {
          appId: cachedConfig.instantAppId,
          apiURI: cachedConfig.instantApiURI,
          websocketURI: cachedConfig.instantWebsocketURI,
        },
        { force: resetDb }
      );
      void refreshServerConfig().catch((error) => {
        console.warn('[ServerUrlGate] Background config refresh failed.', error);
        recordDiagnostic('bootstrap_config_refresh', 'error', {
          status: error?.status || null,
          message: error?.message || 'unknown',
        });
      });
      return;
    }

    const config = await refreshServerConfig();
    if (config?.instantAppId) {
      recordDiagnostic('bootstrap_config', 'init_from_network', {
        appId: config.instantAppId,
      });
      const currentConfig = getInstantDbConfig();
      const needsForceInit =
        resetDb ||
        !currentConfig ||
        currentConfig.appId !== config.instantAppId ||
        currentConfig.apiURI !== config.instantApiURI ||
        currentConfig.websocketURI !== config.instantWebsocketURI;
      await initInstantDb(
        {
          appId: config.instantAppId,
          apiURI: config.instantApiURI,
          websocketURI: config.instantWebsocketURI,
        },
        { force: needsForceInit }
      );
      return;
    }

    recordDiagnostic('bootstrap_config', 'missing', null);
    throw new Error('Could not load the mobile server configuration.');
  }, []);

  useEffect(() => {
    let cancelled = false;

    void runBootstrap()
      .catch((error) => {
        if (!cancelled) {
          console.warn('[ServerUrlGate] Bootstrap failed; continuing with stub providers.', error);
          setBootstrapError(error);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [runBootstrap]);

  const rebootstrap = useCallback(async (options = {}) => {
    setReady(false);
    try {
      await runBootstrap(options);
      setMountKey((k) => k + 1);
    } catch (error) {
      console.warn('[ServerUrlGate] Rebootstrap failed.', error);
      setBootstrapError(error);
      throw error;
    } finally {
      setReady(true);
    }
  }, [runBootstrap]);

  if (!ready) {
    return <BootstrapSplash />;
  }

  return (
    <BootstrapContext.Provider value={{ rebootstrap, bootstrapError }}>
      <React.Fragment key={mountKey}>{children}</React.Fragment>
    </BootstrapContext.Provider>
  );
}

function BootstrapSplash() {
  const { colors } = useAppTheme();

  return (
    <>
      <StatusBar style="dark" backgroundColor={colors.bg} />
      <View style={{ flex: 1, backgroundColor: colors.canvasStrong, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
        <ActivityIndicator size="large" color={colors.canvasText} />
        <Text style={{ color: colors.canvasText, fontSize: 18, fontWeight: '800', textAlign: 'center' }}>Preparing Family Organizer</Text>
        <Text style={{ color: colors.canvasTextMuted, textAlign: 'center', lineHeight: 20 }}>
          Connecting this device to the saved family server.
        </Text>
      </View>
    </>
  );
}

function RootNavigator() {
  const { colors } = useAppTheme();

  return (
    <>
      <StatusBar style="dark" backgroundColor={colors.bg} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'fade',
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <ServerUrlGate>
          <AppProviders>
            <RootNavigator />
          </AppProviders>
        </ServerUrlGate>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
