export type PreferenceStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export const installationIdKey = 'wahb.installation-id.v1';

export async function readOrCreateInstallationId(
  store: PreferenceStore,
  createUuid: () => string,
): Promise<string> {
  const existing = await store.getItem(installationIdKey);
  if (existing) {
    return existing;
  }

  const next = createUuid();
  await store.setItem(installationIdKey, next);
  return next;
}
