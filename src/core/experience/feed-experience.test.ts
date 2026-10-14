import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import type { MockedFunction } from 'jest-mock';
import { emitEvent } from './collector';
import { setExperienceForeground } from './lifecycle';
import {
  useFeedExperience,
  startExperiencePagination,
  commitExperienceUnits,
  experienceBoundaryReached,
} from './use-feed-experience';
jest.mock('./collector', () => ({ emitEvent: jest.fn() }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => '00000000-0000-4000-8000-000000000001',
}));
const terminals = () =>
  (emitEvent as MockedFunction<typeof emitEvent>).mock.calls
    .map((call) => call[0])
    .filter((event) => event.event_type === 'journey_terminal');
beforeEach(() => {
  jest.useFakeTimers();
  setExperienceForeground(true);
  (emitEvent as MockedFunction<typeof emitEvent>).mockClear();
});
afterEach(() => {
  setExperienceForeground(false);
  jest.clearAllTimers();
  jest.useRealTimers();
});
it('network completion alone cannot prove a rendered feed; offline snapshots stay ineligible', async () => {
  const hook = await renderHook(
    ({ offline }: { offline: boolean }) =>
      useFeedExperience({
        surface: 'pods',
        key: 'all',
        active: true,
        error: false,
        empty: false,
        offline,
      }),
    { initialProps: { offline: false } },
  );
  expect(terminals()).toHaveLength(0);
  await act(() => hook.result.current.rendered('committed-unit'));
  expect(terminals()).toHaveLength(1);
  expect(terminals()[0]).toMatchObject({ phase: 'feed', outcome: 'success' });
  await hook.unmount();
  (emitEvent as MockedFunction<typeof emitEvent>).mockClear();
  const offline = await renderHook(() =>
    useFeedExperience({
      surface: 'pods',
      key: 'offline',
      active: true,
      error: false,
      empty: false,
      offline: true,
    }),
  );
  await act(() => offline.result.current.rendered('cached-unit'));
  expect(terminals().some((event) => event.outcome === 'success')).toBe(false);
  await offline.unmount();
});
it('pagination requires a newly committed unit and records starvation at the loaded boundary', () => {
  experienceBoundaryReached('news', true);
  const request = startExperiencePagination('news', ['old']);
  commitExperienceUnits('news', ['old']);
  expect(terminals()).toHaveLength(0);
  commitExperienceUnits('news', ['old', 'new']);
  expect(terminals()[0]).toMatchObject({
    phase: 'pagination',
    outcome: 'success',
    measurements: { boundary_starved: true },
  });
  request.end();
  expect(terminals()).toHaveLength(1);
  experienceBoundaryReached('news', false);
});
it('a stale pagination callback cannot discard the new request', () => {
  const old = startExperiencePagination('pods', ['old']);
  startExperiencePagination('pods', ['old']);
  old.failed();
  commitExperienceUnits('pods', ['old', 'new']);
  expect(
    terminals().filter((event) => event.outcome === 'success'),
  ).toHaveLength(1);
});

it('a failed explicit refresh cannot inherit a previously committed successful feed', async () => {
  const hook = await renderHook(() =>
    useFeedExperience({
      surface: 'pods',
      key: 'all',
      active: true,
      error: false,
      empty: false,
      unitIds: ['one'],
    }),
  );
  await act(() => hook.result.current.rendered('one'));
  let reject!: (error: Error) => void;
  const refresh = new Promise<void>((_, fail) => {
    reject = fail;
  });
  let completion: Promise<void>;
  await act(() => {
    completion = hook.result.current
      .requested(() => refresh)
      .catch(() => undefined);
  });
  await act(() => hook.result.current.rendered('one'));
  expect(terminals().map((event) => event.outcome)).toEqual(['success']);
  await act(async () => {
    reject(Error('network'));
    await completion!;
  });
  expect(terminals().map((event) => event.outcome)).toEqual([
    'success',
    'failed',
  ]);
  await hook.unmount();
});
it('a successful refresh waits for request completion and excludes a removed cached unit', async () => {
  const hook = await renderHook(
    ({ ids }: { ids: string[] }) =>
      useFeedExperience({
        surface: 'pods',
        key: 'all',
        active: true,
        error: false,
        empty: false,
        unitIds: ids,
      }),
    { initialProps: { ids: ['one'] } },
  );
  await act(() => hook.result.current.rendered('one'));
  let resolve!: () => void;
  const refresh = new Promise<void>((done) => {
    resolve = done;
  });
  let completion: Promise<void>;
  await act(() => {
    completion = hook.result.current.requested(() => refresh);
  });
  await hook.rerender({ ids: ['two'] });
  await act(async () => {
    resolve();
    await completion!;
  });
  expect(terminals().map((event) => event.outcome)).toEqual(['success']);
  await act(() => hook.result.current.rendered('two'));
  expect(terminals().map((event) => event.outcome)).toEqual([
    'success',
    'success',
  ]);
  await hook.unmount();
});
