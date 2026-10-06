import { expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useAdaptiveMediaSignals } from './adaptive-media-signals';

jest.mock('@/core/network/connectivity-provider', () => ({
  useConnectivity: () => ({ networkCost: 'wifi' }),
}));
jest.mock('expo-battery', () => ({
  isLowPowerModeEnabledAsync: async () => false,
  addLowPowerModeListener: () => ({ remove: () => undefined }),
}));

it('keeps the memory downgrade across route/component remounts in the same process', async () => {
  let warn!: () => void;
  const subscription = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((event, listener) => {
      if (event === 'memoryWarning') warn = listener as () => void;
      return { remove: () => undefined };
    });
  const first = await renderHook(useAdaptiveMediaSignals);
  expect(first.result.current.memoryPressure).toBe(false);
  await act(async () => warn());
  expect(first.result.current.memoryPressure).toBe(true);
  await first.unmount();
  const restored = await renderHook(useAdaptiveMediaSignals);
  expect(restored.result.current.memoryPressure).toBe(true);
  await restored.unmount();
  subscription.mockRestore();
});
