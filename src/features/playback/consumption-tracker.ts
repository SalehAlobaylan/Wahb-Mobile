import {
  classifyConsumption,
  createConsumptionState,
  type ConsumptionState,
} from './consumption-classifier';

export type ConsumptionEvent = {
  type: 'progress' | 'complete' | 'meaningful' | 'sampled' | 'quick_skip';
  played: number;
  furthest: number;
};
const strength = { quick_skip: 1, sampled: 2, meaningful: 3, completed: 4 };

/** One media owner, independent of the feed screen. No timers or I/O. */
export class ConsumptionTracker {
  state: ConsumptionState;
  private lastAt: number | null = null;
  private wasPlaying = false;
  private lastSent = 0;
  private classification = 0;
  private seekTarget: number | null = null;
  private seekOrigin = 0;

  constructor(position = 0) {
    this.state = createConsumptionState(position);
  }

  boundary() {
    this.lastAt = null;
    this.wasPlaying = false;
  }

  seek(target: number) {
    if (!Number.isFinite(target)) return;
    if (Math.abs(target - this.state.lastObservedPositionSeconds) < 0.001)
      return;
    this.seekOrigin = this.state.lastObservedPositionSeconds;
    this.seekTarget = Math.max(0, target);
    this.wasPlaying = false;
  }

  observe(position: number, playing: boolean, at: number, rate = 1) {
    if (!Number.isFinite(position) || position < 0 || !Number.isFinite(at))
      return;
    if (this.seekTarget !== null) {
      const target = this.seekTarget;
      const arrived =
        Math.abs(position - target) <= 0.25 ||
        (target > this.seekOrigin ? position >= target : position <= target);
      if (!arrived) return;
      this.seekTarget = null;
      this.state = { ...this.state, lastObservedPositionSeconds: position };
      this.lastAt = at;
      this.wasPlaying = playing;
      return;
    }
    const delta = position - this.state.lastObservedPositionSeconds;
    const elapsed =
      this.lastAt === null ? 0 : Math.max(0, (at - this.lastAt) / 1000);
    // Sparse native background updates can be useful, but never infer unlimited
    // listening from a suspended JS runtime or a position jump.
    const plausible =
      this.wasPlaying &&
      elapsed > 0 &&
      elapsed <= 300 &&
      delta > 0 &&
      delta <= elapsed * Math.max(0.5, Math.min(2, rate)) + 0.5;
    this.state = {
      accumulatedPlayedSeconds:
        this.state.accumulatedPlayedSeconds + (plausible ? delta : 0),
      furthestPositionSeconds: Math.max(
        this.state.furthestPositionSeconds,
        position,
      ),
      lastObservedPositionSeconds: position,
    };
    this.lastAt = at;
    this.wasPlaying = playing;
  }

  event(
    duration: number,
    terminal = false,
    ended = false,
  ): ConsumptionEvent | null {
    const kind = classifyConsumption(this.state, duration);
    if (!kind) return null;
    const played = Math.floor(this.state.accumulatedPlayedSeconds);
    if (played < 1 && !ended) return null;
    const stronger =
      strength[kind] > this.classification &&
      (terminal || kind === 'meaningful' || kind === 'completed');
    if (!stronger && played - this.lastSent < (terminal ? 1 : 30)) return null;
    this.classification = Math.max(this.classification, strength[kind]);
    this.lastSent = played;
    return {
      type: stronger ? (kind === 'completed' ? 'complete' : kind) : 'progress',
      played,
      furthest: Math.floor(this.state.furthestPositionSeconds),
    };
  }
}
