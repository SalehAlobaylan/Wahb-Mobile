import { describe, expect, it, jest } from '@jest/globals';

import { createForYouIntentDispatcher } from './for-you-intents';

describe('For You interaction intents', () => {
  it('maps tap and accessible controls to the same named action', () => {
    const toggle = jest.fn();
    const dispatch = createForYouIntentDispatcher({
      'toggle-playback': toggle,
      'previous-item': jest.fn(),
      'next-item': jest.fn(),
      'open-comments': jest.fn(),
      'open-about': jest.fn(),
      'open-overflow': jest.fn(),
    });

    dispatch('toggle-playback');
    expect(toggle).toHaveBeenCalledTimes(1);
  });
});
