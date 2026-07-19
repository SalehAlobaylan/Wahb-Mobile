import { describe, expect, it } from '@jest/globals';

import { parseWahbLink } from './link-dispatcher';

describe('Wahb link dispatcher', () => {
  it('accepts canonical public content links without query state', () => {
    expect(
      parseWahbLink(
        'https://wahb.salehspace.dev/content/46e1db0e-4e56-4e9b-8ea5-2cab6523fd0a',
      ),
    ).toEqual({
      type: 'content',
      contentId: '46e1db0e-4e56-4e9b-8ea5-2cab6523fd0a',
    });
  });

  it('routes one-time verification and reset tokens only to their IAM flows', () => {
    expect(
      parseWahbLink('https://wahb.salehspace.dev/verify-email?token=one-time'),
    ).toEqual({ type: 'verify-email', token: 'one-time' });
    expect(parseWahbLink('wahb://reset-password?token=one-time')).toEqual({
      type: 'reset-password',
      token: 'one-time',
    });
  });

  it('rejects unrelated hosts and malformed private routes', () => {
    expect(
      parseWahbLink('https://attacker.example/content/46e1db0e'),
    ).toBeNull();
    expect(parseWahbLink('wahb://content')).toBeNull();
  });
});
