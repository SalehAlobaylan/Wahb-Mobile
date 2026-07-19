import { describe, expect, it } from '@jest/globals';

import { decideRetry, isPermanentRejection } from './outbox-policy';

describe('outbox retry policy', () => {
  const now = new Date('2026-07-19T12:00:00.000Z');

  it('backs off transient failures and respects the 429 floor', () => {
    expect(decideRetry(1, now, 503)).toEqual({
      kind: 'retry',
      nextAttemptAt: new Date('2026-07-19T12:00:01.000Z'),
    });
    expect(decideRetry(1, now, 429)).toEqual({
      kind: 'retry',
      nextAttemptAt: new Date('2026-07-19T12:00:30.000Z'),
    });
  });

  it('quarantines permanent rejections instead of retrying forever', () => {
    expect(isPermanentRejection(422)).toBe(true);
    expect(decideRetry(1, now, 422)).toEqual({
      kind: 'reject',
      rejectionCode: 422,
    });
  });

  it('caps retries even when the transport keeps failing', () => {
    expect(decideRetry(8, now)).toEqual({ kind: 'reject' });
  });
});
