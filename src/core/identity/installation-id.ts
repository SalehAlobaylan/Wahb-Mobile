import * as Crypto from 'expo-crypto';
import Storage from 'expo-sqlite/kv-store';

import {
  installationIdKey,
  readOrCreateInstallationId,
  type PreferenceStore,
} from './installation-id-core';

const preferenceStore: PreferenceStore = Storage;
let installationIdPromise: Promise<string> | undefined;

/**
 * A random, app-local, non-advertising identifier. It is intentionally stored
 * in ordinary preference storage, not SecureStore, because it is neither an
 * authentication credential nor a cross-device identity.
 */
export function getInstallationId(): Promise<string> {
  installationIdPromise ??= readOrCreateInstallationId(
    preferenceStore,
    Crypto.randomUUID,
  );
  return installationIdPromise;
}

export async function resetInstallationId(): Promise<string> {
  await preferenceStore.removeItem(installationIdKey);
  installationIdPromise = undefined;
  return getInstallationId();
}
