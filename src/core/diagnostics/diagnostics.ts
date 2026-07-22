import { toDiagnosticErrorContext } from '@/core/api/errors';

export type DiagnosticEvent = {
  name: string;
  context: Record<string, unknown>;
};

export type DiagnosticSink = (event: DiagnosticEvent) => void;

let sink: DiagnosticSink = () => undefined;

const allowedContextKeys = new Set([
  'app_state',
  'attempt',
  'build',
  'delivered',
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
]);

type SafeDiagnosticValue = string | number | boolean | undefined;

function safeContext(
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
  name: string,
  error: unknown,
  context: Record<string, SafeDiagnosticValue> = {},
): void {
  sink({
    name,
    context: {
      ...toDiagnosticErrorContext(error),
      ...safeContext(context),
    },
  });
}

/** Emits a named lifecycle measurement without an exception payload. */
export function captureDiagnostic(
  name: string,
  context: Record<string, SafeDiagnosticValue> = {},
): void {
  sink({ name, context: safeContext(context) });
}
