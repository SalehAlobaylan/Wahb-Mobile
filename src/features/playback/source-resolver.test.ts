import { describe, expect, it } from '@jest/globals';

import { remotePlaybackSourceResolver, retryDelayMs } from './source-resolver';

describe('remote playback source resolver', () => {
  it('preserves the CMS fallback order without guessing a player transfer', () => {
    expect(
      remotePlaybackSourceResolver.resolve({
        url: 'https://media.example.test/primary.m3u8',
        type: 'hls',
        fallbackUrl: 'https://media.example.test/fallback.mp4',
        hasVideo: true,
      }),
    ).toEqual([
      {
        url: 'https://media.example.test/primary.m3u8',
        type: 'hls',
        hasVideo: true,
        stage: 'primary',
      },
      {
        url: 'https://media.example.test/fallback.mp4',
        type: 'hls',
        hasVideo: true,
        stage: 'fallback',
      },
    ]);
  });

  it('uses a bounded exponential delay', () => {
    expect(retryDelayMs(0)).toBe(250);
    expect(retryDelayMs(5)).toBe(2_000);
  });
});
