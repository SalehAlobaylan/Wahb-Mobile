import { describe, expect, it } from '@jest/globals';

import {
  newsPageIndex,
  newsPageLayout,
  newsPageOffset,
  nextNewsSheetConcealed,
  reconcileNewsPageIndex,
} from './news-pager-model';

describe('News pager model', () => {
  it('lays out every outer slide at the exact measured page height', () => {
    expect(newsPageLayout(742, 3)).toEqual({
      index: 3,
      length: 742,
      offset: 2226,
    });
  });

  it('rounds fractional resting offsets to the nearest valid slide', () => {
    expect(newsPageIndex(380, 742, 5)).toBe(1);
    expect(newsPageOffset(1, 742)).toBe(742);
    expect(newsPageIndex(9999, 742, 5)).toBe(4);
  });

  it('preserves the active slide when pagination appends more slides', () => {
    expect(
      reconcileNewsPageIndex('second', ['first', 'second', 'third'], 0),
    ).toBe(1);
  });

  it('falls back safely when refresh replaces the active slide', () => {
    expect(reconcileNewsPageIndex('removed', ['fresh', 'first'], 8)).toBe(1);
    expect(reconcileNewsPageIndex(null, ['fresh', 'first'], 0)).toBe(0);
  });

  it('conceals the collapsed sheet while moving forward and restores it on return', () => {
    expect(nextNewsSheetConcealed(false, 760, 0)).toBe(true);
    expect(nextNewsSheetConcealed(true, 0, 760)).toBe(false);
    expect(nextNewsSheetConcealed(true, 750, 750)).toBe(true);
  });
});
