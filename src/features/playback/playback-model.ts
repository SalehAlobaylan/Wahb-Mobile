import type { PlaybackSource } from '@/core/api';

export type PlaybackItem = {
  id: string;
  title: string;
  sourceName?: string;
  artworkUrl?: string;
  playback: PlaybackSource;
};

export type PlaybackKind = 'video' | 'audio';

export type PlaybackPhase =
  'idle' | 'loading' | 'playing' | 'paused' | 'failed';

export type PlaybackSnapshot = {
  item: PlaybackItem | null;
  kind: PlaybackKind | null;
  phase: PlaybackPhase;
  rate: number;
  error: 'source_load_failed' | null;
};

export const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export function resolvePlaybackKind(source: PlaybackSource): PlaybackKind {
  return source.hasVideo ? 'video' : 'audio';
}

export function isSupportedPlaybackRate(rate: number): boolean {
  return playbackRates.includes(rate as (typeof playbackRates)[number]);
}

export function createInitialPlaybackSnapshot(): PlaybackSnapshot {
  return {
    item: null,
    kind: null,
    phase: 'idle',
    rate: 1,
    error: null,
  };
}
