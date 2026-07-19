import type { InteractionType } from '@/core/api';

export type OutboxEventType = InteractionType;

export type RetryDecision =
  | { kind: 'retry'; nextAttemptAt: Date }
  | { kind: 'reject'; rejectionCode?: number };

const transientStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
const maximumAttempts = 8;
const maximumDelayMs = 5 * 60 * 1_000;

export function isPermanentRejection(status: number | undefined): boolean {
  return (
    status !== undefined && !transientStatuses.has(status) && status >= 400
  );
}

export function decideRetry(
  attemptCount: number,
  now: Date,
  status?: number,
): RetryDecision {
  if (isPermanentRejection(status) || attemptCount >= maximumAttempts) {
    return {
      kind: 'reject',
      ...(status === undefined ? {} : { rejectionCode: status }),
    };
  }

  const baseDelayMs = Math.min(
    maximumDelayMs,
    1_000 * 2 ** Math.max(0, attemptCount - 1),
  );
  const retryAfterMs =
    status === 429 ? Math.max(baseDelayMs, 30_000) : baseDelayMs;
  return {
    kind: 'retry',
    nextAttemptAt: new Date(now.getTime() + retryAfterMs),
  };
}

export function isOutboxEventType(value: string): value is OutboxEventType {
  return ['like', 'bookmark', 'share', 'view', 'complete'].includes(value);
}
