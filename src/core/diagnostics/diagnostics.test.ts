import { afterEach, describe, expect, it } from '@jest/globals';

import {
  captureDiagnostic,
  captureException,
  configureDiagnosticSink,
  diagnosticNames,
  elapsedMilliseconds,
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

  it('keeps the event name itself on a fixed, reviewable allow-list', () => {
    expect(diagnosticNames).toEqual(
      expect.arrayContaining([
        'app_start',
        'foryou_first_render',
        'playback_buffer_duration',
        'playback_fallback_duration',
        'outbox_health',
      ]),
    );
  });

  it('does not forward an arbitrary Error name through exception diagnostics', () => {
    const events: DiagnosticEvent[] = [];
    configureDiagnosticSink((event) => events.push(event));
    const error = new Error('private message');
    error.name = 'private@example.com';

    captureException('app_error_boundary', error);

    expect(events[0]?.context).toEqual({ error_name: 'ApplicationError' });
  });
});

describe('latency measurements', () => {
  it('keeps durations numeric, monotonic, and bounded', () => {
    expect(elapsedMilliseconds(10, 35.4)).toBe(25);
    expect(elapsedMilliseconds(100, 10)).toBe(0);
    expect(elapsedMilliseconds(0, 99_999_999)).toBe(600_000);
  });

  it('permits an allow-listed numeric duration only', () => {
    const events: DiagnosticEvent[] = [];
    configureDiagnosticSink((event) => events.push(event));
    captureDiagnostic('playback_start_latency', {
      duration_ms: 123,
      url: 'https://private.example',
    });
    expect(events[0]?.context).toEqual({ duration_ms: 123 });
  });
});
