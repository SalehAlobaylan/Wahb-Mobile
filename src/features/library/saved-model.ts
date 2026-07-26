export function formatSavedDuration(seconds?: number) {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const remaining = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${minutes}:${remaining}`;
}

export function formatSavedRelativeTime(
  value: string | undefined,
  language: string,
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const days = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 86_400_000),
  );
  const arabic = language.startsWith('ar');
  if (days === 0) return arabic ? 'اليوم' : 'Today';
  if (days === 1) return arabic ? 'أمس' : 'Yesterday';
  if (days < 7) return arabic ? `منذ ${days} يوم` : `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return arabic ? `منذ ${weeks} أسبوع` : `${weeks}w ago`;
}
