import type { ErrorEvent } from '@sentry/react-native';
import { sanitizeDiagnosticContext } from './diagnostics';

/**
 * Keep the outbound error envelope intentionally sparse. The only preserved
 * context is supplied by the local diagnostics allow-list; every other Sentry
 * integration must be treated as potentially user-derived.
 */
export function redactSentryEvent(event: ErrorEvent): ErrorEvent {
  const diagnostic = event.contexts?.wahb_diagnostic;
  return {
    ...event,
    exception: event.exception
      ? {
          values: event.exception.values?.map((value) => ({
            type: value.type ?? 'Error',
            value: 'redacted application error',
          })),
        }
      : undefined,
    request: undefined,
    user: undefined,
    extra: undefined,
    breadcrumbs: undefined,
    contexts:
      diagnostic && typeof diagnostic === 'object'
        ? {
            wahb_diagnostic: sanitizeDiagnosticContext(
              diagnostic as Record<
                string,
                string | number | boolean | undefined
              >,
            ),
          }
        : undefined,
  };
}
