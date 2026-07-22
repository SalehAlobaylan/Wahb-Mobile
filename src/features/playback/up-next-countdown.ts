export type UpNextTimerApi = {
  setInterval(
    callback: () => void,
    delayMs: number,
  ): ReturnType<typeof setInterval>;
  clearInterval(timer: ReturnType<typeof setInterval>): void;
  setTimeout(
    callback: () => void,
    delayMs: number,
  ): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
};

export type UpNextCountdown = {
  schedule(
    onTick: (seconds: number | null) => void,
    onComplete: () => void,
  ): void;
  cancel(): void;
  isScheduled(): boolean;
};

/** A controller-owned, cancellation-safe three-second transition. */
export function createUpNextCountdown(
  timers: UpNextTimerApi = {
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
  },
): UpNextCountdown {
  let interval: ReturnType<typeof setInterval> | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (interval) timers.clearInterval(interval);
    if (timeout) timers.clearTimeout(timeout);
    interval = null;
    timeout = null;
  };

  return {
    schedule(onTick, onComplete) {
      cancel();
      let seconds = 3;
      onTick(seconds);
      interval = timers.setInterval(() => {
        seconds = Math.max(0, seconds - 1);
        onTick(seconds);
      }, 1_000);
      timeout = timers.setTimeout(() => {
        cancel();
        onTick(null);
        onComplete();
      }, 3_000);
    },
    cancel,
    isScheduled: () => timeout !== null,
  };
}
