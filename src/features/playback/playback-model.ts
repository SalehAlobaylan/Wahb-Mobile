import type { PlaybackSource } from '@/core/api';

export type PlaybackItem = {
  id: string;
  contentType: 'VIDEO' | 'PODCAST';
  title: string;
  sourceName?: string;
  artworkUrl?: string;
  playback: PlaybackSource;
};

export type PlaybackKind = 'video' | 'audio';
export type PlaybackRateClass = 'video' | 'podcast' | 'audio_chapter';

export type PlaybackRateDefaults = Record<PlaybackRateClass, number>;

export type PlaybackPhase =
  'idle' | 'loading' | 'playing' | 'paused' | 'failed';

export type PlaybackSnapshot = {
  item: PlaybackItem | null;
  kind: PlaybackKind | null;
  phase: PlaybackPhase;
  rate: number;
  currentTimeSeconds: number;
  durationSeconds: number;
  bufferedPositionSeconds: number;
  isBuffering: boolean;
  sourceStage: 'primary' | 'fallback' | null;
  error: 'source_load_failed' | null;
};

export const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export const defaultPlaybackRates: PlaybackRateDefaults = {
  video: 1,
  podcast: 1,
  audio_chapter: 1,
};

export function resolvePlaybackKind(source: PlaybackSource): PlaybackKind {
  return source.hasVideo ? 'video' : 'audio';
}

export function isSupportedPlaybackRate(rate: number): boolean {
  return playbackRates.includes(rate as (typeof playbackRates)[number]);
}

export function playbackRateClassFor(item: PlaybackItem): PlaybackRateClass {
  if (item.playback.hasVideo) {
    return 'video';
  }
  return item.contentType === 'PODCAST' ? 'podcast' : 'audio_chapter';
}

export function normalizePlaybackRateDefaults(
  value: unknown,
): PlaybackRateDefaults {
  if (!value || typeof value !== 'object') {
    return defaultPlaybackRates;
  }
  const candidate = value as Partial<PlaybackRateDefaults>;
  return {
    video: isSupportedPlaybackRate(candidate.video ?? NaN)
      ? candidate.video!
      : defaultPlaybackRates.video,
    podcast: isSupportedPlaybackRate(candidate.podcast ?? NaN)
      ? candidate.podcast!
      : defaultPlaybackRates.podcast,
    audio_chapter: isSupportedPlaybackRate(candidate.audio_chapter ?? NaN)
      ? candidate.audio_chapter!
      : defaultPlaybackRates.audio_chapter,
  };
}

export function createInitialPlaybackSnapshot(): PlaybackSnapshot {
  return {
    item: null,
    kind: null,
    phase: 'idle',
    rate: 1,
    currentTimeSeconds: 0,
    durationSeconds: 0,
    bufferedPositionSeconds: 0,
    isBuffering: false,
    sourceStage: null,
    error: null,
  };
}
