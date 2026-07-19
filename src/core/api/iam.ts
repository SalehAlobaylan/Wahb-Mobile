import {
  authTokenPairSchema,
  messageResponseSchema,
  registerResponseSchema,
  iamProfileSchema,
  type AuthTokenPair,
  type RegisteredAccount,
  type IamProfile,
} from './schemas';
import type { Transport } from './transport';

export type IamApi = {
  register(input: RegisterInput): Promise<RegisteredAccount>;
  login(input: PasswordCredentials): Promise<AuthTokenPair>;
  refresh(refreshToken: string): Promise<AuthTokenPair>;
  logout(refreshToken: string): Promise<void>;
  resendVerification(email: string): Promise<void>;
  verifyEmail(token: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  getProfile(): Promise<IamProfile>;
  updateProfile(input: UpdateProfileInput): Promise<IamProfile>;
};

export type PasswordCredentials = {
  email: string;
  password: string;
};

export type RegisterInput = PasswordCredentials & {
  username: string;
};

export type UpdateProfileInput = {
  username?: string;
  bio?: string;
  avatarUrl?: string;
};

export function createIamApi(transport: Transport): IamApi {
  return {
    register(input) {
      return transport.request(
        { body: input, method: 'POST', path: '/api/v1/auth/register' },
        registerResponseSchema,
      );
    },
    login(input) {
      return transport.request(
        { body: input, method: 'POST', path: '/api/v1/auth/login' },
        authTokenPairSchema,
      );
    },
    refresh(refreshToken) {
      return transport.request(
        {
          body: { refresh_token: refreshToken },
          method: 'POST',
          path: '/api/v1/auth/refresh',
        },
        authTokenPairSchema,
      );
    },
    async logout(refreshToken) {
      await transport.request(
        {
          body: { refresh_token: refreshToken },
          method: 'POST',
          path: '/api/v1/auth/logout',
          authenticated: true,
        },
        messageResponseSchema,
      );
    },
    async resendVerification(email) {
      await transport.request(
        {
          body: { email },
          method: 'POST',
          path: '/api/v1/auth/resend-verification',
        },
        messageResponseSchema,
      );
    },
    async verifyEmail(token) {
      await transport.request(
        {
          body: { token },
          method: 'POST',
          path: '/api/v1/auth/verify-email',
        },
        messageResponseSchema,
      );
    },
    async requestPasswordReset(email) {
      await transport.request(
        {
          body: { email },
          method: 'POST',
          path: '/api/v1/auth/forgot-password',
        },
        messageResponseSchema,
      );
    },
    async resetPassword(token, newPassword) {
      await transport.request(
        {
          body: { new_password: newPassword, token },
          method: 'POST',
          path: '/api/v1/auth/reset-password',
        },
        messageResponseSchema,
      );
    },
    getProfile() {
      return transport.request(
        { method: 'GET', path: '/api/v1/users/profile', authenticated: true },
        iamProfileSchema,
      );
    },
    updateProfile(input) {
      return transport.request(
        {
          method: 'PUT',
          path: '/api/v1/users/profile',
          authenticated: true,
          body: {
            ...(input.username !== undefined ? { username: input.username } : {}),
            ...(input.bio !== undefined ? { bio: input.bio } : {}),
            ...(input.avatarUrl !== undefined ? { avatar_url: input.avatarUrl } : {}),
          },
        },
        iamProfileSchema,
      );
    },
  };
}
