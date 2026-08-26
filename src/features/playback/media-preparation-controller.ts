import {
  decideMediaPreparation,
  type MediaPreparationInput,
  type MediaPreparationPlan,
} from './media-preparation-policy';

export type PreparationCandidate = {
  id: string;
  sourceUrl: string;
  sourceType?: 'hls' | 'mp4' | 'audio';
};

export type MediaPreparationTransport = {
  /** Performs a bounded source metadata probe, never a media-body download. */
  probeSource(
    candidate: PreparationCandidate,
    signal: AbortSignal,
  ): Promise<void>;
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
          .probeSource(candidate, abort.signal)
          .catch(() => undefined);
      }
      return plan;
    },
    cancel,
  };
}

export const headPreparationTransport: MediaPreparationTransport = {
  async probeSource(candidate, signal) {
    // Signed CDN URLs do not reliably retain an extension. The CMS-verified
    // rendition type is authoritative for selecting the bounded probe.
    if (candidate.sourceType === 'hls') {
      const response = await fetch(candidate.sourceUrl, {
        method: 'GET',
        signal,
        headers: { Range: 'bytes=0-16384' },
      });
      if (!response.ok) {
        throw new Error(`playlist preparation failed: ${response.status}`);
      }
      const body = await response.text();
      if (!body.startsWith('#EXTM3U') || body.length > 16_384) {
        throw new Error('invalid bounded HLS master');
      }
      return;
    }
    const response = await fetch(candidate.sourceUrl, {
      method: 'HEAD',
      signal,
    });
    if (!response.ok) {
      throw new Error(`media preparation failed: ${response.status}`);
    }
  },
};
