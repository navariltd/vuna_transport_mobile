import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

type ConnectivityContextValue = {
  isConnected: boolean;
  isInternetReachable: boolean;
  isOffline: boolean;
};

const ConnectivityContext = createContext<ConnectivityContextValue>({
  isConnected: true,
  isInternetReachable: true,
  isOffline: false,
});

export function ConnectivityProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<NetInfoState | null>(null);

  useEffect(() => NetInfo.addEventListener(setState), []);

  const value = useMemo(() => {
    const isConnected = state?.isConnected !== false;
    const isInternetReachable = state?.isInternetReachable !== false;
    return { isConnected, isInternetReachable, isOffline: !isConnected || !isInternetReachable };
  }, [state]);

  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity() {
  return useContext(ConnectivityContext);
}
