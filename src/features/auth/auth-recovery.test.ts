import { describe, expect, it } from '@jest/globals';

import { HttpError } from '@/core/api';

import { recoveryActionForAuthError } from './auth-recovery';

describe('recoveryActionForAuthError', () => {
  it.each([400, 403, 404, 409, 410, 422])(
    'offers a neutral verification recovery for HTTP %i',
    (status) => {
      expect(
        recoveryActionForAuthError(
          'verify-email',
          new HttpError({
            method: 'POST',
            path: '/api/v1/auth/verify-email',
            status,
          }),
        ),
      ).toBe('resend-verification');
    },
  );

  it('offers reset restart only for unusable reset links', () => {
    expect(
      recoveryActionForAuthError(
        'reset-password',
        new HttpError({
          method: 'POST',
          path: '/api/v1/auth/reset-password',
          status: 410,
        }),
      ),
    ).toBe('restart-password-reset');
    expect(
      recoveryActionForAuthError(
        'reset-password',
        new HttpError({
          method: 'POST',
          path: '/api/v1/auth/reset-password',
          status: 500,
        }),
      ),
    ).toBeNull();
  });
});
