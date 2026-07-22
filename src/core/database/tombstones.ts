import type { SQLiteDatabase } from 'expo-sqlite';

export async function recordContentTombstone(
  db: SQLiteDatabase,
  contentId: string,
  now = new Date(),
): Promise<void> {
  await db.runAsync(
    `INSERT OR IGNORE INTO tombstoned_content_items (content_id, tombstoned_at)
     VALUES (?, ?)`,
    contentId,
    now.toISOString(),
  );
}

export async function tombstonedContentIds(
  db: SQLiteDatabase,
  contentIds: readonly string[],
): Promise<Set<string>> {
  if (contentIds.length === 0) return new Set();
  const placeholders = contentIds.map(() => '?').join(', ');
  const rows = await db.getAllAsync<{ content_id: string }>(
    `SELECT content_id FROM tombstoned_content_items
      WHERE content_id IN (${placeholders})`,
    ...contentIds,
  );
  return new Set(rows.map((row) => row.content_id));
}
