import type { SQLiteDatabase } from 'expo-sqlite';

import type { ArticleContent } from '@/core/api';

type ArticleSnapshotRow = {
  snapshot_json: string;
  cached_at: string;
};

type ReaderPositionRow = {
  offset_y: number;
};

export type CachedArticle = {
  article: ArticleContent;
  cachedAt: string;
};

export async function loadArticleSnapshot(
  db: SQLiteDatabase,
  contentId: string,
): Promise<CachedArticle | null> {
  const row = await db.getFirstAsync<ArticleSnapshotRow>(
    `SELECT snapshot_json, cached_at
       FROM article_snapshots
      WHERE content_id = ?`,
    contentId,
  );
  if (!row) {
    return null;
  }

  try {
    return {
      article: JSON.parse(row.snapshot_json) as ArticleContent,
      cachedAt: row.cached_at,
    };
  } catch {
    // Corrupt local content must not masquerade as an offline article.
    await db.runAsync(
      'DELETE FROM article_snapshots WHERE content_id = ?',
      contentId,
    );
    return null;
  }
}

export async function saveArticleSnapshot(
  db: SQLiteDatabase,
  article: ArticleContent,
  now = new Date(),
): Promise<void> {
  await db.runAsync(
    `INSERT INTO article_snapshots (content_id, snapshot_json, cached_at)
     VALUES (?, ?, ?)
     ON CONFLICT(content_id) DO UPDATE SET
       snapshot_json = excluded.snapshot_json,
       cached_at = excluded.cached_at`,
    article.id,
    JSON.stringify(article),
    now.toISOString(),
  );
}

export async function loadReaderPosition(
  db: SQLiteDatabase,
  contentId: string,
): Promise<number> {
  const row = await db.getFirstAsync<ReaderPositionRow>(
    `SELECT offset_y FROM reader_positions WHERE content_id = ?`,
    contentId,
  );
  return Math.max(0, row?.offset_y ?? 0);
}

export async function saveReaderPosition(
  db: SQLiteDatabase,
  contentId: string,
  offsetY: number,
  now = new Date(),
): Promise<void> {
  await db.runAsync(
    `INSERT INTO reader_positions (content_id, offset_y, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(content_id) DO UPDATE SET
       offset_y = excluded.offset_y,
       updated_at = excluded.updated_at`,
    contentId,
    Math.max(0, offsetY),
    now.toISOString(),
  );
}

/**
 * News is deliberately live, while History is a durable record of a reader's
 * intentional choice. Upsert retains the story once but refreshes recency.
 */
export async function recordOpenedNewsStory(
  db: SQLiteDatabase,
  identityScope: string,
  storyId: string,
  leadContentId: string,
  now = new Date(),
): Promise<void> {
  await db.runAsync(
    `INSERT INTO opened_news_stories
       (identity_scope, story_id, lead_content_id, opened_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(identity_scope, story_id) DO UPDATE SET
       lead_content_id = excluded.lead_content_id,
       opened_at = excluded.opened_at`,
    identityScope,
    storyId,
    leadContentId,
    now.toISOString(),
  );
}
