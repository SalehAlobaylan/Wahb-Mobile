import { toDiagnosticErrorContext } from '@/core/api/errors';

export type DiagnosticEvent = {
  name: string;
  context: Record<string, unknown>;
};

export type DiagnosticSink = (event: DiagnosticEvent) => void;

let sink: DiagnosticSink = () => undefined;

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
  safeContext: Record<string, string | number | boolean | undefined> = {},
): void {
  sink({
    name,
    context: {
      ...toDiagnosticErrorContext(error),
      ...Object.fromEntries(
        Object.entries(safeContext).filter(([, value]) => value !== undefined),
      ),
    },
  });
}
