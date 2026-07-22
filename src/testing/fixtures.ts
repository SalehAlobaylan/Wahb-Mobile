import type { AuthSessionSnapshot } from '@/features/auth/auth-session';

export const fixtureIds = {
  content: '11111111-1111-4111-8111-111111111111',
  installation: '22222222-2222-4222-8222-222222222222',
  user: '33333333-3333-4333-8333-333333333333',
} as const;

export function anonymousSession(): AuthSessionSnapshot {
  return { accessToken: null, subject: null };
}

export function verifiedUserSession(
  overrides: Partial<AuthSessionSnapshot['subject']> = {},
): AuthSessionSnapshot {
  return {
    accessToken: 'fixture-access-token',
    subject: {
      id: fixtureIds.user,
      email: 'verified@example.test',
      ...overrides,
    },
  };
}
