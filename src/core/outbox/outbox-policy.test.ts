import { describe, expect, it } from '@jest/globals';

import {
  decideRetry,
  isOutboxEventType,
  isPermanentRejection,
  shouldBlockForAuthentication,
} from './outbox-policy';

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

  it('allows durable progress checkpoints through the same ordered outbox', () => {
    expect(isOutboxEventType('progress')).toBe(true);
  });

  it('keeps authenticated comment delivery in the durable event vocabulary', () => {
    expect(isOutboxEventType('comment')).toBe(true);
  });

  it('queues moderation reports for replay-safe delivery', () => {
    expect(isOutboxEventType('report')).toBe(true);
  });

  it('parks only account-scoped 401 work for restored credentials', () => {
    expect(shouldBlockForAuthentication(401, 'user:account-1')).toBe(true);
    expect(shouldBlockForAuthentication(401, 'anonymous:install-1')).toBe(
      false,
    );
    expect(shouldBlockForAuthentication(403, 'user:account-1')).toBe(false);
  });
});
