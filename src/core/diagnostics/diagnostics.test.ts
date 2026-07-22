import { afterEach, describe, expect, it } from '@jest/globals';

import {
  captureDiagnostic,
  configureDiagnosticSink,
  type DiagnosticEvent,
} from './diagnostics';

describe('diagnostic allow-list', () => {
  afterEach(() => configureDiagnosticSink(() => undefined));

  it('drops arbitrary user-derived dimensions before a sink receives an event', () => {
    const events: DiagnosticEvent[] = [];
    configureDiagnosticSink((event) => events.push(event));

    captureDiagnostic('outbox_health', {
      delivered: 2,
      pending: 1,
      email: 'private@example.com',
      transcript: 'private text',
      signed_url: 'https://example.test/media?token=private',
    });

    expect(events).toEqual([
      {
        name: 'outbox_health',
        context: { delivered: 2, pending: 1 },
      },
    ]);
  });
});
