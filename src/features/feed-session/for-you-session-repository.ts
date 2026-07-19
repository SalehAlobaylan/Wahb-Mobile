import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { ForYouFeedResponse, ForYouItem } from '@/core/api';

import { createSessionExpiry, isSessionFresh } from './feed-session-policy';

type SessionRow = {
  id: string;
  cursor: string | null;
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
    `SELECT id, cursor, active_position, created_at, expires_at
       FROM feed_sessions
      WHERE feed_type = 'foryou'
        AND identity_scope = ?
        AND status = 'active'
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

export async function materializeForYouSession(
  db: SQLiteDatabase,
  identityScope: string,
  page: ForYouFeedResponse,
  now = new Date(),
): Promise<FrozenForYouSession> {
  const sessionId = Crypto.randomUUID();
  const createdAt = nowIso(now);
  const expiresAt = nowIso(createSessionExpiry(now));

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
        (id, feed_type, identity_scope, cursor, status, created_at, expires_at, active_position, updated_at)
       VALUES (?, 'foryou', ?, ?, 'active', ?, ?, 0, ?)`,
      sessionId,
      identityScope,
      page.cursor,
      createdAt,
      expiresAt,
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
    cursor: page.cursor,
    activePosition: 0,
    createdAt,
    expiresAt,
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
        WHERE id = ? AND status = 'active'`,
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
