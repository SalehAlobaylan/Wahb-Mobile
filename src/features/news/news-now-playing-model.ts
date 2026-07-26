export type NewsIdleFace = 'clock' | 'breaking';
export type NewsTilePressIntent =
  'none' | 'toggle_playback' | 'open_player' | 'advance_idle' | 'open_breaking';

export function normalizedPlaybackProgress(
  currentTimeSeconds: number,
  durationSeconds: number,
) {
  if (
    !Number.isFinite(currentTimeSeconds) ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return 0;
  }
  return Math.max(0, Math.min(1, currentTimeSeconds / durationSeconds));
}

export function formatPlaybackTime(seconds: number) {
  const safeSeconds =
    Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function newsIdleFaces(hasBreaking: boolean): NewsIdleFace[] {
  return hasBreaking ? ['clock', 'breaking'] : ['clock'];
}

export function nextIdleFaceIndex(currentIndex: number, faceCount: number) {
  if (faceCount <= 1) return 0;
  return (Math.max(0, currentIndex) + 1) % faceCount;
}

export function firstBreakingSlide<
  T extends { featured?: { lifecycle?: string; title?: string } },
>(slides: readonly T[]): T | null {
  return (
    slides.find(
      (slide) =>
        slide.featured?.lifecycle?.toLowerCase() === 'breaking' &&
        Boolean(slide.featured.title?.trim()),
    ) ?? null
  );
}

export function newsTilePressIntent({
  hasPlayback,
  longPress,
  idleFace,
  hasMultipleIdleFaces,
}: {
  hasPlayback: boolean;
  longPress: boolean;
  idleFace: NewsIdleFace;
  hasMultipleIdleFaces: boolean;
}): NewsTilePressIntent {
  if (hasPlayback) return longPress ? 'open_player' : 'toggle_playback';
  if (longPress) return 'none';
  if (idleFace === 'breaking') return 'open_breaking';
  return hasMultipleIdleFaces ? 'advance_idle' : 'none';
}
