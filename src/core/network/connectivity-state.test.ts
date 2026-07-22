import {
  isReachableConnection,
  networkCostForState,
  nextConnectivityTransition,
} from './connectivity-state';
import { describe, expect, it } from '@jest/globals';

describe('connectivity state', () => {
  const cases: [
    { isConnected: boolean | null; isInternetReachable: boolean | null },
    boolean,
  ][] = [
    [{ isConnected: true, isInternetReachable: true }, true],
    [{ isConnected: true, isInternetReachable: null }, true],
    [{ isConnected: true, isInternetReachable: false }, false],
    [{ isConnected: false, isInternetReachable: true }, false],
    [{ isConnected: null, isInternetReachable: null }, false],
  ];

  it.each(cases)('normalizes native state %#', (state, expected) => {
    expect(isReachableConnection(state)).toBe(expected);
  });

  it('emits reconnect only for an offline-to-online edge', () => {
    expect(nextConnectivityTransition(undefined, true)).toEqual({
      online: true,
      reconnected: false,
    });
    expect(nextConnectivityTransition(true, true)).toEqual({
      online: true,
      reconnected: false,
    });
    expect(nextConnectivityTransition(false, true)).toEqual({
      online: true,
      reconnected: true,
    });
  });

  it.each([
    [{ isConnected: true, isInternetReachable: true, type: 'wifi' }, 'wifi'],
    [
      { isConnected: true, isInternetReachable: true, type: 'cellular' },
      'cellular',
    ],
    [
      { isConnected: true, isInternetReachable: true, type: 'unknown' },
      'unknown',
    ],
    [
      { isConnected: false, isInternetReachable: false, type: 'wifi' },
      'offline',
    ],
  ])(
    'maps native network state to bounded preparation cost',
    (state, expected) => {
      expect(networkCostForState(state)).toBe(expected);
    },
  );
});
