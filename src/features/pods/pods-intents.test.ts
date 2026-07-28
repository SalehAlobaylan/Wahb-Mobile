import { describe, expect, it, jest } from '@jest/globals';

import { createPodsIntentDispatcher } from './pods-intents';

describe('Pods interaction intents', () => {
  it('maps tap and accessible controls to the same named action', () => {
    const toggle = jest.fn();
    const dispatch = createPodsIntentDispatcher({
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
