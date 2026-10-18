import { emitEvent } from './collector';
import { experienceId } from './id';
import { isForeground, subscribeForeground } from './lifecycle';
import type {
  RuxEventType,
  RuxFailureClass,
  RuxMeasurements,
  RuxOutcome,
  RuxPhase,
  RuxPlaybackType,
  RuxSurface,
} from './types';

export const nowMs = () => performance.now();
export const isHidden = () => !isForeground();
export const newJourneyId = experienceId;
const elapsed = (start: number) =>
  Math.min(600000, Math.max(0, Math.round(nowMs() - start)));
interface Base {
  surface: RuxSurface;
  content_id?: string | null;
  feed_session_id?: string | null;
  story_id?: string | null;
  playback_type?: RuxPlaybackType | null;
}
interface Measured {
  id: string;
  settle(outcome: RuxOutcome, measurements?: RuxMeasurements): void;
  cancel(): void;
  pending(): boolean;
}
function measured(
  phase: RuxPhase,
  base: Base,
  diagnostic?: RuxEventType,
  timeout = 15000,
  id = newJourneyId(),
  finalMeasurements?: () => RuxMeasurements,
): Measured {
  const start = nowMs();
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;
  const settle = (outcome: RuxOutcome, measurements: RuxMeasurements = {}) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    unsubscribe?.();
    emitEvent({
      ...base,
      journey_id: id,
      event_type: 'journey_terminal',
      phase,
      outcome: isHidden() && outcome !== 'cancelled' ? 'backgrounded' : outcome,
      measurements: {
        duration_ms: elapsed(start),
        visible: !isHidden(),
        ...finalMeasurements?.(),
        ...measurements,
      },
    });
  };
  const onVisibility = () => {
    if (isHidden()) settle('backgrounded', { visible: false });
  };
  unsubscribe = subscribeForeground(onVisibility);
  if (diagnostic)
    emitEvent({
      ...base,
      event_type: diagnostic,
      journey_id: id,
      measurements: { visible: !isHidden() },
    });
  if (timeout)
    timer = setTimeout(
      () => settle('timeout', { failure_class: 'timeout' }),
      timeout,
    );
  if (isHidden()) settle('backgrounded', { visible: false });
  return {
    id,
    settle,
    cancel: () => settle('cancelled'),
    pending: () => !settled,
  };
}
export interface FeedLoadJourney {
  rendered(contentId?: string, feedSessionId?: string): void;
  empty(): void;
  failed(failureClass?: RuxFailureClass): void;
  cancel(): void;
}
export function beginFeedLoad(surface: RuxSurface): FeedLoadJourney {
  const base: Base = { surface };
  const journey = measured('feed', base, 'feed_requested');
  return {
    rendered: (id, feedSessionId) => {
      base.content_id = id;
      base.feed_session_id = feedSessionId;
      journey.settle('success');
    },
    empty: () => journey.settle('empty'),
    failed: (failure_class = 'unknown') =>
      journey.settle('failed', { failure_class }),
    cancel: journey.cancel,
  };
}
export interface PaginationJourney {
  received(): void;
  starved(): void;
  failed(): void;
  end(): void;
  cancel(): void;
}
export function beginPagination(surface: RuxSurface): PaginationJourney {
  const journey = measured(
    'pagination',
    { surface },
    'pagination_requested',
    30000,
  );
  let boundaryStarved = false;
  return {
    received: () =>
      journey.settle('success', { boundary_starved: boundaryStarved }),
    starved: () => {
      boundaryStarved = true;
    },
    failed: () =>
      journey.settle('failed', {
        boundary_starved: boundaryStarved,
        failure_class: 'network',
      }),
    end: () => journey.settle('end_of_feed'),
    cancel: journey.cancel,
  };
}
export interface PlaybackJourneyOpts {
  surface: RuxSurface;
  contentId?: string | null;
  playbackType?: RuxPlaybackType | null;
  explicitIntent?: boolean;
  resumeContinuation?: boolean;
}
export interface PlaybackJourney {
  onProgress(): void;
  onWaiting(): void;
  onMediaError(code: number | null): void;
  onPlayReject(error: unknown): void;
  onHidden(): void;
  cancel(): void;
  finish(): void;
  fallback(type: RuxPlaybackType): void;
  pending(): boolean;
}
export function beginPlayback(opts: PlaybackJourneyOpts): PlaybackJourney {
  const base: Base = {
    surface: opts.surface,
    content_id: opts.contentId,
    playback_type: opts.playbackType,
  };
  let usedFallback = false;
  const startup = measured(
    'startup',
    base,
    opts.resumeContinuation ? undefined : 'playback_attempted',
    10000,
    undefined,
    () => ({ fallback_used: usedFallback }),
  );
  if (opts.resumeContinuation) startup.cancel();
  let started = false;
  let continuation: Measured | undefined;
  let segmentStart = 0;
  let waitingAt: number | null = null;
  let stalls = 0;
  let stallMS = 0;
  let fallback: Measured | undefined;
  let segmentFallback = false;
  let segmentTimer: ReturnType<typeof setTimeout> | undefined;
  const summary = (outcome: RuxOutcome) => {
    if (!continuation) return;
    if (waitingAt !== null) {
      stallMS += elapsed(waitingAt);
      waitingAt = null;
    }
    continuation.settle(outcome, {
      observed_playback_ms: elapsed(segmentStart),
      stall_duration_ms: Math.min(elapsed(segmentStart), Math.round(stallMS)),
      stall_count: stalls,
      fallback_used: segmentFallback,
    });
    continuation = undefined;
    clearTimeout(segmentTimer);
  };
  const startSegment = () => {
    segmentStart = nowMs();
    stallMS = 0;
    stalls = 0;
    segmentFallback = false;
    continuation = measured('continuation', base, undefined, 0);
    segmentTimer = setTimeout(() => {
      const stalled = waitingAt !== null;
      summary('success');
      if (!isHidden()) {
        startSegment();
        if (stalled) {
          waitingAt = nowMs();
          stalls = 1;
        }
      }
    }, 60000);
  };
  if (opts.resumeContinuation) {
    started = true;
    startSegment();
  }
  return {
    pending: () => startup.pending(),
    onProgress() {
      if (isHidden()) return;
      if (!started) {
        started = true;
        if (startup.pending())
          startup.settle('success', { fallback_used: usedFallback });
        startSegment();
      }
      fallback?.settle('success');
      if (waitingAt !== null) {
        stallMS += elapsed(waitingAt);
        waitingAt = null;
        emitEvent({
          ...base,
          event_type: 'playback_resumed',
          journey_id: startup.id,
          measurements: { visible: true },
        });
      }
    },
    onWaiting() {
      if (!started || isHidden() || waitingAt !== null) return;
      waitingAt = nowMs();
      stalls++;
      emitEvent({
        ...base,
        event_type: 'playback_waiting',
        journey_id: startup.id,
        measurements: { visible: true },
      });
    },
    onMediaError(media_error_code) {
      startup.settle('failed', {
        failure_class: 'media_error',
        media_error_code,
        fallback_used: usedFallback,
      });
      fallback?.settle('failed', { failure_class: 'media_error' });
      summary('failed');
    },
    onPlayReject(error) {
      const policyBlock =
        (error as { name?: string } | null)?.name === 'NotAllowedError' &&
        !opts.explicitIntent;
      startup.settle(policyBlock ? 'autoplay_blocked' : 'failed', {
        failure_class: policyBlock ? 'autoplay_blocked' : 'media_error',
        fallback_used: usedFallback,
      });
      fallback?.settle('failed');
      summary('failed');
    },
    onHidden() {
      startup.settle('backgrounded', { visible: false });
      fallback?.settle('backgrounded', { visible: false });
      summary('backgrounded');
    },
    cancel() {
      startup.cancel();
      fallback?.cancel();
      summary(started ? 'success' : 'cancelled');
    },
    finish() {
      startup.cancel();
      fallback?.cancel();
      summary('success');
    },
    fallback(type) {
      usedFallback = true;
      base.playback_type = type;
      if (started) segmentFallback = true;
      if (!fallback?.pending())
        fallback = measured(
          'fallback',
          base,
          'playback_fallback',
          10000,
          started ? newJourneyId() : startup.id,
        );
    },
  };
}
// Kept for external diagnostic callers; the playback owner correlates actual fallback.
export function reportPlaybackFallback(opts: PlaybackJourneyOpts) {
  emitEvent({
    event_type: 'playback_fallback',
    surface: opts.surface,
    content_id: opts.contentId,
    playback_type: opts.playbackType,
    measurements: { visible: !isHidden() },
  });
}
export interface HandoffJourney {
  completed(actualPosition?: number): void;
  failed(): void;
  cancel(): void;
}
export function beginHandoff(
  surface: RuxSurface,
  contentId?: string | null,
  expectedPosition = 0,
  advancingRate = 0,
): HandoffJourney {
  const startedAt = nowMs();
  const journey = measured(
    'handoff',
    { surface, content_id: contentId },
    'handoff_started',
    4000,
  );
  return {
    completed: (actualPosition = expectedPosition) => {
      const drift = Math.min(
        600000,
        Math.round(
          Math.abs(
            actualPosition -
              expectedPosition -
              (elapsed(startedAt) / 1000) * advancingRate,
          ) * 1000,
        ),
      );
      journey.settle(drift <= 2000 ? 'success' : 'failed', {
        position_drift_ms: drift,
      });
    },
    failed: () => journey.settle('failed'),
    cancel: journey.cancel,
  };
}
export interface ArticleJourney {
  ready(): void;
  failed(failureClass?: RuxFailureClass): void;
  cancel(): void;
}
export function beginArticle(
  storyId?: string | null,
  contentId?: string | null,
): ArticleJourney {
  const journey = measured(
    'reader',
    { surface: 'news', story_id: storyId, content_id: contentId },
    'article_opened',
  );
  return {
    ready: () => journey.settle('success'),
    failed: (failure_class = 'unknown') =>
      journey.settle('failed', { failure_class }),
    cancel: journey.cancel,
  };
}
export function reportClientFailure(
  surface: RuxSurface,
  failure_class: RuxFailureClass = 'unknown',
) {
  emitEvent({
    event_type: 'client_failure',
    surface,
    measurements: { failure_class, visible: !isHidden() },
  });
}
export type { RuxFailureClass, RuxPlaybackType, RuxSurface };

// Intent exists before a deep-link detail request. The mounted complete reader
// takes ownership of this same attempt; it never creates a second denominator.
const readerIntents = new Map<string, ArticleJourney>();
export function beginReaderIntent(contentId: string): ArticleJourney {
  for (const previous of readerIntents.values()) previous.cancel();
  readerIntents.clear();
  const journey = beginArticle(null, contentId);
  readerIntents.set(contentId, journey);
  return journey;
}
export function takeReaderIntent(contentId: string): ArticleJourney {
  const journey = readerIntents.get(contentId);
  return journey || beginReaderIntent(contentId);
}
export function releaseReaderIntent(
  contentId: string,
  journey: ArticleJourney,
): void {
  journey.cancel();
  if (readerIntents.get(contentId) === journey) readerIntents.delete(contentId);
}
