import { act, renderHook } from '@testing-library/react-native';
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { AppState } from 'react-native';
import { usePlaybackConsumption } from './use-playback-consumption';

const mockWrite = jest
  .fn<(...args: unknown[]) => Promise<string>>()
  .mockResolvedValue('queued');
const mockFlush = jest.fn<() => Promise<void>>().mockResolvedValue();
const mockDB = {};
let mockSubject: { id: string } | null = { id: 'one' };
jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => mockDB }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => `segment-${Math.random()}`,
}));
jest.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({ subject: mockSubject }),
}));
jest.mock('@/core/outbox/outbox-repository', () => ({
  enqueueInteraction: (...args: unknown[]) => mockWrite(...args),
}));
jest.mock('@/core/outbox/outbox-provider', () => ({
  useOutbox: () => ({ flush: mockFlush }),
}));
jest.mock('@/core/identity/installation-id', () => ({
  getInstallationId: async () => 'installation',
}));

beforeEach(() => {
  mockWrite.mockClear();
  mockFlush.mockClear();
  mockSubject = { id: 'one' };
});
describe('global playback collection', () => {
  it('continues after a screen handoff, persists partial background evidence and keeps identities apart', async () => {
    let now = 1000;
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
    let listener: ((state: string) => void) | undefined;
    const subscription = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, handler) => {
        listener = handler as (state: string) => void;
        return { remove: jest.fn() };
      });
    const base = {
      itemId: 'content',
      position: 0,
      duration: 300,
      playing: true,
      ended: false,
      rate: 1,
    };
    const view = await renderHook(
      (props: typeof base) => usePlaybackConsumption(props),
      { initialProps: base },
    );
    now += 10000;
    await view.rerender({ ...base, position: 10 });
    await act(async () => {
      view.result.current.handoff('content', 10);
    });
    now += 1000;
    await view.rerender({ ...base, position: 10 });
    now += 10000;
    await view.rerender({ ...base, position: 20 });
    await act(async () => {
      listener?.('background');
    });
    expect(mockWrite.mock.calls.at(-1)?.[1]).toBe('user:one');
    expect(mockWrite.mock.calls.at(-1)?.[2]).toMatchObject({
      metadata: { actual_played_seconds: 20, consumption_classification: 'sampled' },
    });
    const writes = mockWrite.mock.calls.length;
    mockSubject = { id: 'two' };
    now += 1000;
    await view.rerender({ ...base, position: 20 });
    expect(mockWrite).toHaveBeenCalledTimes(writes);
    now += 10000;
    await view.rerender({ ...base, position: 30 });
    await act(async () => {
      view.result.current.flush();
    });
    expect(mockWrite.mock.calls.at(-1)?.[1]).toBe('user:two');
    expect(mockWrite.mock.calls.at(-1)?.[2]).toMatchObject({
      metadata: { actual_played_seconds: 10 },
    });
    await view.unmount();
    subscription.mockRestore();
    clock.mockRestore();
  });
});
