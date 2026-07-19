import { describe, expect, it } from '@jest/globals';

import {
  createInitialPlaybackSnapshot,
  defaultPlaybackRates,
  isSupportedPlaybackRate,
  normalizePlaybackRateDefaults,
  playbackRateClassFor,
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
      didReachEnd: false,
    });
    expect(isSupportedPlaybackRate(1.75)).toBe(true);
    expect(isSupportedPlaybackRate(1.1)).toBe(false);
  });

  it('keeps separate valid defaults for video, podcast, and audio chapters', () => {
    expect(
      playbackRateClassFor({
        id: 'video',
        contentType: 'VIDEO',
        title: 'Video',
        playback: {
          url: 'https://media.example.test/video.m3u8',
          type: 'hls',
          hasVideo: true,
        },
      }),
    ).toBe('video');
    expect(
      playbackRateClassFor({
        id: 'podcast',
        contentType: 'PODCAST',
        title: 'Podcast',
        playback: {
          url: 'https://media.example.test/podcast.m4a',
          type: 'audio',
          hasVideo: false,
        },
      }),
    ).toBe('podcast');
    expect(normalizePlaybackRateDefaults({ video: 1.5, podcast: 1.1 })).toEqual(
      {
        video: 1.5,
        podcast: defaultPlaybackRates.podcast,
        audio_chapter: defaultPlaybackRates.audio_chapter,
      },
    );
  });
});
