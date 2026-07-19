import { describe, expect, it } from '@jest/globals';

import {
  installationIdKey,
  readOrCreateInstallationId,
  type PreferenceStore,
} from './installation-id-core';

function createStore(
  initial: string | null,
): PreferenceStore & { value: string | null } {
  return {
    value: initial,
    async getItem() {
      return this.value;
    },
    async setItem(key, value) {
      expect(key).toBe(installationIdKey);
      this.value = value;
    },
    async removeItem(key) {
      expect(key).toBe(installationIdKey);
      this.value = null;
    },
  };
}

describe('installation identity', () => {
  it('keeps the existing local non-advertising identity', async () => {
    const store = createStore('existing-installation-id');

    await expect(
      readOrCreateInstallationId(store, () => 'new-id'),
    ).resolves.toBe('existing-installation-id');
  });

  it('creates and persists an identity once when missing', async () => {
    const store = createStore(null);

    await expect(
      readOrCreateInstallationId(store, () => 'new-id'),
    ).resolves.toBe('new-id');
    expect(store.value).toBe('new-id');
  });
});
