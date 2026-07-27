import { describe, expect, it } from '@jest/globals';

import {
  activeTranscriptCueIndex,
  formatTranscriptTime,
  normalizeTranscript,
  transcriptCues,
} from './for-you-transcript-model';

describe('For You transcript model', () => {
  it('groups provider-native words into timed readable cues', () => {
    const cues = transcriptCues(undefined, [
      { word: 'One', start: 0, end: 0.2 },
      { word: 'two', start: 0.2, end: 0.4 },
      { word: 'three', start: 0.4, end: 0.6 },
    ]);

    expect(cues).toMatchObject([
      { text: 'One two three', startSeconds: 0, endSeconds: 0.6 },
    ]);
    expect(activeTranscriptCueIndex(cues, 0.3)).toBe(0);
  });

  it('keeps the entire untimed transcript in reader mode', () => {
    const presentation = normalizeTranscript(
      'First sentence. ثاني جملة؟ Third sentence. Fourth sentence.',
      undefined,
    );

    expect(presentation.mode).toBe('reader');
    expect(presentation.text).toContain('Fourth sentence.');
    expect(presentation.cues).toEqual([]);
    expect(formatTranscriptTime(presentation.cues[0]?.startSeconds)).toBeNull();
  });

  it('reads nested provider segments and clamps after the final cue', () => {
    const cues = transcriptCues(undefined, {
      results: {
        segments: [
          { text: 'First.', start_time: 1, end_time: 2 },
          { text: 'Last.', start_time: 3, end_time: 4 },
        ],
      },
    });

    expect(cues).toHaveLength(2);
    expect(activeTranscriptCueIndex(cues, 0)).toBe(0);
    expect(activeTranscriptCueIndex(cues, 2)).toBe(1);
    expect(activeTranscriptCueIndex(cues, 999)).toBe(1);
  });

  it('recognizes CMS caption segments that use millisecond bounds', () => {
    const presentation = normalizeTranscript(undefined, {
      segments: [{ text: 'Caption.', start_ms: 2_000, end_ms: 3_500 }],
      words: [],
    });

    expect(presentation.mode).toBe('timed');
    expect(presentation.cues[0]).toMatchObject({
      startSeconds: 2,
      endSeconds: 3.5,
      text: 'Caption.',
    });
  });

  it('splits word cues on punctuation, pauses, duration, or twelve words', () => {
    const presentation = normalizeTranscript(undefined, {
      words: [
        { word: 'Hello.', start: 0, end: 0.2 },
        { word: 'After', start: 1.1, end: 1.3 },
        { word: 'pause', start: 1.3, end: 1.5 },
      ],
    });

    expect(presentation.cues.map((cue) => cue.text)).toEqual([
      'Hello.',
      'After pause',
    ]);
  });
});
