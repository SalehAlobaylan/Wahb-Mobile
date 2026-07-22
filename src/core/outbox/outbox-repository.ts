import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { InteractionType, ModerationReason } from '@/core/api';

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

const outboxLeaseMs = 5 * 60 * 1_000;

type OutboxWriteExecutor = Pick<SQLiteDatabase, 'getFirstAsync' | 'runAsync'>;

export type QueuedInteraction = {
  contentId: string;
  type: InteractionType;
  operation?: 'create' | 'delete';
  metadata?: Record<string, unknown>;
};

export type QueuedModerationReport = {
  type: 'report';
  targetType: 'content' | 'comment';
  targetId: string;
  reason: ModerationReason;
  detail?: string;
};

export type QueuedOutboxEvent = QueuedInteraction | QueuedModerationReport;

export type ClaimedOutboxEvent = {
  id: string;
  identityScope: string;
  type: OutboxEventType;
  payload: QueuedOutboxEvent;
  idempotencyKey: string;
  sequence: number;
  attemptCount: number;
};

export type OutboxHealth = {
  pending: number;
  failed: number;
  authBlocked: number;
};

export async function readOutboxHealth(
  db: SQLiteDatabase,
  identityScope: string,
): Promise<OutboxHealth> {
  const row = await db.getFirstAsync<OutboxHealth>(
    `SELECT
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN status = 'auth_blocked' THEN 1 ELSE 0 END) AS authBlocked
     FROM event_outbox
     WHERE identity_scope = ?`,
    identityScope,
  );
  return {
    pending: row?.pending ?? 0,
    failed: row?.failed ?? 0,
    authBlocked: row?.authBlocked ?? 0,
  };
}

function asClaimedEvent(row: EventOutboxRow): ClaimedOutboxEvent | null {
  if (!isOutboxEventType(row.event_type)) {
    return null;
  }

  try {
    const payload = JSON.parse(row.payload_json) as QueuedOutboxEvent;
    if (payload.type === 'report') {
      if (!payload.targetId || !payload.targetType || !payload.reason) {
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
    }
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
  interaction: QueuedOutboxEvent,
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
  interaction: QueuedOutboxEvent,
  id: string,
  idempotencyKey: string,
  now = new Date(),
): Promise<void> {
  const createdAt = now.toISOString();
  if (interaction.type === 'progress') {
    // Keep only the latest pending checkpoint after the most recent semantic
    // event. This bounds playback writes without moving progress across a
    // like/comment/report boundary in the ordered outbox.
    await db.runAsync(
      `DELETE FROM event_outbox
        WHERE identity_scope = ?
          AND event_type = 'progress'
          AND status = 'pending'
          AND json_extract(payload_json, '$.contentId') = ?
          AND sequence > COALESCE(
            (SELECT MAX(sequence)
               FROM event_outbox
              WHERE identity_scope = ? AND event_type <> 'progress'),
            0
          )`,
      identityScope,
      interaction.contentId,
      identityScope,
    );
  }
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
    await transaction.runAsync(
      `UPDATE event_outbox
          SET status = 'pending', claimed_at = NULL, updated_at = ?
        WHERE identity_scope = ?
          AND status = 'in_flight'
          AND claimed_at IS NOT NULL
          AND claimed_at <= ?`,
      timestamp,
      identityScope,
      new Date(now.getTime() - outboxLeaseMs).toISOString(),
    );
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
          SET status = 'in_flight', attempt_count = attempt_count + 1,
              claimed_at = ?, updated_at = ?
        WHERE id = ?`,
      timestamp,
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

/** Account-scoped work remains durable until that account has credentials again. */
export async function blockOutboxEventForAuth(
  db: SQLiteDatabase,
  eventId: string,
  now = new Date(),
): Promise<void> {
  await db.runAsync(
    `UPDATE event_outbox
        SET status = 'auth_blocked', claimed_at = NULL, next_attempt_at = NULL, updated_at = ?
      WHERE id = ?`,
    now.toISOString(),
    eventId,
  );
}

/** Re-enable only the restored account's parked work. */
export async function resumeAuthBlockedOutbox(
  db: SQLiteDatabase,
  identityScope: string,
  now = new Date(),
): Promise<void> {
  await db.runAsync(
    `UPDATE event_outbox
        SET status = 'pending', updated_at = ?
      WHERE identity_scope = ? AND status = 'auth_blocked'`,
    now.toISOString(),
    identityScope,
  );
}

export async function retryOrRejectOutboxEvent(
  db: SQLiteDatabase,
  event: ClaimedOutboxEvent,
  status: number | undefined,
  now = new Date(),
): Promise<ReturnType<typeof decideRetry>> {
  const decision = decideRetry(event.attemptCount, now, status);
  if (decision.kind === 'retry') {
    await db.runAsync(
      `UPDATE event_outbox
          SET status = 'failed', claimed_at = NULL, next_attempt_at = ?, updated_at = ?
        WHERE id = ?`,
      decision.nextAttemptAt.toISOString(),
      now.toISOString(),
      event.id,
    );
    return decision;
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
  return decision;
}
