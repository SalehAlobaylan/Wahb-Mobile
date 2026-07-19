import { describe, expect, it } from '@jest/globals';

import {
  AuthSessionManager,
  subjectFromAccessToken,
  type RefreshCredentialStore,
} from './auth-session';
import type { IamApi } from '@/core/api';

function tokenWithPayload(payload: object): string {
  const encoded = Buffer.from(JSON.stringify(payload))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `header.${encoded}.signature`;
}

describe('access-token local partition parsing', () => {
  it('reads only the IAM subject fields needed for a local user partition', () => {
    expect(
      subjectFromAccessToken(
        tokenWithPayload({
          user_id: '8f01d455-e0e6-411f-b345-9b95a68d5ad2',
          email: 'member@example.test',
          permissions: ['profile:write'],
        }),
      ),
    ).toEqual({
      id: '8f01d455-e0e6-411f-b345-9b95a68d5ad2',
      email: 'member@example.test',
    });
  });

  it('never creates a partition from a malformed token', () => {
    expect(subjectFromAccessToken('not-a-token')).toBeNull();
    expect(
      subjectFromAccessToken(
        tokenWithPayload({ email: 'member@example.test' }),
      ),
    ).toBeNull();
  });

  it('shares one refresh rotation when requests arrive concurrently', async () => {
    const store: RefreshCredentialStore = {
      deleteItemAsync: async () => undefined,
      getItemAsync: async () => '0c2a5b28-8a8e-4247-91d6-4b8cbd6c79bc',
      setItemAsync: async () => undefined,
    };
    let refreshCalls = 0;
    let finishRefresh!: (value: {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }) => void;
    const iam: Pick<IamApi, 'refresh'> = {
      refresh: () => {
        refreshCalls += 1;
        return new Promise((resolve) => {
          finishRefresh = resolve;
        });
      },
    };
    const manager = new AuthSessionManager(iam as IamApi, store);
    const first = manager.refresh();
    const second = manager.refresh();
    await Promise.resolve();
    expect(refreshCalls).toBe(1);

    finishRefresh({
      access_token: tokenWithPayload({
        user_id: '8f01d455-e0e6-411f-b345-9b95a68d5ad2',
      }),
      refresh_token: 'e9577b32-7cd8-439c-a450-dcbb5a8ba6a2',
      expires_in: 3600,
    });
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.any(String),
      expect.any(String),
    ]);
    expect(refreshCalls).toBe(1);
  });
});
