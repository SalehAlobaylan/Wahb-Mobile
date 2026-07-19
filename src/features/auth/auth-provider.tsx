import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  createServiceClients,
  type AuthTokenPair,
  type RegisterInput,
} from '@/core/api';
import { resetInstallationId } from '@/core/identity/installation-id';
import { queryClient } from '@/core/query/query-client';

import { createAuthenticatedServiceClients } from './authenticated-service-clients';
import { AuthSessionManager, type AuthSessionSnapshot } from './auth-session';

type AuthController = AuthSessionSnapshot & {
  isBootstrapping: boolean;
  register(input: RegisterInput): Promise<void>;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  resendVerification(email: string): Promise<void>;
  verifyEmail(token: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  resetLocalData(): Promise<void>;
};

const AuthContext = createContext<AuthController | null>(null);
const publicClients = createServiceClients();
const sessionManager = new AuthSessionManager(publicClients.iam);
const authenticatedClients = createAuthenticatedServiceClients(sessionManager);

function isUserPartition(key: readonly unknown[], userId: string): boolean {
  return key.some((part) => part === userId || part === `user:${userId}`);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<AuthSessionSnapshot>(
    sessionManager.snapshot(),
  );
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const sync = useCallback(() => setSnapshot(sessionManager.snapshot()), []);
  useEffect(() => {
    void sessionManager.restore().finally(() => {
      sync();
      setIsBootstrapping(false);
    });
  }, [sync]);

  const accept = useCallback(
    async (tokens: AuthTokenPair) => {
      await sessionManager.accept(tokens);
      sync();
    },
    [sync],
  );

  const register = useCallback(async (input: RegisterInput) => {
    await publicClients.iam.register(input);
  }, []);
  const login = useCallback(
    async (email: string, password: string) => {
      await accept(await publicClients.iam.login({ email, password }));
    },
    [accept],
  );
  const logout = useCallback(async () => {
    const previousUserId = sessionManager.snapshot().subject?.id;
    await sessionManager.logout(authenticatedClients.iam);
    if (previousUserId) {
      queryClient.removeQueries({
        predicate: (query) => isUserPartition(query.queryKey, previousUserId),
      });
    }
    sync();
  }, [sync]);
  const resetLocalData = useCallback(async () => {
    await sessionManager.clearLocalCredentials();
    await resetInstallationId();
    queryClient.clear();
    sync();
  }, [sync]);

  const controller = useMemo<AuthController>(
    () => ({
      ...snapshot,
      isBootstrapping,
      register,
      login,
      logout,
      resendVerification: publicClients.iam.resendVerification,
      verifyEmail: publicClients.iam.verifyEmail,
      requestPasswordReset: publicClients.iam.requestPasswordReset,
      resetPassword: publicClients.iam.resetPassword,
      resetLocalData,
    }),
    [isBootstrapping, login, logout, register, resetLocalData, snapshot],
  );

  return (
    <AuthContext.Provider value={controller}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthController {
  const controller = useContext(AuthContext);
  if (!controller) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return controller;
}
