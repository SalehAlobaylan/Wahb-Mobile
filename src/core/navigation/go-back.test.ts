import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { router } from 'expo-router';

import { goBackOrReplace } from './go-back';

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(),
    replace: jest.fn(),
  },
}));

const mockRouter = router as unknown as {
  back: jest.Mock;
  canGoBack: jest.Mock;
  replace: jest.Mock;
};

describe('goBackOrReplace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the navigator history when one exists', () => {
    mockRouter.canGoBack.mockReturnValue(true);

    goBackOrReplace('/');

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('replaces a cold-launch or deep-link route with its fallback', () => {
    mockRouter.canGoBack.mockReturnValue(false);

    goBackOrReplace('/news');

    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/news');
  });

  it('replaces when this router runtime cannot report navigation history', () => {
    mockRouter.canGoBack = undefined as unknown as jest.Mock;

    goBackOrReplace('/');

    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });
});
