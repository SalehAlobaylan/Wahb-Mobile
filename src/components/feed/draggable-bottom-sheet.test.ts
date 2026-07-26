import { describe, expect, it } from '@jest/globals';

import {
  nearestSheetSnap,
  sheetSnapPoints,
} from './draggable-bottom-sheet-model';

describe('native draggable bottom sheet', () => {
  it('uses the web-compatible three snap positions', () => {
    const points = sheetSnapPoints(852, 59, 34);
    expect(points.collapsed).toBe(98);
    expect(points.expanded).toBe(474);
    expect(points.midpoint).toBe(286);
  });

  it('settles each released height at its nearest snap', () => {
    const points = sheetSnapPoints(852, 59, 34);
    expect(nearestSheetSnap(100, points)).toBe('collapsed');
    expect(nearestSheetSnap(285, points)).toBe('midpoint');
    expect(nearestSheetSnap(470, points)).toBe('expanded');
  });

  it('uses a handle-only collapsed frame for News', () => {
    const points = sheetSnapPoints(852, 59, 34, 36);
    expect(points.collapsed).toBe(70);
    expect(points.expanded).toBe(474);
  });
});
