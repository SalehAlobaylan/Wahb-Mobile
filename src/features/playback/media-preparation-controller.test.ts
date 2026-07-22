import { describe, expect, it } from '@jest/globals';

import { createMediaPreparationController } from './media-preparation-controller';

const wifiInput = {
  network: 'wifi' as const,
  lowPowerMode: false,
  memoryPressure: false,
  foreground: true,
  swipeCardsPerSecond: 1,
  activeIndex: 2,
  itemCount: 6,
};

describe('media preparation controller', () => {
  it('uses header-only probes for the bounded policy window', async () => {
    const probes: { url: string; signal: AbortSignal }[] = [];
    const controller = createMediaPreparationController({
      probeSource: async (url, signal) => {
        probes.push({ url, signal });
      },
    });
    const candidates = Array.from({ length: 6 }, (_, index) => ({
      id: `item-${index}`,
      sourceUrl: `https://media.example.test/${index}`,
    }));

    expect(controller.reconcile(wifiInput, candidates)).toEqual({
      prepareIndexes: [0, 1, 3, 4],
      cancelSpeculativeWork: false,
    });
    await Promise.resolve();

    expect(probes.map((probe) => probe.url)).toEqual([
      'https://media.example.test/0',
      'https://media.example.test/1',
      'https://media.example.test/3',
      'https://media.example.test/4',
    ]);
  });

  it('aborts active speculation before a constrained decision', async () => {
    let observedSignal: AbortSignal | undefined;
    const controller = createMediaPreparationController({
      probeSource: async (_, signal) => {
        observedSignal = signal;
      },
    });
    const candidates = [
      { id: 'item-0', sourceUrl: 'https://media.example.test/0' },
      { id: 'item-1', sourceUrl: 'https://media.example.test/1' },
    ];

    controller.reconcile(
      { ...wifiInput, activeIndex: 0, itemCount: 2 },
      candidates,
    );
    await Promise.resolve();
    expect(observedSignal?.aborted).toBe(false);

    expect(
      controller.reconcile(
        { ...wifiInput, activeIndex: 0, itemCount: 2, lowPowerMode: true },
        candidates,
      ),
    ).toEqual({ prepareIndexes: [], cancelSpeculativeWork: true });
    expect(observedSignal?.aborted).toBe(true);
  });
});
