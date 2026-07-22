import { HttpError } from '@/core/api';

export type AuthRecoveryFlow = 'verify-email' | 'reset-password';
export type AuthRecoveryAction =
  'resend-verification' | 'restart-password-reset' | null;

/**
 * Recovery links are single-use and may have been opened on another device.
 * Map only the IAM classes that can mean a link is unusable; transport and
 * server errors remain retryable and intentionally reveal no token details.
 */
export function recoveryActionForAuthError(
  flow: AuthRecoveryFlow,
  error: unknown,
): AuthRecoveryAction {
  if (!(error instanceof HttpError)) {
    return null;
  }
  if (![400, 403, 404, 409, 410, 422].includes(error.context.status ?? 0)) {
    return null;
  }
  return flow === 'verify-email'
    ? 'resend-verification'
    : 'restart-password-reset';
}
