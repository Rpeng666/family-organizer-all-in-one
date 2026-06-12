import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

const NetworkStatusContext = createContext(null);

function computeOnline(state) {
  if (!state) return true;
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

export function NetworkStatusProvider({ children }) {
  const [networkState, setNetworkState] = useState(null);

  useEffect(() => {
    let isMounted = true;

    NetInfo.fetch().then((state) => {
      if (isMounted) setNetworkState(state);
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      setNetworkState(state);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      networkState,
      isOnline: computeOnline(networkState),
      isOffline: !computeOnline(networkState),
    }),
    [networkState]
  );

  return <NetworkStatusContext.Provider value={value}>{children}</NetworkStatusContext.Provider>;
}

export function useNetworkStatus() {
  const value = useContext(NetworkStatusContext);
  if (!value) {
    throw new Error('useNetworkStatus must be used inside NetworkStatusProvider');
  }
  return value;
}

