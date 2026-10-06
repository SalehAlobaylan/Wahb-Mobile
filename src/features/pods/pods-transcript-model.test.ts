import { describe, expect, it } from '@jest/globals';

import {
  activeTranscriptCueIndex,
  formatTranscriptTime,
  normalizeTranscript,
  transcriptCues,
} from './pods-transcript-model';

describe('Pods transcript model', () => {
  it('avoids duplicating speech when both segment and word text are available without full text', () => {
    const presentation = normalizeTranscript(undefined, {
      segments: [{ text: 'Hello world.' }],
      words: [{ word: 'Hello' }, { punctuated_word: 'world.' }],
    });
    expect(presentation.mode).toBe('reader');
    expect(presentation.text).toBe('Hello world.');
  });
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

  it('reads nested segments without calling silence or ended text live', () => {
    const cues = transcriptCues(undefined, {
      results: {
        segments: [
          { text: 'First.', start_time: 1, end_time: 2 },
          { text: 'Last.', start_time: 3, end_time: 4 },
        ],
      },
    });

    expect(cues).toHaveLength(2);
    expect(activeTranscriptCueIndex(cues, 0)).toBe(-1);
    expect(activeTranscriptCueIndex(cues, 1)).toBe(0);
    expect(activeTranscriptCueIndex(cues, 2)).toBe(-1);
    expect(activeTranscriptCueIndex(cues, 3)).toBe(1);
    expect(activeTranscriptCueIndex(cues, 999)).toBe(-1);
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
  it('prefers legal phrase segments and preserves chapter-relative time', () => {
    const p = normalizeTranscript(
      'Child caption.',
      {
        segments: [{ text: 'Child caption.', start: 0, end: 3 }],
        words: [{ word: 'Duplicate', start: 0, end: 1 }],
      },
      270,
    );
    expect(p.cues).toHaveLength(1);
    expect(p.cues[0]).toMatchObject({
      text: 'Child caption.',
      startSeconds: 0,
    });
  });
  it.each([null, true, '', '1', NaN, Infinity, -1])(
    'does not invent a start from %s',
    (start) => {
      const p = normalizeTranscript(undefined, [
        { text: 'Keep me readable.', start, end: 2 },
      ]);
      expect(p.mode).toBe('reader');
      expect(p.text).toBe('Keep me readable.');
    },
  );
  it('clips overlaps and content bounds, removes duplicate starts and invalid intervals', () => {
    const p = normalizeTranscript(
      'Whole text',
      [
        { text: 'First', start: 0, end: 10 },
        { text: 'Duplicate', start: 0, end: 10 },
        { text: 'Second', start: 2, end: 30 },
        { text: 'Bad', start: 5, end: 4 },
        { text: 'Outside', start: 10, end: 11 },
      ],
      6,
    );
    expect(p.cues.map((c) => [c.startSeconds, c.endSeconds])).toEqual([
      [0, 2],
      [2, 6],
    ]);
    expect(activeTranscriptCueIndex(p.cues, 6)).toBe(-1);
  });
});
