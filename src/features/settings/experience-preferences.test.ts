import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  defaultExperiencePreferences,
  readExperiencePreferences,
  writeExperiencePreferences,
} from './experience-preferences';

jest.mock('expo-sqlite/kv-store', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const storage = jest.requireMock('expo-sqlite/kv-store') as {
  getItem: ReturnType<typeof jest.fn>;
  setItem: ReturnType<typeof jest.fn>;
};

describe('experience preferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses sensible defaults when nothing has been stored', async () => {
    storage.getItem.mockResolvedValue(null);
    await expect(readExperiencePreferences()).resolves.toEqual(
      defaultExperiencePreferences,
    );
  });

  it('persists normalized experience preferences', async () => {
    storage.setItem.mockResolvedValue(undefined);
    await expect(
      writeExperiencePreferences({
        autoplayEnabled: false,
        hapticsEnabled: true,
        theme: 'system',
      }),
    ).resolves.toEqual({
      autoplayEnabled: false,
      hapticsEnabled: true,
      theme: 'system',
    });
  });
});
