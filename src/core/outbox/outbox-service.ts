import type { CmsApi } from '@/core/api';
import { HttpError as CmsHttpError } from '@/core/api';

import {
  acknowledgeOutboxEvent,
  claimNextOutboxEvent,
  retryOrRejectOutboxEvent,
} from './outbox-repository';
import type { SQLiteDatabase } from 'expo-sqlite';

/** Delivers oldest-first and stops at the first deferred failure. */
export async function flushOutbox(
  db: SQLiteDatabase,
  cms: CmsApi,
  identityScope: string,
  sessionId: string,
): Promise<number> {
  let delivered = 0;
  for (;;) {
    const event = await claimNextOutboxEvent(db, identityScope);
    if (!event) {
      return delivered;
    }
    try {
      await cms.createInteraction({
        contentId: event.payload.contentId,
        type: event.type,
        sessionId,
        idempotencyKey: event.idempotencyKey,
        ...(event.payload.metadata ? { metadata: event.payload.metadata } : {}),
      });
      await acknowledgeOutboxEvent(db, event.id);
      delivered += 1;
    } catch (error) {
      const status =
        error instanceof CmsHttpError ? error.context.status : undefined;
      await retryOrRejectOutboxEvent(db, event, status);
      return delivered;
    }
  }
}
