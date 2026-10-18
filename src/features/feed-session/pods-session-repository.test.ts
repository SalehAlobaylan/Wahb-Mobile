import { expect, it, jest } from '@jest/globals';
import { enqueueInteractionWithIds } from '@/core/outbox/outbox-repository';
import {
  materializePodsSession,
  recordPodsExposure,
} from './pods-session-repository';

jest.mock('@/core/outbox/outbox-repository', () => ({
  enqueueInteractionWithIds: jest.fn(),
}));
jest.mock('@/core/database/tombstones', () => ({
  tombstonedContentIds: async () => new Set(),
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => '00000000-0000-4000-8000-000000000001',
}));

it('queues a viewport view with the persisted CMS session, rather than the local SQLite session ID', async () => {
  const transaction = {
    getFirstAsync: async () => ({
      content_id: 'item',
      server_session_id: '00000000-0000-4000-8000-000000000002',
    }),
    runAsync: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  const db = {
    withExclusiveTransactionAsync: async (
      operation: (tx: typeof transaction) => Promise<void>,
    ) => operation(transaction),
  };
  await recordPodsExposure(db as never, 'local-session', 0, 'anonymous:device');
  expect(enqueueInteractionWithIds).toHaveBeenLastCalledWith(
    transaction,
    'anonymous:device',
    {
      contentId: 'item',
      type: 'view',
      metadata: {
        surface: 'pods',
        feed_session_id: '00000000-0000-4000-8000-000000000002',
      },
    },
    expect.any(String),
    expect.any(String),
    expect.any(Date),
  );
});

it('does not fabricate a server correlation for legacy local snapshots', async () => {
  const transaction = {
    getFirstAsync: async () => ({
      content_id: 'item',
      server_session_id: null,
    }),
    runAsync: async () => undefined,
  };
  const db = {
    withExclusiveTransactionAsync: async (
      operation: (tx: typeof transaction) => Promise<void>,
    ) => operation(transaction),
  };
  await recordPodsExposure(db as never, 'local-session', 0, 'anonymous:device');
  expect(enqueueInteractionWithIds).toHaveBeenLastCalledWith(
    transaction,
    'anonymous:device',
    {
      contentId: 'item',
      type: 'view',
      metadata: { surface: 'pods' },
    },
    expect.any(String),
    expect.any(String),
    expect.any(Date),
  );
});

it('rolls back a replacement superseded during SQLite writes', async () => {
  let current = true;
  const durableWrites: string[] = [];
  const db = {
    getAllAsync: async () => [],
    withExclusiveTransactionAsync: async (
      operation: (tx: {
        runAsync: (sql: string) => Promise<void>;
      }) => Promise<void>,
    ) => {
      const staged: string[] = [];
      await operation({
        runAsync: async (sql) => {
          staged.push(sql);
          current = false;
        },
      });
      durableWrites.push(...staged);
    },
  };
  const result = await materializePodsSession(
    db as never,
    'anonymous:device',
    { items: [], cursor: null, quarantinedItemCount: 0, caught_up: false },
    'server-session',
    '2099-10-18T06:00:00Z',
    new Date(),
    () => current,
  );
  expect(result).toBeNull();
  expect(durableWrites).toEqual([]);
});
