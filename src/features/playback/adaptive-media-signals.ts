import * as Battery from 'expo-battery';
import { AppState } from 'react-native';
import { useEffect, useMemo, useState } from 'react';

import { useConnectivity } from '@/core/network/connectivity-provider';

import type { NetworkCost } from './media-preparation-policy';

export type AdaptiveMediaSignals = {
  foreground: boolean;
  lowPowerMode: boolean;
  memoryPressure: boolean;
  network: NetworkCost;
};

/**
 * Normalizes only permission-free lifecycle signals. Memory pressure remains
 * conservative for the process lifetime because React Native provides no safe
 * “memory recovered” event; a fresh process starts with it cleared.
 */
export function useAdaptiveMediaSignals(): AdaptiveMediaSignals {
  const { networkCost } = useConnectivity();
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  const [lowPowerMode, setLowPowerMode] = useState(false);
  const [memoryPressure, setMemoryPressure] = useState(false);

  useEffect(() => {
    let mounted = true;
    void Battery.isLowPowerModeEnabledAsync()
      .then((enabled) => {
        if (mounted) setLowPowerMode(enabled);
      })
      // Unsupported simulators/web conservatively report the SDK default.
      .catch(() => undefined);
    const powerSubscription = Battery.addLowPowerModeListener((event) => {
      setLowPowerMode(event.lowPowerMode);
    });
    const appStateSubscription = AppState.addEventListener(
      'change',
      (nextState) => setForeground(nextState === 'active'),
    );
    const memorySubscription = AppState.addEventListener('memoryWarning', () =>
      setMemoryPressure(true),
    );
    return () => {
      mounted = false;
      powerSubscription.remove();
      appStateSubscription.remove();
      memorySubscription.remove();
    };
  }, []);

  return useMemo(
    () => ({ foreground, lowPowerMode, memoryPressure, network: networkCost }),
    [foreground, lowPowerMode, memoryPressure, networkCost],
  );
}
