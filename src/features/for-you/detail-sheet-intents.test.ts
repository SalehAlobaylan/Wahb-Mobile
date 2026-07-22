import { describe, expect, it } from '@jest/globals';

import { detailSheetIntentForPan } from './detail-sheet-intents';

describe('detail sheet intents', () => {
  it('preserves the v1 vertical gesture thresholds', () => {
    expect(detailSheetIntentForPan(121, false)).toBe('close');
    expect(detailSheetIntentForPan(-51, false)).toBe('expand');
    expect(detailSheetIntentForPan(51, true)).toBe('collapse');
    expect(detailSheetIntentForPan(10, false)).toBeNull();
  });
});
