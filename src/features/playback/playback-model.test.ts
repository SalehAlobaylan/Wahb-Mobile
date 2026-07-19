import { describe, expect, it } from '@jest/globals';

import {
  createInitialPlaybackSnapshot,
  isSupportedPlaybackRate,
  resolvePlaybackKind,
} from './playback-model';

describe('playback model', () => {
  it('keeps video inside the video owner and uses audio only for true audio', () => {
    expect(
      resolvePlaybackKind({
        url: 'https://media.example.test/a.m3u8',
        type: 'hls',
        hasVideo: true,
      }),
    ).toBe('video');
    expect(
      resolvePlaybackKind({
        url: 'https://media.example.test/a.m4a',
        type: 'audio',
        hasVideo: false,
      }),
    ).toBe('audio');
  });

  it('starts paused at the accepted default speed and rejects unsupported rates', () => {
    expect(createInitialPlaybackSnapshot()).toMatchObject({
      phase: 'idle',
      rate: 1,
    });
    expect(isSupportedPlaybackRate(1.75)).toBe(true);
    expect(isSupportedPlaybackRate(1.1)).toBe(false);
  });
});
