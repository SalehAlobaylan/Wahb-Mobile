import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { ForYouFeedResponse, ForYouItem } from '@/core/api';
import { enqueueInteractionWithIds } from '@/core/outbox/outbox-repository';

import { createSessionExpiry, isSessionFresh } from './feed-session-policy';

type SessionRow = {
  id: string;
  server_session_id: string | null;
  cursor: string | null;
  status: 'active' | 'exhausted';
  active_position: number;
  created_at: string;
  expires_at: string;
};

type SessionItemRow = {
  position: number;
  snapshot_json: string;
  playback_position_ms: number;
};

export type FrozenForYouSession = {
  id: string;
  serverSessionId: string | null;
  cursor: string | null;
  activePosition: number;
  createdAt: string;
  expiresAt: string;
  items: {
    item: ForYouItem;
    playbackPositionMs: number;
  }[];
};

function nowIso(now: Date): string {
  return now.toISOString();
}

export async function loadFreshForYouSession(
  db: SQLiteDatabase,
  identityScope: string,
  now = new Date(),
): Promise<FrozenForYouSession | null> {
  const session = await db.getFirstAsync<SessionRow>(
    `SELECT id, server_session_id, cursor, status, active_position, created_at, expires_at
       FROM feed_sessions
      WHERE feed_type = 'foryou'
        AND identity_scope = ?
        AND status IN ('active', 'exhausted')
      ORDER BY created_at DESC
      LIMIT 1`,
    identityScope,
  );

  if (!session) {
    return null;
  }

  if (!isSessionFresh(new Date(session.expires_at), now)) {
    await db.runAsync(
      `UPDATE feed_sessions SET status = 'expired' WHERE id = ?`,
      session.id,
    );
    return null;
  }

  const rows = await db.getAllAsync<SessionItemRow>(
    `SELECT position, snapshot_json, playback_position_ms
       FROM feed_session_items
      WHERE session_id = ?
      ORDER BY position ASC`,
    session.id,
  );

  try {
    const items = rows.map((row) => ({
      item: JSON.parse(row.snapshot_json) as ForYouItem,
      playbackPositionMs: row.playback_position_ms,
    }));
    if (items.length === 0) {
      return null;
    }

    return {
      id: session.id,
      serverSessionId: session.server_session_id,
      cursor: session.cursor,
      activePosition: Math.min(session.active_position, items.length - 1),
      createdAt: session.created_at,
      expiresAt: session.expires_at,
      items,
    };
  } catch {
    await db.runAsync(
      `UPDATE feed_sessions SET status = 'expired' WHERE id = ?`,
      session.id,
    );
    return null;
  }
}

/**
 * Pages are appended to the existing immutable session. Never replace the
 * loaded order during pagination, even when the live CMS ranking shifts.
 */
