import { describe, expect, it, jest } from '@jest/globals';

import { recordContentTombstone, tombstonedContentIds } from './tombstones';

describe('content tombstones', () => {
  it('records a server tombstone and filters by content ID only', async () => {
    const runAsync = jest
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockResolvedValue(undefined);
    const getAllAsync = jest
      .fn<(...args: unknown[]) => Promise<{ content_id: string }[]>>()
      .mockResolvedValue([{ content_id: 'removed-content' }]);
    const db = {
      runAsync,
      getAllAsync,
    };

    await recordContentTombstone(db as never, 'removed-content', new Date(0));
    const ids = await tombstonedContentIds(db as never, [
      'removed-content',
      'still-visible',
    ]);

    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('tombstoned_content_items'),
      'removed-content',
      '1970-01-01T00:00:00.000Z',
    );
    expect(getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('content_id IN (?, ?)'),
      'removed-content',
      'still-visible',
    );
    expect(ids).toEqual(new Set(['removed-content']));
  });
});
