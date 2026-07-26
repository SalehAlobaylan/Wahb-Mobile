import { describe, expect, it } from '@jest/globals';

import {
  firstBreakingSlide,
  formatPlaybackTime,
  newsIdleFaces,
  newsTilePressIntent,
  nextIdleFaceIndex,
  normalizedPlaybackProgress,
} from './news-now-playing-model';

describe('News now playing model', () => {
  it('normalizes playback progress without leaking invalid values', () => {
    expect(normalizedPlaybackProgress(30, 120)).toBe(0.25);
    expect(normalizedPlaybackProgress(-3, 120)).toBe(0);
    expect(normalizedPlaybackProgress(200, 120)).toBe(1);
    expect(normalizedPlaybackProgress(3, 0)).toBe(0);
  });

  it('formats stable minute timecodes', () => {
    expect(formatPlaybackTime(0)).toBe('0:00');
    expect(formatPlaybackTime(65.9)).toBe('1:05');
    expect(formatPlaybackTime(Number.NaN)).toBe('0:00');
  });

  it('rotates idle faces only when breaking coverage exists', () => {
    expect(newsIdleFaces(false)).toEqual(['clock']);
    expect(newsIdleFaces(true)).toEqual(['clock', 'breaking']);
    expect(nextIdleFaceIndex(0, 2)).toBe(1);
    expect(nextIdleFaceIndex(1, 2)).toBe(0);
    expect(nextIdleFaceIndex(4, 1)).toBe(0);
  });

  it('selects only a titled breaking story', () => {
    const regular = { featured: { lifecycle: 'developing', title: 'A' } };
    const untitled = { featured: { lifecycle: 'breaking', title: ' ' } };
    const breaking = { featured: { lifecycle: 'BREAKING', title: 'B' } };
    expect(firstBreakingSlide([regular, untitled, breaking])).toBe(breaking);
  });

  it('keeps short and long presses mutually exclusive', () => {
    expect(
      newsTilePressIntent({
        hasPlayback: true,
        longPress: false,
        idleFace: 'clock',
        hasMultipleIdleFaces: false,
      }),
    ).toBe('toggle_playback');
    expect(
      newsTilePressIntent({
        hasPlayback: true,
        longPress: true,
        idleFace: 'clock',
        hasMultipleIdleFaces: false,
      }),
    ).toBe('open_player');
    expect(
      newsTilePressIntent({
        hasPlayback: false,
        longPress: false,
        idleFace: 'breaking',
        hasMultipleIdleFaces: true,
      }),
    ).toBe('open_breaking');
  });
});
