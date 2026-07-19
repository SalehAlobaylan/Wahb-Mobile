import type { SQLiteDatabase } from 'expo-sqlite';

type Migration = {
  version: number;
  statements: string;
};

export const migrations: readonly Migration[] = [
  {
    version: 1,
    statements: `
      CREATE TABLE IF NOT EXISTS app_metadata (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS feed_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        feed_type TEXT NOT NULL CHECK (feed_type IN ('foryou', 'news')),
        identity_scope TEXT NOT NULL,
        cursor TEXT,
        status TEXT NOT NULL CHECK (status IN ('active', 'exhausted', 'expired')),
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS feed_session_items (
        session_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        content_id TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        playback_position_ms INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (session_id, position),
        UNIQUE (session_id, content_id),
        FOREIGN KEY (session_id) REFERENCES feed_sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS event_outbox (
        id TEXT PRIMARY KEY NOT NULL,
        identity_scope TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        idempotency_key TEXT UNIQUE NOT NULL,
        sequence INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'in_flight', 'failed')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_feed_sessions_scope
        ON feed_sessions(identity_scope, feed_type, status);
      CREATE INDEX IF NOT EXISTS idx_event_outbox_delivery
        ON event_outbox(status, next_attempt_at, sequence);
    `,
  },
  {
    version: 2,
    statements: `
      ALTER TABLE feed_sessions
        ADD COLUMN active_position INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE feed_sessions
        ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    version: 3,
    statements: `
      CREATE TABLE IF NOT EXISTS event_outbox_rejections (
        id TEXT PRIMARY KEY NOT NULL,
        event_type TEXT NOT NULL,
        rejection_code INTEGER,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_event_outbox_rejections_created
        ON event_outbox_rejections(created_at DESC);
    `,
  },
  {
    version: 4,
    statements: `
      ALTER TABLE feed_sessions
        ADD COLUMN server_session_id TEXT;
    `,
  },
  {
    version: 5,
    statements: `
      ALTER TABLE feed_session_items
        ADD COLUMN view_reported INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE feed_session_items
        ADD COLUMN completion_reported INTEGER NOT NULL DEFAULT 0;
    `,
  },
] as const;

type UserVersionRow = {
  user_version: number;
};

export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<UserVersionRow>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  for (const migration of migrations) {
    if (migration.version <= currentVersion) {
      continue;
    }

    await db.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.execAsync(migration.statements);
      await transaction.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
}
