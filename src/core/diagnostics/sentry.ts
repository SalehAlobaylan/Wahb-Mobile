import * as Sentry from '@sentry/react-native';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';

import { getEnv } from '@/core/config/env';

import { configureDiagnosticSink, type DiagnosticEvent } from './diagnostics';
import { redactSentryEvent } from './sentry-privacy';

let initialized = false;
let actorGeneration = 0;

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
    environment: __DEV__ ? 'development' : 'production',
    release: `wahb-mobile@${Constants.expoConfig?.version ?? '0.1.0'}+${Constants.expoConfig?.ios?.buildNumber ?? '1'}`,
    sendDefaultPii: false,
    maxBreadcrumbs: 0,
    // Performance is sampled tightly and stripped to a fixed transaction
    // shape, so URLs, route parameters, and content never become telemetry.
    tracesSampleRate: __DEV__ ? 0 : 0.02,
    profilesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    enableAutoPerformanceTracing: true,
    enableAutoSessionTracking: false,
    enableCaptureFailedRequests: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    beforeBreadcrumb: () => null,
    beforeSend: redactSentryEvent,
    beforeSendTransaction: (event) => ({
      ...event,
      transaction: 'wahb.mobile',
      contexts: undefined,
      request: undefined,
      spans: [],
    }),
  });

  configureDiagnosticSink(captureDiagnosticEvent);
}

/**
 * Diagnostic correlation uses a one-way, truncated hash, never the IAM user
 * ID or email. Clearing the subject also clears the tag after logout/deletion.
 */
export async function setDiagnosticActor(
  subjectId: string | null,
): Promise<void> {
  const generation = ++actorGeneration;
  if (!subjectId) {
    Sentry.setTag('actor', 'anonymous');
    return;
  }
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    subjectId,
  );
  if (generation === actorGeneration) {
    Sentry.setTag('actor', `u:${digest.slice(0, 16)}`);
  }
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
