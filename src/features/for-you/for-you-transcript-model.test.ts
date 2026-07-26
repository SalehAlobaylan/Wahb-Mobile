import { describe, expect, it } from '@jest/globals';

import {
  activeTranscriptCueIndex,
  formatTranscriptTime,
  transcriptCues,
} from './for-you-transcript-model';

describe('For You transcript model', () => {
  it('groups provider-native words into timed readable cues', () => {
    const cues = transcriptCues(undefined, [
      { word: 'One', start: 0, end: 0.2 },
      { word: 'two', start: 0.2, end: 0.4 },
      { word: 'three', start: 0.4, end: 0.6 },
    ]);

    expect(cues).toEqual([
      { text: 'One two three', startSeconds: 0, endSeconds: 0.6 },
    ]);
    expect(activeTranscriptCueIndex(cues, 0.3)).toBe(0);
  });

  it('falls back to untimed text without inventing a timecode', () => {
    const cues = transcriptCues('First sentence. ثاني جملة؟', undefined);

    expect(cues.map((cue) => cue.text)).toEqual([
      'First sentence.',
      'ثاني جملة؟',
    ]);
    expect(formatTranscriptTime(cues[0]?.startSeconds)).toBeNull();
  });
});
