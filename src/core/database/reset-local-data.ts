import type { SQLiteDatabase } from 'expo-sqlite';

/** Explicit user-initiated reset; queued operational events are discarded by choice. */
export async function clearLocalWahbData(db: SQLiteDatabase): Promise<void> {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.execAsync(`
      DELETE FROM feed_session_items;
      DELETE FROM feed_sessions;
      DELETE FROM event_outbox;
      DELETE FROM event_outbox_rejections;
      DELETE FROM hidden_content_items;
      DELETE FROM article_snapshots;
      DELETE FROM reader_positions;
      DELETE FROM opened_news_stories;
      DELETE FROM tombstoned_content_items;
      DELETE FROM article_snapshots_v2;
      DELETE FROM reader_positions_v2;
      DELETE FROM app_metadata;
    `);
  });
}
