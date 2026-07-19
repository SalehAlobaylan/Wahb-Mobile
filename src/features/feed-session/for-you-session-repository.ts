import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { ForYouFeedResponse, ForYouItem } from '@/core/api';

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
    const position = await transaction.getFirstAsync<{ next_position: number }>(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
         FROM feed_session_items
        WHERE session_id = ?`,
      sessionId,
    );
    let nextPosition = position?.next_position ?? 0;
    for (const item of page.items) {
      if (existingIds.has(item.id)) {
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

    for (const [position, item] of page.items.entries()) {
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
    items: page.items.map((item) => ({ item, playbackPositionMs: 0 })),
  };
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
