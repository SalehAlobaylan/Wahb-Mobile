import { describe, expect, it } from '@jest/globals';

import { parseEnv } from './env';

describe('parseEnv', () => {
  it('uses local service defaults', () => {
    expect(parseEnv({})).toEqual({
      EXPO_PUBLIC_CMS_URL: 'http://localhost:8080',
      EXPO_PUBLIC_IAM_URL: 'http://localhost:4003',
      EXPO_PUBLIC_SENTRY_DSN: undefined,
    });
  });

  it('treats an empty Sentry DSN as absent for local development', () => {
    expect(
      parseEnv({
        EXPO_PUBLIC_SENTRY_DSN: '  ',
      }),
    ).toMatchObject({
      EXPO_PUBLIC_SENTRY_DSN: undefined,
    });
  });

  it('still rejects a non-empty invalid Sentry DSN', () => {
    expect(() =>
      parseEnv({
        EXPO_PUBLIC_SENTRY_DSN: 'not-a-url',
      }),
    ).toThrow();
  });

  it('rejects invalid service URLs', () => {
    expect(() =>
      parseEnv({
        EXPO_PUBLIC_CMS_URL: 'not-a-url',
      }),
    ).toThrow();
  });
});
