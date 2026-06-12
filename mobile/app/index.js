import React from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAppSession } from '../src/providers/AppProviders';
import { useAppTheme } from '../src/theme/ThemeProvider';

export default function IndexScreen() {
  const { isBootstrapping, activationRequired, isAuthenticated } = useAppSession();
  const { colors } = useAppTheme();

  if (isBootstrapping) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.accentChores} />
      </View>
    );
  }

  // Activation is a device-session concern only. Instant readiness should
  // recover on lock/tabs via loading + retry without forcing re-activation.
  const needsActivation = activationRequired;
  const targetRoute = needsActivation ? '/activate' : isAuthenticated ? '/dashboard' : '/lock';
  return <Redirect href={targetRoute} />;
}
