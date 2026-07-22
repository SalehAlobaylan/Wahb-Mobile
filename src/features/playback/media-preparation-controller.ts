import {
  decideMediaPreparation,
  type MediaPreparationInput,
  type MediaPreparationPlan,
} from './media-preparation-policy';

export type PreparationCandidate = {
  id: string;
  sourceUrl: string;
};

export type MediaPreparationTransport = {
  /** Performs a bounded source metadata probe, never a media-body download. */
  probeSource(url: string, signal: AbortSignal): Promise<void>;
};

export type MediaPreparationController = {
  reconcile(
    input: MediaPreparationInput,
    candidates: PreparationCandidate[],
  ): MediaPreparationPlan;
  cancel(): void;
};

/**
 * Owns at most one speculative generation. A new feed/lifecycle decision
 * aborts all previous probes before it starts another one; no native player,
 * lock-screen ownership, or persistent download is created here.
 */
export function createMediaPreparationController(
  transport: MediaPreparationTransport,
): MediaPreparationController {
  let activeAbort: AbortController | null = null;

  const cancel = () => {
    activeAbort?.abort();
    activeAbort = null;
  };

  return {
    reconcile(input, candidates) {
      cancel();
      const plan = decideMediaPreparation(input);
      if (plan.cancelSpeculativeWork) return plan;

      const abort = new AbortController();
      activeAbort = abort;
      const byIndex = plan.prepareIndexes
        .map((index) => candidates[index])
        .filter((candidate): candidate is PreparationCandidate =>
          Boolean(candidate),
        );
      for (const candidate of byIndex) {
        void transport
          .probeSource(candidate.sourceUrl, abort.signal)
          .catch(() => undefined);
      }
      return plan;
    },
    cancel,
  };
}

export const headPreparationTransport: MediaPreparationTransport = {
  async probeSource(url, signal) {
    await fetch(url, { method: 'HEAD', signal });
  },
};
