import { toDiagnosticErrorContext } from '@/core/api/errors';

export type DiagnosticEvent = {
  name: DiagnosticName;
  context: Record<string, unknown>;
};

export type DiagnosticSink = (event: DiagnosticEvent) => void;

// Event names are an allow-list as well as their dimensions. This prevents a
// future call site from using a title, URL, subject, or backend error string as
// the Sentry tag that identifies an event.
export const diagnosticNames = [
  'app_error_boundary',
  'app_start',
  'article_bookmark_enqueue_failed',
  'article_reader_position_failed',
  'article_share_failed',
  'article_source_browser_failed',
  'auth_logout_remote_failed',
  'auth_refresh_failed',
  'autoplay_preference_write_failed',
  'feed_session_position_write_failed',
  'foryou_consumption_queue_failed',
  'foryou_engagement_queue_failed',
  'foryou_exposure_queue_failed',
  'foryou_first_render',
  'foryou_freshness_check_failed',
  'foryou_hide_item_failed',
  'foryou_mute_source_failed',
  'foryou_progress_queue_failed',
  'foryou_session_health',
  'foryou_session_offline_restore',
  'foryou_session_page_failed',
  'foryou_session_refresh_failed',
  'foryou_share_failed',
  'news_history_enqueue_failed',
  'news_history_write_failed',
  'news_live_refresh_failed',
  'news_page_failed',
  'outbox_flush_failed',
  'outbox_health',
  'outbox_rejected',
  'playback_buffer_duration',
  'playback_buffering',
  'playback_fallback_duration',
  'playback_fallback_exhausted',
  'playback_fallback_start',
  'playback_runtime_failover',
  'playback_source_attempt_failed',
  'playback_start',
  'playback_start_latency',
] as const;

export type DiagnosticName = (typeof diagnosticNames)[number];

let sink: DiagnosticSink = () => undefined;

const allowedContextKeys = new Set([
  'app_state',
  'attempt',
  'build',
  'delivered',
  'duration_ms',
  'error_name',
  'event_type',
  'issue_count',
  'method',
  'network_class',
  'pending',
  'path',
  'playback_source',
  'platform',
  'snapshot_age_ms',
  'stage',
  'status',
  'status_code',
]);

type SafeDiagnosticValue = string | number | boolean | undefined;

export function sanitizeDiagnosticContext(
  context: Record<string, SafeDiagnosticValue>,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(context).filter(
      ([key, value]) =>
        allowedContextKeys.has(key) &&
        value !== undefined &&
        (typeof value !== 'number' || Number.isFinite(value)),
    ),
  ) as Record<string, string | number | boolean>;
}

/**
 * Sentry is attached through this narrow sink when its release configuration is
 * introduced. Keeping the boundary here prevents raw API payloads, headers,
 * signed URLs, credentials, transcripts, articles, or comments from reaching
 * diagnostics by accident.
 */
export function configureDiagnosticSink(nextSink: DiagnosticSink): void {
  sink = nextSink;
}

export function captureException(
  name: DiagnosticName,
  error: unknown,
  context: Record<string, SafeDiagnosticValue> = {},
): void {
  sink({
    name,
    context: {
      ...sanitizeDiagnosticContext(
        toDiagnosticErrorContext(error) as Record<string, SafeDiagnosticValue>,
      ),
      ...sanitizeDiagnosticContext(context),
    },
  });
}

/** Emits a named lifecycle measurement without an exception payload. */
export function captureDiagnostic(
  name: DiagnosticName,
  context: Record<string, SafeDiagnosticValue> = {},
): void {
  sink({ name, context: sanitizeDiagnosticContext(context) });
}

/** Monotonic-friendly, bounded duration helper for privacy-safe latency events. */
export function elapsedMilliseconds(
  startMs: number,
  nowMs = performance.now(),
): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) return 0;
  return Math.min(10 * 60 * 1_000, Math.max(0, Math.round(nowMs - startMs)));
}
