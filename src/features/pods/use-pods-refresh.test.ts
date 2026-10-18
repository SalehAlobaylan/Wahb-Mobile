import { act, renderHook } from '@testing-library/react-native';
import { expect, it, jest } from '@jest/globals';
import { usePodsRefresh } from './use-pods-refresh';

it('preserves current playback and pager while pending and after a failed replacement', async () => {
  let reject!: (error: Error) => void;
  const request = new Promise<boolean>((_, fail) => {
    reject = fail;
  });
  const committed = jest.fn(),
    failed = jest.fn();
  const hook = await renderHook(() =>
    usePodsRefresh({ replace: () => request, committed, failed }),
  );
  let completion!: Promise<void>;
  await act(() => {
    completion = hook.result.current.refresh();
  });
  expect(hook.result.current.refreshing).toBe(true);
  expect(committed).not.toHaveBeenCalled();
  await act(async () => {
    reject(new Error('offline'));
    await completion;
  });
  expect(committed).not.toHaveBeenCalled();
  expect(failed).toHaveBeenCalledTimes(1);
  expect(hook.result.current.refreshing).toBe(false);
  await hook.unmount();
});

it('changes playback only after commit and coalesces repeated refresh gestures', async () => {
  let resolve!: (value: boolean) => void;
  const request = new Promise<boolean>((done) => {
    resolve = done;
  });
  const replace = jest.fn(() => request),
    committed = jest.fn();
  const hook = await renderHook(() =>
    usePodsRefresh({ replace, committed, failed: jest.fn() }),
  );
  let completion!: Promise<void>;
  await act(() => {
    completion = hook.result.current.refresh();
    void hook.result.current.refresh();
  });
  expect(replace).toHaveBeenCalledTimes(1);
  expect(committed).not.toHaveBeenCalled();
  await act(async () => {
    resolve(true);
    await completion;
  });
  expect(committed).toHaveBeenCalledTimes(1);
  await hook.unmount();
});

it('does not change playback for a superseded replacement', async () => {
  const committed = jest.fn();
  const hook = await renderHook(() =>
    usePodsRefresh({
      replace: async () => false,
      committed,
      failed: jest.fn(),
    }),
  );
  await act(async () => {
    await hook.result.current.refresh();
  });
  expect(committed).not.toHaveBeenCalled();
  await hook.unmount();
});
