import { describe, expect, it } from '@jest/globals';

import {
  resolveLocalFirstPlaybackSources,
  remotePlaybackSourceResolver,
  retryDelayMs,
} from './source-resolver';

const checksum = 'a'.repeat(64);
const source = {
  url: 'https://media.example.test/primary.m3u8',
  type: 'hls' as const,
  fallbackUrl: 'https://media.example.test/fallback.mp4',
  fallbackType: 'mp4' as const,
  fallbackHasVideo: true,
  hasVideo: true,
};

describe('remote playback source resolver', () => {
  it('uses only a CMS-typed fallback without guessing a player transfer', () => {
    expect(remotePlaybackSourceResolver.resolve(source)).toEqual([
      {
        url: 'https://media.example.test/primary.m3u8',
        type: 'hls',
        hasVideo: true,
        stage: 'primary',
        origin: 'cms-remote',
      },
      {
        url: 'https://media.example.test/fallback.mp4',
        type: 'mp4',
        hasVideo: true,
        stage: 'fallback',
        origin: 'cms-remote',
      },
    ]);
  });

  it.each([
    ['missing', null],
    ['wrong owner', { scope: 'user:b' }],
    ['expired', { expiresAt: '2020-01-01T00:00:00.000Z' }],
    ['remote file URL', { fileUrl: 'https://signed.example/file' }],
  ])('falls back to CMS when the local artifact is %s', (_reason, override) => {
    const candidates = resolveLocalFirstPlaybackSources(
      source,
      'user:a',
      override === null
        ? null
        : {
            artifactId: 'media-1',
            revision: '1',
            relativePath: 'media/media-1.mp4',
            mimeType: 'video/mp4',
            bytes: 1,
            sha256: checksum,
            rightsRevision: '1',
            expiresAt: '2030-01-01T00:00:00.000Z',
            scope: 'user:a',
            verification: 'complete' as const,
            fileUrl: 'file:///cache/media-1.mp4',
            playbackType: 'mp4' as const,
            hasVideo: true,
            ...override,
          },
      new Date('2029-01-01T00:00:00.000Z'),
    );
    expect(candidates[0]).toMatchObject({
      origin: 'cms-remote',
      stage: 'primary',
    });
  });

  it('uses a verified local artifact before the CMS candidates', () => {
    const candidates = resolveLocalFirstPlaybackSources(
      source,
      'user:a',
      {
        artifactId: 'media-1',
        revision: '1',
        relativePath: 'media/media-1.mp4',
        mimeType: 'video/mp4',
        bytes: 1,
        sha256: checksum,
        rightsRevision: '1',
        expiresAt: '2030-01-01T00:00:00.000Z',
        scope: 'user:a',
        verification: 'complete',
        fileUrl: 'file:///cache/media-1.mp4',
        playbackType: 'mp4',
        hasVideo: true,
      },
      new Date('2029-01-01T00:00:00.000Z'),
    );
    expect(candidates[0]).toMatchObject({
      url: 'file:///cache/media-1.mp4',
      origin: 'local-artifact',
      stage: 'local',
    });
  });

  it('uses a bounded exponential delay', () => {
    expect(retryDelayMs(0)).toBe(250);
    expect(retryDelayMs(5)).toBe(2_000);
  });
});
