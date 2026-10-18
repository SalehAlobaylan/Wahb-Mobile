import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { PodsSessionResponse } from '@/core/api';
import {
  loadFreshPodsSession,
  materializePodsSession,
  appendPodsSessionPage,
  type FrozenPodsSession,
} from './pods-session-repository';
import { podsSessionScope, usePodsSession } from './use-pods-session';

const mockDb = {};
const mockCreate = jest.fn<() => Promise<PodsSessionResponse>>();
const mockGetPage = jest.fn<() => Promise<PodsSessionResponse>>();
const mockClients = {
  cms: {
    createPodsSession: mockCreate,
    getPodsSessionPage: mockGetPage,
    getPodsSessionFreshness: jest.fn(),
  },
};
jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => mockDb }));
jest.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({ clients: mockClients, subject: null }),
}));
jest.mock('@/core/identity/installation-id', () => ({
  getInstallationId: async () => 'device',
}));
jest.mock('@/features/settings/language-preferences', () => ({
  readLanguagePreferences: async () => ({ contentLanguage: 'both' }),
}));
jest.mock('./pods-session-repository', () => ({
  loadFreshPodsSession: jest.fn(),
  loadRecoverablePodsSession: jest.fn(),
  materializePodsSession: jest.fn(),
  appendPodsSessionPage: jest.fn(),
}));
jest.mock('@/core/experience/use-feed-experience', () => ({
  startExperiencePagination: () => ({ end: jest.fn(), failed: jest.fn() }),
}));
const frozen = (id: string): FrozenPodsSession => ({
  id,
  serverSessionId: id,
  cursor: 'next',
  activePosition: 3,
  createdAt: '2026-10-18T00:00:00Z',
  expiresAt: '2099-10-18T06:00:00Z',
  items: [],
});
const page = (id: string): PodsSessionResponse => ({
  serverSessionId: id,
  expiresAt: '2099-10-18T06:00:00Z',
  cursor: null,
  items: [],
  quarantinedItemCount: 0,
  caught_up: false,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const hook = await renderHook(() => usePodsSession(), { wrapper });
  await waitFor(() =>
    expect(hook.result.current.sessionQuery.isSuccess).toBe(true),
  );
  return {
    client,
    hook,
    close: async () => {
      await hook.unmount();
      client.clear();
    },
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(loadFreshPodsSession).mockResolvedValue(frozen('old'));
  jest
    .mocked(materializePodsSession)
    .mockImplementation(async (_db, _scope, _response, serverId) =>
      frozen(serverId!),
    );
});

describe('Pods duration session scope', () => {
  it('keeps each duration in an independent frozen-session scope', () => {
    expect(podsSessionScope('anonymous:device', 'both')).toBe(
      'anonymous:device:content-language:both:duration:all',
    );
    expect(podsSessionScope('anonymous:device', 'both', 15)).toBe(
      'anonymous:device:content-language:both:duration:15',
    );
  });
});

it('retains its frozen position and data after a failed refresh', async () => {
  const { hook, close } = await setup();
  const previous = hook.result.current.sessionQuery.data;
  mockCreate.mockRejectedValueOnce(new Error('offline'));
  await act(async () => {
    await expect(hook.result.current.refreshSession()).rejects.toThrow(
      'offline',
    );
  });
  expect(hook.result.current.sessionQuery.data).toBe(previous);
  expect(hook.result.current.sessionQuery.data?.activePosition).toBe(3);
  expect(materializePodsSession).not.toHaveBeenCalled();
  await close();
});

it('atomically replaces only after success and rejects an older response finishing last', async () => {
  const { hook, close } = await setup();
  const older = deferred<PodsSessionResponse>(),
    newer = deferred<PodsSessionResponse>();
  mockCreate
    .mockReturnValueOnce(older.promise)
    .mockReturnValueOnce(newer.promise);
  let first!: Promise<boolean>, second!: Promise<boolean>;
  await act(() => {
    first = hook.result.current.refreshSession();
    second = hook.result.current.refreshSession();
  });
  expect(hook.result.current.sessionQuery.data?.id).toBe('old');
  await act(async () => {
    newer.resolve(page('new'));
    expect(await second).toBe(true);
  });
  await waitFor(() =>
    expect(hook.result.current.sessionQuery.data?.id).toBe('new'),
  );
  await act(async () => {
    older.resolve(page('stale'));
    expect(await first).toBe(false);
  });
  await waitFor(() =>
    expect(hook.result.current.sessionQuery.data?.id).toBe('new'),
  );
  expect(materializePodsSession).toHaveBeenCalledTimes(1);
  await close();
});

it('a late old-session page cannot overwrite a refreshed session', async () => {
  const { hook, close } = await setup();
  const oldPage = deferred<PodsSessionResponse>();
  mockGetPage.mockReturnValueOnce(oldPage.promise);
  jest.mocked(appendPodsSessionPage).mockResolvedValue(frozen('old'));
  let pending!: Promise<boolean>;
  await act(() => {
    pending = hook.result.current.fetchNextPage();
  });
  mockCreate.mockResolvedValueOnce(page('new'));
  await act(async () => {
    await hook.result.current.refreshSession();
  });
  await act(async () => {
    oldPage.resolve(page('old'));
    expect(await pending).toBe(false);
  });
  await waitFor(() =>
    expect(hook.result.current.sessionQuery.data?.id).toBe('new'),
  );
  await close();
});
