import type { CmsApi } from '@/core/api';
import { HttpError as CmsHttpError } from '@/core/api';

import {
  acknowledgeOutboxEvent,
  blockOutboxEventForAuth,
  claimNextOutboxEvent,
  resumeAuthBlockedOutbox,
  retryOrRejectOutboxEvent,
} from './outbox-repository';
import { shouldBlockForAuthentication } from './outbox-policy';
import type { ClaimedOutboxEvent } from './outbox-repository';
import type { SQLiteDatabase } from 'expo-sqlite';

/** Delivers oldest-first and stops at the first deferred failure. */
export async function flushOutbox(
  db: SQLiteDatabase,
  cms: CmsApi,
  identityScope: string,
  sessionId: string,
  options?: {
    onContentTombstone?: (contentId: string) => Promise<void>;
    onPermanentRejection?: (
      event: ClaimedOutboxEvent,
      status: number | undefined,
    ) => Promise<void>;
  },
): Promise<number> {
  let delivered = 0;
  if (identityScope.startsWith('user:')) {
    await resumeAuthBlockedOutbox(db, identityScope);
  }
  for (;;) {
    const event = await claimNextOutboxEvent(db, identityScope);
    if (!event) {
      return delivered;
    }
    try {
      if (event.payload.type === 'report') {
        await cms.reportModeration({
          targetType: event.payload.targetType,
          targetId: event.payload.targetId,
          reason: event.payload.reason,
          ...(event.payload.detail ? { detail: event.payload.detail } : {}),
          installationId: sessionId,
          idempotencyKey: event.idempotencyKey,
        });
      } else if (event.payload.operation === 'delete') {
        if (event.type !== 'like' && event.type !== 'bookmark') {
          // The repository validates this before claiming, but keep the
          // delivery boundary defensive if an older local database is corrupt.
          await acknowledgeOutboxEvent(db, event.id);
          continue;
        }
        await cms.deleteInteraction({
          contentId: event.payload.contentId,
          type: event.type,
          sessionId,
        });
      } else {
        await cms.createInteraction({
          contentId: event.payload.contentId,
          type: event.payload.type,
          sessionId,
          idempotencyKey: event.idempotencyKey,
          ...(event.payload.metadata
            ? { metadata: event.payload.metadata }
            : {}),
        });
      }
      await acknowledgeOutboxEvent(db, event.id);
      delivered += 1;
    } catch (error) {
      const status =
        error instanceof CmsHttpError ? error.context.status : undefined;
      if (shouldBlockForAuthentication(status, identityScope)) {
        await blockOutboxEventForAuth(db, event.id);
        return delivered;
      }
      const decision = await retryOrRejectOutboxEvent(db, event, status);
      if (decision.kind === 'reject') {
        await options?.onPermanentRejection?.(event, status);
      }
      if (status === 404 && event.payload.type !== 'report') {
        await options?.onContentTombstone?.(event.payload.contentId);
      }
      return delivered;
    }
  }
}
