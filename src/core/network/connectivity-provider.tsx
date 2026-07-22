import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { AppState } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  isReachableConnection,
  networkCostForState,
  type NetworkCost,
  nextConnectivityTransition,
} from './connectivity-state';

type ConnectivityController = {
  isOnline: boolean;
  networkCost: NetworkCost;
  reconnectSequence: number;
};

const ConnectivityContext = createContext<ConnectivityController | null>(null);

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const previous = useRef<boolean | undefined>(undefined);
  const [isOnline, setIsOnline] = useState(true);
  const [networkCost, setNetworkCost] = useState<NetworkCost>('unknown');
  const [reconnectSequence, setReconnectSequence] = useState(0);

  const applyState = useCallback((state: NetInfoState) => {
    const next = isReachableConnection(state);
    const transition = nextConnectivityTransition(previous.current, next);
    if (previous.current === transition.online) return;

    previous.current = transition.online;
    onlineManager.setOnline(transition.online);
    setIsOnline(transition.online);
    setNetworkCost(networkCostForState(state));
    if (transition.reconnected) {
      setReconnectSequence((sequence) => sequence + 1);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(applyState);
    const appState = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void NetInfo.fetch().then(applyState);
      }
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, [applyState]);

  const value = useMemo(
    () => ({ isOnline, networkCost, reconnectSequence }),
    [isOnline, networkCost, reconnectSequence],
  );
  return (
    <ConnectivityContext.Provider value={value}>
      {children}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity(): ConnectivityController {
  const controller = useContext(ConnectivityContext);
  if (!controller) {
    throw new Error(
      'useConnectivity must be used inside ConnectivityProvider.',
    );
  }
  return controller;
}
