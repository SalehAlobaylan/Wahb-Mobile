export type ConsumptionState = {
  accumulatedPlayedSeconds: number;
  furthestPositionSeconds: number;
  lastObservedPositionSeconds: number;
};

export type ConsumptionClassification =
  'completed' | 'meaningful' | 'quick_skip' | 'sampled';

const maximumContinuousPlaybackDeltaSeconds = 5;

export function createConsumptionState(
  initialPositionSeconds = 0,
): ConsumptionState {
  return {
    accumulatedPlayedSeconds: 0,
    furthestPositionSeconds: Math.max(0, initialPositionSeconds),
    lastObservedPositionSeconds: Math.max(0, initialPositionSeconds),
  };
}

/** Counts only forward, plausibly continuous playback; seeks never add time. */
export function observeConsumption(
  state: ConsumptionState,
  positionSeconds: number,
  isPlaying: boolean,
): ConsumptionState {
  const position = Math.max(0, positionSeconds);
  const delta = position - state.lastObservedPositionSeconds;
  const playedSeconds =
    isPlaying && delta > 0 && delta <= maximumContinuousPlaybackDeltaSeconds
      ? delta
      : 0;
  return {
    accumulatedPlayedSeconds: state.accumulatedPlayedSeconds + playedSeconds,
    furthestPositionSeconds: Math.max(state.furthestPositionSeconds, position),
    lastObservedPositionSeconds: position,
  };
}

export function classifyConsumption(
  state: ConsumptionState,
  durationSeconds: number,
  reachedEnd = false,
): ConsumptionClassification | null {
  if (durationSeconds <= 0) {
    return null;
  }
  const meaningfulThreshold = Math.min(30, durationSeconds * 0.1);
  const reachedNinetyPercent =
    state.furthestPositionSeconds >= durationSeconds * 0.9;
  if (
    reachedEnd ||
    (reachedNinetyPercent &&
      state.accumulatedPlayedSeconds >= meaningfulThreshold)
  ) {
    return 'completed';
  }
  if (state.accumulatedPlayedSeconds >= meaningfulThreshold) {
    return 'meaningful';
  }
  if (state.accumulatedPlayedSeconds < 5) {
    return 'quick_skip';
  }
  return 'sampled';
}
