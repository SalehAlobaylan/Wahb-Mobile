import type { ErrorEvent } from '@sentry/react-native';

/**
 * Keep the outbound error envelope intentionally sparse. The only preserved
 * context is supplied by the local diagnostics allow-list; every other Sentry
 * integration must be treated as potentially user-derived.
 */
export function redactSentryEvent(event: ErrorEvent): ErrorEvent {
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
    contexts: event.contexts?.wahb_diagnostic
      ? { wahb_diagnostic: event.contexts.wahb_diagnostic }
      : undefined,
  };
}
