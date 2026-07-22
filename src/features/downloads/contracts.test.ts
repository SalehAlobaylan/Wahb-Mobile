import { describe, expect, it } from '@jest/globals';

import {
  evictTemporaryCache,
  isVerifiedLocalArtifact,
  isVerifiedLocalPlaybackArtifact,
} from './contracts';

const hash = 'a'.repeat(64);

describe('future download contracts', () => {
  it('accepts only complete, scoped, non-expired immutable artifacts', () => {
    expect(
      isVerifiedLocalArtifact(
        {
          artifactId: 'artifact-1',
          revision: '1',
          relativePath: 'media/a.mp4',
          mimeType: 'video/mp4',
          bytes: 1,
          sha256: hash,
          rightsRevision: '1',
          expiresAt: '2030-01-01T00:00:00.000Z',
          scope: 'user:a',
          verification: 'complete',
        },
        'user:a',
      ),
    ).toBe(true);
    expect(
      isVerifiedLocalArtifact(
        {
          artifactId: 'https://signed.example/file',
          revision: '1',
          relativePath: 'media/a.mp4',
          mimeType: 'video/mp4',
          bytes: 1,
          sha256: hash,
          rightsRevision: '1',
          expiresAt: '2030-01-01T00:00:00.000Z',
          scope: 'user:a',
          verification: 'complete',
        },
        'user:a',
      ),
    ).toBe(false);
  });

  it('requires the explicit complete verification state and a local file URL for playback', () => {
    const artifact = {
      artifactId: 'artifact-1',
      revision: '1',
      relativePath: 'media/a.mp4',
      mimeType: 'video/mp4',
      bytes: 1,
      sha256: hash,
      rightsRevision: '1',
      expiresAt: '2030-01-01T00:00:00.000Z',
      scope: 'user:a',
      verification: 'complete' as const,
      fileUrl: 'file:///cache/a.mp4',
      playbackType: 'mp4' as const,
      hasVideo: true,
    };
    expect(isVerifiedLocalPlaybackArtifact(artifact, 'user:a')).toBe(true);
    expect(
      isVerifiedLocalPlaybackArtifact(
        { ...artifact, fileUrl: 'https://signed.example/a' },
        'user:a',
      ),
    ).toBe(false);
  });

  it('evicts old and least-recent entries under a bounded temporary cache', () => {
    const entries = evictTemporaryCache(
      [
        {
          key: 'old',
          bytes: 1,
          createdAt: '2020-01-01T00:00:00.000Z',
          lastAccessedAt: '2020-01-01T00:00:00.000Z',
        },
        {
          key: 'new',
          bytes: 8,
          createdAt: '2030-01-01T00:00:00.000Z',
          lastAccessedAt: '2030-01-01T00:01:00.000Z',
        },
      ],
      new Date('2030-01-02T00:00:00.000Z'),
      { maxBytes: 10, maxEntries: 1, maxAgeMs: 7 * 86_400_000 },
    );
    expect(entries.map((entry) => entry.key)).toEqual(['new']);
  });
});
