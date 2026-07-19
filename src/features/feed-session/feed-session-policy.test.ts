import { describe, expect, it } from '@jest/globals';

import {
  createSessionExpiry,
  forYouSessionLifetimeMs,
  isSessionFresh,
} from './feed-session-policy';

describe('For You session lifetime', () => {
  it('freezes a session for the accepted six-hour restoration window', () => {
    const now = new Date('2026-07-19T08:00:00.000Z');
    const expiry = createSessionExpiry(now);

    expect(expiry.getTime() - now.getTime()).toBe(forYouSessionLifetimeMs);
    expect(isSessionFresh(expiry, new Date('2026-07-19T13:59:59.999Z'))).toBe(
      true,
    );
    expect(isSessionFresh(expiry, new Date('2026-07-19T14:00:00.000Z'))).toBe(
      false,
    );
  });
});
