import type { PlaybackSource } from '@/core/api';

export type ResolvedPlaybackSource = {
  url: string;
  type: PlaybackSource['type'];
  hasVideo: boolean;
  stage: 'primary' | 'fallback';
};

/**
 * The resolver is intentionally a seam: v1 resolves only CMS-approved remote
 * sources. A future offline resolver may return a verified complete artifact,
 * never an evictable player cache or a stale signed URL.
 */
export type PlaybackSourceResolver = {
  resolve(source: PlaybackSource): ResolvedPlaybackSource[];
};

export const remotePlaybackSourceResolver: PlaybackSourceResolver = {
  resolve(source) {
    const sources: ResolvedPlaybackSource[] = [
      {
        url: source.url,
        type: source.type,
        hasVideo: source.hasVideo,
        stage: 'primary',
      },
    ];

    if (source.fallbackUrl && source.fallbackUrl !== source.url) {
      // CMS's current contract does not expose fallback_playback_type. We only
      // use a fallback in the same native-player class until the server sends
      // a typed audio rendition; guessing an audio transfer would risk two
      // players and incorrect Now Playing ownership.
      sources.push({
        url: source.fallbackUrl,
        type: source.type,
        hasVideo: source.hasVideo,
        stage: 'fallback',
      });
    }

    return sources;
  },
};

export function attemptsForSource(source: ResolvedPlaybackSource): number {
  return source.stage === 'primary' ? 2 : 1;
}

export function retryDelayMs(attempt: number): number {
  return Math.min(2_000, 250 * 2 ** attempt);
}
