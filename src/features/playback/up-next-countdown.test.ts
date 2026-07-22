import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { createUpNextCountdown } from './up-next-countdown';

describe('Up Next countdown', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts down once then completes once', () => {
    jest.useFakeTimers();
    const ticks: (number | null)[] = [];
    const completed = jest.fn();
    const countdown = createUpNextCountdown();

    countdown.schedule((seconds) => ticks.push(seconds), completed);
    jest.advanceTimersByTime(3_000);

    expect(ticks).toEqual([3, 2, 1, 0, null]);
    expect(completed).toHaveBeenCalledTimes(1);
    expect(countdown.isScheduled()).toBe(false);
  });

  it('cancels without completion when playback is paused or changed', () => {
    jest.useFakeTimers();
    const completed = jest.fn();
    const countdown = createUpNextCountdown();

    countdown.schedule(() => undefined, completed);
    countdown.cancel();
    jest.advanceTimersByTime(3_000);

    expect(completed).not.toHaveBeenCalled();
  });
});
