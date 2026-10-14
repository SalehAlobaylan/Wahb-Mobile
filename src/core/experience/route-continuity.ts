import { beginHandoff } from './journeys';
import { isForeground, subscribeIntentionalSeek } from './lifecycle';

type Frame = {
  path: string;
  contentId?: string;
  position: number;
  rate: number;
  phase: 'idle' | 'loading' | 'playing' | 'paused' | 'failed';
  buffering: boolean;
};
// Route continuity observes the existing player. Replacing/pausing/seeking that
// player is intentional cancellation, never evidence about the previous item.
export function createRouteContinuityExperience(initialPath: string) {
  let previousPath = initialPath;
  let journey: ReturnType<typeof beginHandoff> | undefined;
  let contentId: string | undefined;
  let position = 0,
    rate = 1;
  const cancel = () => {
    journey?.cancel();
    journey = undefined;
  };
  const unsubscribe = subscribeIntentionalSeek(cancel);
  return {
    observe(frame: Frame) {
      const previous = previousPath;
      previousPath = frame.path;
      if (
        journey &&
        (!isForeground() ||
          frame.contentId !== contentId ||
          frame.phase === 'paused' ||
          frame.phase === 'idle' ||
          frame.path === '/' ||
          frame.rate !== rate)
      )
        cancel();
      if (
        previous === '/' &&
        frame.path !== '/' &&
        frame.phase === 'playing' &&
        frame.contentId &&
        isForeground()
      ) {
        cancel();
        contentId = frame.contentId;
        position = frame.position;
        rate = frame.rate;
        journey = beginHandoff('pods', contentId, position, rate);
      }
      if (frame.phase === 'failed') {
        journey?.failed();
        journey = undefined;
      } else if (
        frame.phase === 'playing' &&
        !frame.buffering &&
        frame.position - position >= 0.05
      ) {
        journey?.completed(frame.position);
        journey = undefined;
      }
    },
    dispose() {
      unsubscribe();
      cancel();
    },
  };
}
