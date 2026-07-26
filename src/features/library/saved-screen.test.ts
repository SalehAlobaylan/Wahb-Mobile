import { describe, expect, it, jest } from '@jest/globals';

import { formatSavedDuration, formatSavedRelativeTime } from './saved-model';

describe('Saved display helpers', () => {
  it('formats media duration as a compact timecode', () => {
    expect(formatSavedDuration(185)).toBe('3:05');
    expect(formatSavedDuration(undefined)).toBeNull();
  });

  it('uses localized, saved-time-relative labels', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-26T12:00:00.000Z'));

    expect(formatSavedRelativeTime('2026-07-26T08:00:00.000Z', 'en')).toBe(
      'Today',
    );
    expect(formatSavedRelativeTime('2026-07-24T12:00:00.000Z', 'ar')).toBe(
      'منذ 2 يوم',
    );
    jest.useRealTimers();
  });
});