export async function appendForYouSessionPage(
  db: SQLiteDatabase,
  sessionId: string,
  identityScope: string,
  page: ForYouFeedResponse,
  now = new Date(),
): Promise<FrozenForYouSession | null> {
  const updatedAt = nowIso(now);
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const session = await transaction.getFirstAsync<{
      cursor: string | null;
      status: 'active' | 'exhausted';
    }>(`SELECT cursor, status FROM feed_sessions WHERE id = ?`, sessionId);
    if (!session || session.status !== 'active') {
      return;
    }

    const rows = await transaction.getAllAsync<{ content_id: string }>(
      `SELECT content_id FROM feed_session_items WHERE session_id = ?`,
      sessionId,
    );
    const existingIds = new Set(rows.map((row) => row.content_id));
    const hiddenRows = await transaction.getAllAsync<{ content_id: string }>(
      `SELECT content_id
         FROM hidden_content_items
        WHERE identity_scope = ?`,
      identityScope,
    );
    const hiddenIds = new Set(hiddenRows.map((row) => row.content_id));
    const position = await transaction.getFirstAsync<{ next_position: number }>(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
         FROM feed_session_items
        WHERE session_id = ?`,
      sessionId,
    );
    let nextPosition = position?.next_position ?? 0;
    for (const item of page.items) {
      if (existingIds.has(item.id) || hiddenIds.has(item.id)) {
        continue;
      }
      await transaction.runAsync(
        `INSERT INTO feed_session_items
          (session_id, position, content_id, snapshot_json, playback_position_ms)
         VALUES (?, ?, ?, ?, 0)`,
        sessionId,
        nextPosition,
        item.id,
        JSON.stringify(item),
      );
      existingIds.add(item.id);
      nextPosition += 1;
    }

    await transaction.runAsync(
      `UPDATE feed_sessions
          SET cursor = ?, status = ?, updated_at = ?
        WHERE id = ?`,
      page.cursor,
      page.cursor === null ? 'exhausted' : 'active',
      updatedAt,
      sessionId,
    );
  });

  const row = await db.getFirstAsync<SessionRow>(
    `SELECT id, server_session_id, cursor, status, active_position, created_at, expires_at
       FROM feed_sessions
      WHERE id = ?`,
    sessionId,
  );
  if (!row || !isSessionFresh(new Date(row.expires_at), now)) {
    return null;
  }
  const items = await db.getAllAsync<SessionItemRow>(
    `SELECT position, snapshot_json, playback_position_ms
       FROM feed_session_items
      WHERE session_id = ?
      ORDER BY position ASC`,
    sessionId,
  );
  try {
    return {
      id: row.id,
      serverSessionId: row.server_session_id,
      cursor: row.cursor,
      activePosition: Math.min(row.active_position, items.length - 1),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      items: items.map((item) => ({
        item: JSON.parse(item.snapshot_json) as ForYouItem,
        playbackPositionMs: item.playback_position_ms,
      })),
    } satisfies FrozenForYouSession;
  } catch {
    return null;
  }
}

export async function materializeForYouSession(
  db: SQLiteDatabase,
  identityScope: string,
  page: ForYouFeedResponse,
  serverSessionId: string | null,
  expiresAt: string,
  now = new Date(),
): Promise<FrozenForYouSession> {
  const sessionId = Crypto.randomUUID();
  const createdAt = nowIso(now);
  const localExpiresAt = nowIso(createSessionExpiry(now));
  const expiry = new Date(expiresAt);
  const effectiveExpiresAt = Number.isNaN(expiry.getTime())
    ? localExpiresAt
    : nowIso(
        expiry.getTime() < new Date(localExpiresAt).getTime()
          ? expiry
          : new Date(localExpiresAt),
      );
  const hiddenRows = await db.getAllAsync<{ content_id: string }>(
    `SELECT content_id
       FROM hidden_content_items
      WHERE identity_scope = ?`,
    identityScope,
  );
  const hiddenIds = new Set(hiddenRows.map((row) => row.content_id));
  const visibleItems = page.items.filter((item) => !hiddenIds.has(item.id));

  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `UPDATE feed_sessions
          SET status = 'expired', updated_at = ?
        WHERE feed_type = 'foryou'
          AND identity_scope = ?
          AND status = 'active'`,
      createdAt,
      identityScope,
    );
    await transaction.runAsync(
      `INSERT INTO feed_sessions
        (id, feed_type, identity_scope, server_session_id, cursor, status, created_at, expires_at, active_position, updated_at)
       VALUES (?, 'foryou', ?, ?, ?, 'active', ?, ?, 0, ?)`,
      sessionId,
      identityScope,
      serverSessionId,
      page.cursor,
      createdAt,
      effectiveExpiresAt,
      createdAt,
    );

    for (const [position, item] of visibleItems.entries()) {
      await transaction.runAsync(
        `INSERT INTO feed_session_items
          (session_id, position, content_id, snapshot_json, playback_position_ms)
         VALUES (?, ?, ?, ?, 0)`,
        sessionId,
        position,
        item.id,
        JSON.stringify(item),
      );
    }
  });

  return {
    id: sessionId,
    serverSessionId,
    cursor: page.cursor,
    activePosition: 0,
    createdAt,
    expiresAt: effectiveExpiresAt,
    items: visibleItems.map((item) => ({ item, playbackPositionMs: 0 })),
  };
}

/**
 * Hide is intentionally local until CMS publishes its installation/account hide
 * contract. The frozen session is compacted in the same transaction so the
 * removed item cannot return after a process restart.
 */
export async function hideForYouItem(
  db: SQLiteDatabase,
  sessionId: string,
  identityScope: string,
  contentId: string,
  now = new Date(),
): Promise<FrozenForYouSession | null> {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const target = await transaction.getFirstAsync<{ position: number }>(
      `SELECT position
         FROM feed_session_items
        WHERE session_id = ? AND content_id = ?`,
      sessionId,
      contentId,
    );
    if (!target) {
      return;
    }

    await transaction.runAsync(
      `INSERT OR IGNORE INTO hidden_content_items
        (identity_scope, content_id, created_at)
       VALUES (?, ?, ?)`,
      identityScope,
      contentId,
      nowIso(now),
    );
    await transaction.runAsync(
      `DELETE FROM feed_session_items
        WHERE session_id = ? AND content_id = ?`,
      sessionId,
      contentId,
    );
    await transaction.runAsync(
      `UPDATE feed_session_items
          SET position = position - 1
        WHERE session_id = ? AND position > ?`,
      sessionId,
      target.position,
    );

    const session = await transaction.getFirstAsync<{
      active_position: number;
    }>(`SELECT active_position FROM feed_sessions WHERE id = ?`, sessionId);
    const count = await transaction.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count
         FROM feed_session_items
        WHERE session_id = ?`,
      sessionId,
    );
    const remaining = count?.count ?? 0;
    const previousPosition = session?.active_position ?? 0;
    const nextPosition =
      remaining === 0
        ? 0
        : Math.min(
            previousPosition > target.position
              ? previousPosition - 1
              : previousPosition,
            remaining - 1,
          );
    await transaction.runAsync(
      `UPDATE feed_sessions
          SET active_position = ?, updated_at = ?
        WHERE id = ?`,
      nextPosition,
      nowIso(now),
      sessionId,
    );
  });

  return loadFreshForYouSession(db, identityScope, now);
}

