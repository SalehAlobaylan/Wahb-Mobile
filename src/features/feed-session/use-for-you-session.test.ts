import { describe, expect, it } from '@jest/globals';

import { forYouSessionScope } from './use-for-you-session';

describe('For You duration session scope', () => {
  it('keeps each duration in an independent frozen-session scope', () => {
    expect(forYouSessionScope('anonymous:device', 'both')).toBe(
      'anonymous:device:content-language:both:duration:all',
    );
    expect(forYouSessionScope('anonymous:device', 'both', 15)).toBe(
      'anonymous:device:content-language:both:duration:15',
    );
  });
});
