export type NetworkCost = 'wifi' | 'cellular' | 'offline' | 'unknown';

export type MediaPreparationInput = {
  network: NetworkCost;
  lowPowerMode: boolean;
  memoryPressure: boolean;
  foreground: boolean;
  swipeCardsPerSecond: number;
  activeIndex: number;
  itemCount: number;
};

export type MediaPreparationPlan = {
  prepareIndexes: number[];
  cancelSpeculativeWork: boolean;
};

/**
 * This policy only permits metadata/artwork or inactive-source preparation.
 * It never starts playback, claims Now Playing metadata, or treats cache as a
 * completed download.
 */
export function decideMediaPreparation(
  input: MediaPreparationInput,
): MediaPreparationPlan {
  const constrained =
    input.network === 'offline' ||
    input.network === 'unknown' ||
    input.lowPowerMode ||
    input.memoryPressure ||
    !input.foreground ||
    input.swipeCardsPerSecond > 3;
  if (constrained) {
    return { prepareIndexes: [], cancelSpeculativeWork: true };
  }

  const candidates =
    input.network === 'wifi'
      ? [
          input.activeIndex - 2,
          input.activeIndex - 1,
          input.activeIndex + 1,
          input.activeIndex + 2,
        ]
      : [input.activeIndex + 1];
  return {
    prepareIndexes: candidates.filter(
      (index) => index >= 0 && index < input.itemCount,
    ),
    cancelSpeculativeWork: false,
  };
}
