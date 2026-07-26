import { describe, expect, it } from '@jest/globals';

import { fontForLocale, fontForText } from './typography';
import { darkTheme, fontFamilies, layoutMetrics, lightTheme } from './tokens';
import { resolveScheme } from './theme';
import { logicalInset } from './logical-layout';

describe('native Wahb visual foundation', () => {
  it('resolves the selected appearance before system appearance', () => {
    expect(resolveScheme('dark', 'light')).toBe('dark');
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', null)).toBe('light');
    expect(darkTheme.accent).not.toBe(lightTheme.accent);
  });

  it('uses Handicrafts for Arabic while retaining Latin editorial typography', () => {
    expect(fontForLocale('ar', 'body')).toBe(fontFamilies.arabic);
    expect(fontForLocale('ar', 'editorial')).toBe(fontFamilies.arabicBold);
    expect(fontForLocale('en', 'editorial')).toBe(fontFamilies.editorial);
    expect(fontForText('خبر عربي', 'editorial')).toBe(fontFamilies.arabicBold);
    expect(fontForText('English headline', 'editorial')).toBe(
      fontFamilies.editorial,
    );
  });

  it('uses logical edges so RTL and LTR share the same layout rules', () => {
    expect(logicalInset('start', 16)).toEqual({ start: 16 });
    expect(logicalInset('end', 16)).toEqual({ end: 16 });
  });

  it('keeps every editorial page on the shared four-point layout grid', () => {
    expect(layoutMetrics.pageGutter).toBe(16);
    expect(layoutMetrics.pageBottom).toBe(48);
    Object.values(layoutMetrics).forEach((value) => expect(value % 4).toBe(0));
  });
});
