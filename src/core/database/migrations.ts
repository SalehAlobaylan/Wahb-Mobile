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
  {
    version: 6,
    statements: `
      CREATE TABLE IF NOT EXISTS hidden_content_items (
        identity_scope TEXT NOT NULL,
        content_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (identity_scope, content_id)
      );

      CREATE INDEX IF NOT EXISTS idx_hidden_content_items_scope
      ON hidden_content_items(identity_scope, created_at DESC);
    `,
  },
  {
    // Article snapshots are readable content, not media artifacts. Keeping
    // these separately makes offline reading honest without pre-committing to
    // the future download catalogue or file-store architecture.
    version: 7,
    statements: `
      CREATE TABLE IF NOT EXISTS article_snapshots (
        content_id TEXT PRIMARY KEY NOT NULL,
        snapshot_json TEXT NOT NULL,
        cached_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reader_positions (
        content_id TEXT PRIMARY KEY NOT NULL,
        offset_y REAL NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS opened_news_stories (
        identity_scope TEXT NOT NULL,
        story_id TEXT NOT NULL,
        lead_content_id TEXT NOT NULL,
        opened_at TEXT NOT NULL,
        PRIMARY KEY (identity_scope, story_id)
      );

      CREATE INDEX IF NOT EXISTS idx_opened_news_stories_scope
        ON opened_news_stories(identity_scope, opened_at DESC);
    `,
  },
  {
    // A checkpoint is durable before it reaches CMS. One row-level watermark
    // prevents the player time observer from filling the outbox every tick.
    version: 8,
    statements: `
      ALTER TABLE feed_session_items
        ADD COLUMN last_progress_reported_seconds INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    // A server 404 is an authoritative tombstone, not a retryable offline
    // failure. Keep it outside a feed snapshot so reconnect cannot revive it.
    version: 9,
    statements: `
      CREATE TABLE IF NOT EXISTS tombstoned_content_items (
        content_id TEXT PRIMARY KEY NOT NULL,
        tombstoned_at TEXT NOT NULL
      );
    `,
  },
  {
    // A stronger playback classification upgrades the earlier one without
    // replaying the same classification after a foreground/background cycle.
    version: 10,
    statements: `
      ALTER TABLE feed_session_items
        ADD COLUMN consumption_classification TEXT;
    `,
  },
  {
    // Legacy article rows were keyed only by content and may contain a prior
    // account's bookmark flag. Leave them unreadable and use scoped v2 tables.
    version: 11,
    statements: `
      CREATE TABLE IF NOT EXISTS article_snapshots_v2 (
        identity_scope TEXT NOT NULL,
        content_id TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        cached_at TEXT NOT NULL,
        PRIMARY KEY (identity_scope, content_id)
      );
      CREATE TABLE IF NOT EXISTS reader_positions_v2 (
        identity_scope TEXT NOT NULL,
        content_id TEXT NOT NULL,
        offset_y REAL NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (identity_scope, content_id)
      );
    `,
  },
  {
    // An app can terminate after claiming an outbox row. The lease lets the
    // active identity recover it without replaying another account's events.
    version: 12,
    statements: `
      ALTER TABLE event_outbox ADD COLUMN claimed_at TEXT;
      CREATE INDEX IF NOT EXISTS idx_event_outbox_claim_recovery
        ON event_outbox (identity_scope, status, claimed_at);
    `,
  },
  {
    // SQLite cannot alter a CHECK constraint in place. Rebuild the outbox so
    // account-scoped work can pause for renewed credentials instead of being
    // rejected after an otherwise recoverable 401.
    version: 13,
    statements: `
      CREATE TABLE event_outbox_v2 (
        id TEXT PRIMARY KEY NOT NULL,
        identity_scope TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        idempotency_key TEXT UNIQUE NOT NULL,
        sequence INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'in_flight', 'failed', 'auth_blocked')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT,
        claimed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO event_outbox_v2
        (id, identity_scope, event_type, payload_json, idempotency_key, sequence,
         status, attempt_count, next_attempt_at, claimed_at, created_at, updated_at)
      SELECT id, identity_scope, event_type, payload_json, idempotency_key, sequence,
             status, attempt_count, next_attempt_at, claimed_at, created_at, updated_at
        FROM event_outbox;
      DROP TABLE event_outbox;
      ALTER TABLE event_outbox_v2 RENAME TO event_outbox;
      CREATE INDEX IF NOT EXISTS idx_event_outbox_delivery
        ON event_outbox(status, next_attempt_at, sequence);
      CREATE INDEX IF NOT EXISTS idx_event_outbox_claim_recovery
        ON event_outbox(identity_scope, status, claimed_at);
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
