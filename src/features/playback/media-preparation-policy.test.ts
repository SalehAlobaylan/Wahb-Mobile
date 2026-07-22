import { describe, expect, it } from '@jest/globals';

import { decideMediaPreparation } from './media-preparation-policy';

describe('media preparation policy', () => {
  it('prepares a bounded ±2 window on Wi-Fi', () => {
    expect(
      decideMediaPreparation({
        network: 'wifi',
        lowPowerMode: false,
        memoryPressure: false,
        foreground: true,
        swipeCardsPerSecond: 1,
        activeIndex: 3,
        itemCount: 8,
      }),
    ).toEqual({ prepareIndexes: [1, 2, 4, 5], cancelSpeculativeWork: false });
  });

  it('prepares only the next item on cellular', () => {
    expect(
      decideMediaPreparation({
        network: 'cellular',
        lowPowerMode: false,
        memoryPressure: false,
        foreground: true,
        swipeCardsPerSecond: 1,
        activeIndex: 3,
        itemCount: 8,
      }),
    ).toEqual({ prepareIndexes: [4], cancelSpeculativeWork: false });
  });

  it.each([
    ['low power', { lowPowerMode: true }],
    ['memory pressure', { memoryPressure: true }],
    ['background', { foreground: false }],
    ['fast swipe', { swipeCardsPerSecond: 3.1 }],
    ['offline', { network: 'offline' as const }],
  ])('cancels speculative work for %s', (_, override) => {
    expect(
      decideMediaPreparation({
        network: 'wifi',
        lowPowerMode: false,
        memoryPressure: false,
        foreground: true,
        swipeCardsPerSecond: 1,
        activeIndex: 3,
        itemCount: 8,
        ...override,
      }),
    ).toEqual({ prepareIndexes: [], cancelSpeculativeWork: true });
  });
});
