import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { InteractionType } from '@/core/api';

import {
  decideRetry,
  isOutboxEventType,
  type OutboxEventType,
} from './outbox-policy';

type EventOutboxRow = {
  id: string;
  identity_scope: string;
  event_type: string;
  payload_json: string;
  idempotency_key: string;
  sequence: number;
  attempt_count: number;
};

type OutboxWriteExecutor = Pick<SQLiteDatabase, 'getFirstAsync' | 'runAsync'>;

export type QueuedInteraction = {
  contentId: string;
  type: InteractionType;
  operation?: 'create' | 'delete';
  metadata?: Record<string, unknown>;
};

export type ClaimedOutboxEvent = {
  id: string;
  identityScope: string;
  type: OutboxEventType;
  payload: QueuedInteraction;
  idempotencyKey: string;
  sequence: number;
  attemptCount: number;
};

function asClaimedEvent(row: EventOutboxRow): ClaimedOutboxEvent | null {
  if (!isOutboxEventType(row.event_type)) {
    return null;
  }

  try {
    const payload = JSON.parse(row.payload_json) as QueuedInteraction;
    if (
      !payload.contentId ||
      payload.type !== row.event_type ||
      (payload.operation === 'delete' &&
        payload.type !== 'like' &&
        payload.type !== 'bookmark')
    ) {
      return null;
    }
    return {
      id: row.id,
      identityScope: row.identity_scope,
      type: row.event_type,
      payload,
      idempotencyKey: row.idempotency_key,
      sequence: row.sequence,
      attemptCount: row.attempt_count,
    };
  } catch {
    return null;
  }
}

export async function enqueueInteraction(
  db: SQLiteDatabase,
  identityScope: string,
  interaction: QueuedInteraction,
  now = new Date(),
): Promise<string> {
  const id = Crypto.randomUUID();
  const idempotencyKey = Crypto.randomUUID();
  await enqueueInteractionWithIds(
    db,
    identityScope,
    interaction,
    id,
    idempotencyKey,
    now,
  );
  return id;
}

/** Allows a feature-local SQLite transaction to atomically create an outbox event. */
export async function enqueueInteractionWithIds(
  db: OutboxWriteExecutor,
  identityScope: string,
  interaction: QueuedInteraction,
  id: string,
  idempotencyKey: string,
  now = new Date(),
): Promise<void> {
  const createdAt = now.toISOString();
  const sequence = await db.getFirstAsync<{ next_sequence: number }>(
    `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
       FROM event_outbox
      WHERE identity_scope = ?`,
    identityScope,
  );
  await db.runAsync(
    `INSERT INTO event_outbox
      (id, identity_scope, event_type, payload_json, idempotency_key, sequence, status, attempt_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
    id,
    identityScope,
    interaction.type,
    JSON.stringify(interaction),
    idempotencyKey,
    sequence?.next_sequence ?? 1,
    createdAt,
    createdAt,
  );
}

export async function claimNextOutboxEvent(
  db: SQLiteDatabase,
  identityScope: string,
  now = new Date(),
): Promise<ClaimedOutboxEvent | null> {
  const timestamp = now.toISOString();
  let claimedEvent: ClaimedOutboxEvent | null = null;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const row = await transaction.getFirstAsync<EventOutboxRow>(
      `SELECT id, identity_scope, event_type, payload_json, idempotency_key, sequence, attempt_count
         FROM event_outbox
        WHERE identity_scope = ?
          AND status IN ('pending', 'failed')
          AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
        ORDER BY sequence ASC
        LIMIT 1`,
      identityScope,
      timestamp,
    );
    if (!row) {
      return;
    }
    const claimed = asClaimedEvent(row);
    if (!claimed) {
      await transaction.runAsync(
        `DELETE FROM event_outbox WHERE id = ?`,
        row.id,
      );
      await transaction.runAsync(
        `INSERT INTO event_outbox_rejections (id, event_type, created_at)
         VALUES (?, ?, ?)`,
        row.id,
        row.event_type,
        timestamp,
      );
      return;
    }
    await transaction.runAsync(
      `UPDATE event_outbox
          SET status = 'in_flight', attempt_count = attempt_count + 1, updated_at = ?
        WHERE id = ?`,
      timestamp,
      row.id,
    );
    claimedEvent = { ...claimed, attemptCount: claimed.attemptCount + 1 };
  });
  return claimedEvent;
}

export async function acknowledgeOutboxEvent(
  db: SQLiteDatabase,
  eventId: string,
): Promise<void> {
  await db.runAsync(`DELETE FROM event_outbox WHERE id = ?`, eventId);
}

export async function retryOrRejectOutboxEvent(
  db: SQLiteDatabase,
  event: ClaimedOutboxEvent,
  status: number | undefined,
  now = new Date(),
): Promise<void> {
  const decision = decideRetry(event.attemptCount, now, status);
  if (decision.kind === 'retry') {
    await db.runAsync(
      `UPDATE event_outbox
          SET status = 'failed', next_attempt_at = ?, updated_at = ?
        WHERE id = ?`,
      decision.nextAttemptAt.toISOString(),
      now.toISOString(),
      event.id,
    );
    return;
  }

  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `DELETE FROM event_outbox WHERE id = ?`,
      event.id,
    );
    await transaction.runAsync(
      `INSERT INTO event_outbox_rejections (id, event_type, rejection_code, created_at)
       VALUES (?, ?, ?, ?)`,
      event.id,
      event.type,
      decision.rejectionCode ?? null,
      now.toISOString(),
    );
  });
}