export async function updateForYouSessionPosition(
  db: SQLiteDatabase,
  sessionId: string,
  position: number,
  playbackPositionMs: number,
  now = new Date(),
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `UPDATE feed_sessions
          SET active_position = ?, updated_at = ?
        WHERE id = ? AND status IN ('active', 'exhausted')`,
      position,
      nowIso(now),
      sessionId,
    );
    await transaction.runAsync(
      `UPDATE feed_session_items
          SET playback_position_ms = ?
        WHERE session_id = ? AND position = ?`,
      Math.max(0, Math.floor(playbackPositionMs)),
      sessionId,
      position,
    );
  });
}

async function recordSessionInteraction(
  db: SQLiteDatabase,
  sessionId: string,
  position: number,
  identityScope: string,
  kind: 'view' | 'complete',
  metadata: Record<string, number | string>,
  now = new Date(),
): Promise<boolean> {
  const reportedColumn =
    kind === 'view' ? 'view_reported' : 'completion_reported';
  let recorded = false;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const item = await transaction.getFirstAsync<{ content_id: string }>(
      `SELECT content_id
         FROM feed_session_items
        WHERE session_id = ? AND position = ? AND ${reportedColumn} = 0`,
      sessionId,
      position,
    );
    if (!item) {
      return;
    }
    await enqueueInteractionWithIds(
      transaction,
      identityScope,
      { contentId: item.content_id, type: kind, metadata },
      Crypto.randomUUID(),
      Crypto.randomUUID(),
      now,
    );
    await transaction.runAsync(
      `UPDATE feed_session_items
          SET ${reportedColumn} = 1
        WHERE session_id = ? AND position = ?`,
      sessionId,
      position,
    );
    recorded = true;
  });
  return recorded;
}

export function recordForYouExposure(
  db: SQLiteDatabase,
  sessionId: string,
  position: number,
  identityScope: string,
): Promise<boolean> {
  return recordSessionInteraction(
    db,
    sessionId,
    position,
    identityScope,
    'view',
    {
      surface: 'foryou',
    },
  );
}

export function recordForYouCompletion(
  db: SQLiteDatabase,
  sessionId: string,
  position: number,
  identityScope: string,
  actualPlayedSeconds: number,
  furthestPositionSeconds: number,
): Promise<boolean> {
  return recordSessionInteraction(
    db,
    sessionId,
    position,
    identityScope,
    'complete',
    {
      actual_played_seconds: Math.floor(actualPlayedSeconds),
      furthest_position_seconds: Math.floor(furthestPositionSeconds),
    },
  );
}
