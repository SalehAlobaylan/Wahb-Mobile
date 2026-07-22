export type NativeConnectivity = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  type?: 'wifi' | 'cellular' | 'unknown' | 'none' | string;
};

export type NetworkCost = 'wifi' | 'cellular' | 'offline' | 'unknown';

export type ConnectivityTransition = {
  online: boolean;
  reconnected: boolean;
};

// A connected transport with unknown reachability is treated as online. Native
// reachability begins as null on several platforms; treating that startup state
// as offline would unnecessarily pause initial queries and outbox delivery.
export function isReachableConnection(state: NativeConnectivity): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

/** Maps the permission-free NetInfo transport class into preparation policy. */
export function networkCostForState(state: NativeConnectivity): NetworkCost {
  if (!isReachableConnection(state)) return 'offline';
  if (state.type === 'wifi') return 'wifi';
  if (state.type === 'cellular') return 'cellular';
  return 'unknown';
}

export function nextConnectivityTransition(
  previous: boolean | undefined,
  next: boolean,
): ConnectivityTransition {
  return {
    online: next,
    reconnected: previous === false && next,
  };
}
