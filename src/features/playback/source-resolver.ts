import type { PlaybackSource } from '@/core/api';
import {
  isVerifiedLocalPlaybackArtifact,
  type VerifiedLocalPlaybackArtifact,
} from '@/features/downloads/contracts';

export type ResolvedPlaybackSource = {
  url: string;
  type: PlaybackSource['type'];
  hasVideo: boolean;
  stage: 'local' | 'primary' | 'fallback';
  origin: 'local-artifact' | 'cms-remote';
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
        origin: 'cms-remote',
      },
    ];

    if (
      source.fallbackUrl &&
      source.fallbackUrl !== source.url &&
      source.fallbackType &&
      source.fallbackHasVideo !== undefined
    ) {
      sources.push({
        url: source.fallbackUrl,
        type: source.fallbackType,
        hasVideo: source.fallbackHasVideo,
        stage: 'fallback',
        origin: 'cms-remote',
      });
    }

    return sources;
  },
};

/**
 * Future catalog integration must call this instead of passing a file path to
 * a player directly. Missing, corrupt, expired, or another identity's file is
 * intentionally indistinguishable from a cache miss and falls back to CMS.
 */
export function resolveLocalFirstPlaybackSources(
  source: PlaybackSource,
  scope: string,
  localArtifact?: VerifiedLocalPlaybackArtifact | null,
  now = new Date(),
): ResolvedPlaybackSource[] {
  const remote = remotePlaybackSourceResolver.resolve(source);
  if (
    !localArtifact ||
    !isVerifiedLocalPlaybackArtifact(localArtifact, scope, now)
  ) {
    return remote;
  }
  return [
    {
      url: localArtifact.fileUrl,
      type: localArtifact.playbackType,
      hasVideo: localArtifact.hasVideo,
      stage: 'local',
      origin: 'local-artifact',
    },
    ...remote,
  ];
}

export function attemptsForSource(source: ResolvedPlaybackSource): number {
  return source.stage === 'primary' ? 2 : 1;
}

export function retryDelayMs(attempt: number): number {
  return Math.min(2_000, 250 * 2 ** attempt);
}
