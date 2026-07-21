import * as SecureStore from 'expo-secure-store';

import {
  createServiceClients,
  HttpError,
  type AuthTokenPair,
  type IamApi,
} from '@/core/api';
import { captureException } from '@/core/diagnostics/diagnostics';

const refreshTokenKey = 'wahb.auth.refresh-token.v1';

export type RefreshCredentialStore = Pick<
  typeof SecureStore,
  'deleteItemAsync' | 'getItemAsync' | 'setItemAsync'
>;

export type AuthSubject = {
  id: string;
  email: string | null;
};

export type AuthSessionSnapshot = {
  accessToken: string | null;
  subject: AuthSubject | null;
};

type AuthSessionListener = (snapshot: AuthSessionSnapshot) => void;

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
    return globalThis.atob(`${normalized}${padding}`);
  } catch {
    return null;
  }
}

/** JWT payload is read only to partition local state; IAM remains authoritative. */
export function subjectFromAccessToken(token: string): AuthSubject | null {
  const payload = token.split('.')[1];
  if (!payload) {
    return null;
  }
  const decoded = decodeBase64Url(payload);
  if (!decoded) {
    return null;
  }
  try {
    const value = JSON.parse(decoded) as { user_id?: unknown; email?: unknown };
    if (typeof value.user_id !== 'string' || !value.user_id) {
      return null;
    }
    return {
      id: value.user_id,
      email: typeof value.email === 'string' ? value.email : null,
    };
  } catch {
    return null;
  }
}

/**
 * The refresh credential never leaves SecureStore. Access credentials are held
 * only in this live JS object and disappear when the app process is restarted.
 */
export class AuthSessionManager {
  private accessToken: string | null = null;
  private subject: AuthSubject | null = null;
  private refreshInFlight: Promise<string | null> | null = null;
  private readonly listeners = new Set<AuthSessionListener>();
  private readonly iam: IamApi;
  private readonly credentialStore: RefreshCredentialStore;

  constructor(
    iam: IamApi = createServiceClients().iam,
    credentialStore: RefreshCredentialStore = SecureStore,
  ) {
    this.iam = iam;
    this.credentialStore = credentialStore;
  }

  snapshot(): AuthSessionSnapshot {
    return { accessToken: this.accessToken, subject: this.subject };
  }

  getAccessToken = (): string | null => this.accessToken;

  /** Lets UI state react when a background refresh clears a revoked session. */
  subscribe(listener: AuthSessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  async accept(tokens: AuthTokenPair): Promise<AuthSessionSnapshot> {
    const subject = subjectFromAccessToken(tokens.access_token);
    if (!subject) {
      throw new Error('IAM returned an access token without a usable subject.');
    }
    // Store the refresh token first so an app kill immediately after login does
    // not leave an in-memory-only authenticated state.
    await this.credentialStore.setItemAsync(
      refreshTokenKey,
      tokens.refresh_token,
    );
    this.accessToken = tokens.access_token;
    this.subject = subject;
    this.notify();
    return this.snapshot();
  }

  async restore(): Promise<AuthSessionSnapshot> {
    if (this.accessToken) {
      return this.snapshot();
    }
    await this.refresh();
    return this.snapshot();
  }

  /** Concurrent 401s share one rotation; IAM revokes the old refresh token. */
  refresh(): Promise<string | null> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }
    this.refreshInFlight = this.rotateRefreshToken().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async rotateRefreshToken(): Promise<string | null> {
    const refreshToken =
      await this.credentialStore.getItemAsync(refreshTokenKey);
    if (!refreshToken) {
      return null;
    }
    try {
      const tokens = await this.iam.refresh(refreshToken);
      await this.accept(tokens);
      return this.accessToken;
    } catch (error) {
      // A failed/expired rotation must not retain a potentially unusable token.
      // The safe diagnostic boundary has no response body, headers, or token.
      if (!(error instanceof HttpError) || error.context.status !== 401) {
        captureException('auth_refresh_failed', error);
      }
      await this.clearLocalCredentials();
      return null;
    }
  }

  async logout(remoteIam: IamApi = this.iam): Promise<void> {
    const refreshToken =
      await this.credentialStore.getItemAsync(refreshTokenKey);
    try {
      if (refreshToken && this.accessToken) {
        await remoteIam.logout(refreshToken);
      }
    } catch (error) {
      // Local revocation always wins; a later server-side retry needs an
      // account event contract and is deliberately not invented here.
      captureException('auth_logout_remote_failed', error);
    } finally {
      await this.clearLocalCredentials();
    }
  }

  async clearLocalCredentials(): Promise<void> {
    this.accessToken = null;
    this.subject = null;
    await this.credentialStore.deleteItemAsync(refreshTokenKey);
    this.notify();
  }
}
