import * as Sentry from '@sentry/react-native';

import { getEnv } from '@/core/config/env';

import { configureDiagnosticSink, type DiagnosticEvent } from './diagnostics';
import { redactSentryEvent } from './sentry-privacy';

let initialized = false;

/**
 * The client reports only named, redacted diagnostic events. This is
 * deliberately not a product-analytics pipeline: no media URLs, account
 * identity, API bodies, transcripts, article text, comments, screenshots,
 * view hierarchies, or breadcrumbs leave the device through this boundary.
 */
export function initializeDiagnostics(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  const dsn = getEnv().EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    sendDefaultPii: false,
    maxBreadcrumbs: 0,
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    enableAutoPerformanceTracing: false,
    enableAutoSessionTracking: false,
    enableCaptureFailedRequests: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    beforeBreadcrumb: () => null,
    beforeSend: redactSentryEvent,
  });

  configureDiagnosticSink(captureDiagnosticEvent);
}

function captureDiagnosticEvent(event: DiagnosticEvent): void {
  Sentry.withScope((scope) => {
    scope.setTag('diagnostic_name', event.name);
    scope.setContext('wahb_diagnostic', event.context);
    // A fixed message guarantees that error strings themselves cannot escape
    // through the reporting provider.
    Sentry.captureMessage('wahb_mobile_diagnostic', 'error');
  });
}
