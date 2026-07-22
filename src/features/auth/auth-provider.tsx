import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  createServiceClients,
  type AuthTokenPair,
  type RegisteredAccount,
  type RegisterInput,
  type ServiceClients,
} from '@/core/api';
import { resetInstallationId } from '@/core/identity/installation-id';
import { queryClient } from '@/core/query/query-client';
import { setDiagnosticActor } from '@/core/diagnostics/sentry';

import { createAuthenticatedServiceClients } from './authenticated-service-clients';
import { AuthSessionManager, type AuthSessionSnapshot } from './auth-session';

type AuthController = AuthSessionSnapshot & {
  isBootstrapping: boolean;
  /** These attach the in-memory access token and recover one expired request. */
  clients: ServiceClients;
  register(input: RegisterInput): Promise<RegisteredAccount>;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  resendVerification(email: string): Promise<void>;
  verifyEmail(token: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  requestAccountDeletion(password: string): Promise<void>;
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
  const previousSubjectRef = useRef<string | null>(
    snapshot.subject?.id ?? null,
  );

  const sync = useCallback(() => setSnapshot(sessionManager.snapshot()), []);
  useEffect(() => {
    void sessionManager.restore().finally(() => {
      sync();
      setIsBootstrapping(false);
    });
  }, [sync]);

  useEffect(
    () =>
      sessionManager.subscribe((nextSnapshot) => {
        const previousUserId = previousSubjectRef.current;
        previousSubjectRef.current = nextSnapshot.subject?.id ?? null;
        if (previousUserId && previousUserId !== nextSnapshot.subject?.id) {
          queryClient.removeQueries({
            predicate: (query) =>
              isUserPartition(query.queryKey, previousUserId),
          });
        }
        setSnapshot(nextSnapshot);
      }),
    [],
  );

  useEffect(() => {
    void setDiagnosticActor(snapshot.subject?.id ?? null);
  }, [snapshot.subject?.id]);

  const accept = useCallback(
    async (tokens: AuthTokenPair) => {
      await sessionManager.accept(tokens);
      sync();
    },
    [sync],
  );

  const register = useCallback(async (input: RegisterInput) => {
    return publicClients.iam.register(input);
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
  const requestAccountDeletion = useCallback(async (password: string) => {
    await authenticatedClients.iam.requestAccountDeletion(password);
  }, []);

  const controller = useMemo<AuthController>(
    () => ({
      ...snapshot,
      isBootstrapping,
      clients: authenticatedClients,
      register,
      login,
      logout,
      resendVerification: publicClients.iam.resendVerification,
      verifyEmail: publicClients.iam.verifyEmail,
      requestPasswordReset: publicClients.iam.requestPasswordReset,
      resetPassword: publicClients.iam.resetPassword,
      requestAccountDeletion,
      resetLocalData,
    }),
    [
      isBootstrapping,
      login,
      logout,
      register,
      requestAccountDeletion,
      resetLocalData,
      snapshot,
    ],
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
