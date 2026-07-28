import { describe, expect, it } from '@jest/globals';

import { podsSessionScope } from './use-pods-session';

describe('Pods duration session scope', () => {
  it('keeps each duration in an independent frozen-session scope', () => {
    expect(podsSessionScope('anonymous:device', 'both')).toBe(
      'anonymous:device:content-language:both:duration:all',
    );
    expect(podsSessionScope('anonymous:device', 'both', 15)).toBe(
      'anonymous:device:content-language:both:duration:15',
    );
  });
});
