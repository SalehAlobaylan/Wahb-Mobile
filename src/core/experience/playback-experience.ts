import { beginPlayback, type PlaybackJourney } from './journeys';
import {
  isForeground,
  subscribeForeground,
  notifyIntentionalSeek,
} from './lifecycle';
import type { RuxPlaybackType } from './types';

// Observes the existing single native player. It never starts/replaces a player,
// changes media policy or creates a browser-style handoff on route/background.
export function createPlaybackExperience() {
  let journey: PlaybackJourney | undefined;
  let contentId: string | undefined;
  let type: RuxPlaybackType = 'unknown';
  let baseline = 0,
    playing = false,
    pending = false,
    lastClockAt = 0,
    resumeBaseline = false;
  let watchdog: ReturnType<typeof setInterval> | undefined;
  const updateWatchdog = () => {
    if (journey && playing && !pending && isForeground()) {
      watchdog ??= setInterval(() => {
        if (performance.now() - lastClockAt >= 1500) journey?.onWaiting();
      }, 500);
    } else {
      clearInterval(watchdog);
      watchdog = undefined;
    }
  };
  const unsubscribe = subscribeForeground(() => {
    if (!isForeground()) {
      journey?.onHidden();
      journey = undefined;
    } else if (playing && contentId) {
      lastClockAt = performance.now();
      pending = false;
      resumeBaseline = true;
      journey = beginPlayback({
        surface: 'pods',
        contentId,
        playbackType: type,
        resumeContinuation: true,
      });
    }
    updateWatchdog();
  });
  return {
    attempt(
      id: string,
      playbackType: RuxPlaybackType,
      position: number,
      continuation = false,
    ) {
      const continuing =
        continuation && contentId === id && journey !== undefined;
      contentId = id;
      type = playbackType;
      baseline = position;
      lastClockAt = performance.now();
      pending = true;
      resumeBaseline = false;
      if (!continuing) {
        journey?.cancel();
        journey = isForeground()
          ? beginPlayback({ surface: 'pods', contentId: id, playbackType })
          : undefined;
      }
      updateWatchdog();
    },
    fallback(playbackType: RuxPlaybackType) {
      type = playbackType;
      journey?.fallback(type);
    },
    position(position: number) {
      notifyIntentionalSeek();
      baseline = position;
      lastClockAt = performance.now();
    },
    observe(
      position: number,
      isPlaying: boolean,
      buffering: boolean,
      ended: boolean,
      failed: boolean,
    ) {
      playing = isPlaying;
      if (!isForeground()) {
        updateWatchdog();
        return;
      }
      if (failed) {
        journey?.onMediaError(null);
        journey = undefined;
        pending = false;
        updateWatchdog();
        return;
      }
      if (ended) {
        journey?.finish();
        journey = undefined;
        pending = false;
        updateWatchdog();
        return;
      }
      if (resumeBaseline) {
        baseline = position;
        lastClockAt = performance.now();
        resumeBaseline = false;
        updateWatchdog();
        return;
      }
      const now = performance.now(),
        advance = position - baseline;
      if (
        isPlaying &&
        advance >= 0.05 &&
        advance <= Math.max(2, ((now - lastClockAt) / 1000) * 3)
      ) {
        journey?.onProgress();
        baseline = position;
        lastClockAt = now;
        pending = false;
      } else if (
        advance < 0 ||
        advance > Math.max(2, ((now - lastClockAt) / 1000) * 3)
      ) {
        baseline = position;
        lastClockAt = now;
      }
      if (buffering) journey?.onWaiting();
      if (!isPlaying && !buffering && !pending) {
        journey?.cancel();
        journey = undefined;
      }
      updateWatchdog();
    },
    pause() {
      journey?.cancel();
      journey = undefined;
      pending = false;
      playing = false;
      updateWatchdog();
    },
    dispose() {
      clearInterval(watchdog);
      unsubscribe();
      journey?.cancel();
    },
  };
}
