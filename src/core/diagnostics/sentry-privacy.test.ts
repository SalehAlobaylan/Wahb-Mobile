import { describe, expect, it } from '@jest/globals';

import { redactSentryEvent } from './sentry-privacy';

describe('redactSentryEvent', () => {
  it('keeps only allow-listed diagnostic context', () => {
    const redacted = redactSentryEvent({
      event_id: 'event-id',
      type: undefined,
      exception: {
        values: [
          {
            type: 'ApiError',
            value: 'https://signed.example/video?token=private',
          },
        ],
      },
      request: { url: 'https://cms.example/private' },
      user: { id: 'user-private' },
      extra: { transcript: 'private text' },
      breadcrumbs: [{ message: 'private navigation' }],
      contexts: {
        device: { model: 'private device context' },
        wahb_diagnostic: { status: 503, endpoint: 'feed_session' },
      },
    });

    expect(redacted).toMatchObject({
      event_id: 'event-id',
      exception: {
        values: [
          {
            type: 'ApiError',
            value: 'redacted application error',
          },
        ],
      },
      contexts: {
        wahb_diagnostic: { status: 503, endpoint: 'feed_session' },
      },
    });
    expect(redacted.request).toBeUndefined();
    expect(redacted.user).toBeUndefined();
    expect(redacted.extra).toBeUndefined();
    expect(redacted.breadcrumbs).toBeUndefined();
  });
});
