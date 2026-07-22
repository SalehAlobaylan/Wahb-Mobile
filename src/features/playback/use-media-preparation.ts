import { useEffect, useRef } from 'react';

import type { PlaybackItem } from './playback-model';
import {
  createMediaPreparationController,
  headPreparationTransport,
  type MediaPreparationController,
} from './media-preparation-controller';
import { useAdaptiveMediaSignals } from './adaptive-media-signals';

type UseMediaPreparationInput = {
  items: PlaybackItem[];
  activeIndex: number;
  swipeCardsPerSecond: number;
};

/** Wires pure policy to cancellation-safe, header-only native preparation. */
export function useMediaPreparation({
  items,
  activeIndex,
  swipeCardsPerSecond,
}: UseMediaPreparationInput): void {
  const signals = useAdaptiveMediaSignals();
  const controller = useRef<MediaPreparationController | null>(null);

  useEffect(() => {
    controller.current ??= createMediaPreparationController(
      headPreparationTransport,
    );
    controller.current.reconcile(
      {
        ...signals,
        swipeCardsPerSecond,
        activeIndex,
        itemCount: items.length,
      },
      items.map((item) => ({ id: item.id, sourceUrl: item.playback.url })),
    );
  }, [activeIndex, items, signals, swipeCardsPerSecond]);

  useEffect(
    () => () => {
      controller.current?.cancel();
    },
    [],
  );
}
