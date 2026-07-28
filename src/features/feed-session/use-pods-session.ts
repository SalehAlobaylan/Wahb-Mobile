import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import {
  captureDiagnostic,
  captureException,
} from '@/core/diagnostics/diagnostics';
import { getInstallationId } from '@/core/identity/installation-id';
import { useAuth } from '@/features/auth/auth-provider';
import { readLanguagePreferences } from '@/features/settings/language-preferences';

import {
  loadFreshPodsSession,
  appendPodsSessionPage,
  hidePodsItem,
  loadRecoverablePodsSession,
  materializePodsSession,
  type FrozenPodsSession,
} from './pods-session-repository';
import {
  consumePaginationToken,
  createPaginationBudget,
} from './pagination-policy';

export type PodsDurationPreference = 5 | 10 | 15 | 20 | 30 | 40;

export function podsSessionScope(
  identityScope: string | undefined,
  contentLanguage: string,
  duration?: PodsDurationPreference,
): string | undefined {
  return identityScope
    ? `${identityScope}:content-language:${contentLanguage}:duration:${duration ?? 'all'}`
    : undefined;
}

export function usePodsSession(duration?: PodsDurationPreference) {
  const db = useSQLiteContext();
  const queryClient = useQueryClient();
  const { clients, subject } = useAuth();
  // A zero epoch is equivalent to a fully replenished bucket on first use and
  // avoids reading the clock during render.
  const paginationBudget = useRef(createPaginationBudget(0));
  const paginationInFlight = useRef(false);
  const identityQuery = useQuery({
    queryKey: ['installation-identity'],
    queryFn: getInstallationId,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const installationId = identityQuery.data;
  const identityScope = installationId
    ? subject
      ? `user:${subject.id}`
      : `anonymous:${installationId}`
    : undefined;
  const languageQuery = useQuery({
    queryKey: ['content-language-preference'],
    queryFn: readLanguagePreferences,
    staleTime: Infinity,
  });
  const contentLanguage = languageQuery.data?.contentLanguage ?? 'both';
  // A delivery preference changes server inventory. It therefore partitions
  // only the local frozen-session ledger, never the account/outbox identity.
  const sessionScope = podsSessionScope(
    identityScope,
    contentLanguage,
    duration,
  );
  const sessionQuery = useQuery<FrozenPodsSession>({
    queryKey: ['pods-session', sessionScope],
    enabled: Boolean(
      installationId && sessionScope && !languageQuery.isPending,
    ),
    queryFn: async ({ signal }) => {
      if (!installationId || !sessionScope) {
        throw new Error('Installation identity is unavailable.');
      }

      const restored = await loadFreshPodsSession(db, sessionScope);
      if (restored) {
        captureDiagnostic('pods_session_health', {
          event_type: 'fresh_restore',
        });
        return restored;
      }

      try {
        const page = await clients.cms.createPodsSession({
          installationId,
          limit: 10,
          contentLanguage,
          duration,
          signal,
        });
        return materializePodsSession(
          db,
          sessionScope,
          page,
          page.serverSessionId,
          page.expiresAt,
        );
      } catch (error) {
        const recovery = await loadRecoverablePodsSession(db, sessionScope);
        if (recovery) {
          const createdAtMs = new Date(recovery.createdAt).getTime();
          captureException('pods_session_offline_restore', error, {
            ...(Number.isFinite(createdAtMs)
              ? { snapshot_age_ms: Math.max(0, Date.now() - createdAtMs) }
              : {}),
          });
          return recovery;
        }
        throw error;
      }
    },
  });

  const fetchNextPage = useCallback(async (): Promise<boolean> => {
    if (!installationId || !sessionScope) {
      return false;
    }
    const current = sessionQuery.data;
    if (
      current?.isOfflineSnapshot ||
      !current?.cursor ||
      !current.serverSessionId
    ) {
      return false;
    }
    if (paginationInFlight.current) {
      return false;
    }
    const budget = consumePaginationToken(paginationBudget.current, Date.now());
    paginationBudget.current = budget.budget;
    if (!budget.allowed) {
      return false;
    }
    paginationInFlight.current = true;
    try {
      const page = await clients.cms.getPodsSessionPage({
        installationId,
        sessionId: current.serverSessionId,
        cursor: current.cursor,
        limit: 10,
      });
      const updated = await appendPodsSessionPage(
        db,
        current.id,
        sessionScope,
        page,
      );
      if (updated) {
        queryClient.setQueryData(['pods-session', sessionScope], updated);
        return true;
      }
      return false;
    } catch (error) {
      captureException('pods_session_page_failed', error);
      return false;
    } finally {
      paginationInFlight.current = false;
    }
  }, [
    clients.cms,
    db,
    sessionScope,
    installationId,
    queryClient,
    sessionQuery.data,
  ]);

  const refreshSession = useCallback(async () => {
    if (!installationId || !sessionScope) {
      return;
    }
    // Materialization expires the prior session only after this request has
    // succeeded, so a failed refresh leaves the current frozen session intact.
    const page = await clients.cms.createPodsSession({
      installationId,
      limit: 10,
      contentLanguage,
      duration,
    });
    const updated = await materializePodsSession(
      db,
      sessionScope,
      page,
      page.serverSessionId,
      page.expiresAt,
    );
    queryClient.setQueryData(['pods-session', sessionScope], updated);
  }, [
    clients.cms,
    contentLanguage,
    duration,
    db,
    installationId,
    queryClient,
    sessionScope,
  ]);

  const checkForFreshness = useCallback(async (): Promise<boolean> => {
    const current = sessionQuery.data;
    if (
      !installationId ||
      current?.isOfflineSnapshot ||
      !current?.serverSessionId
    ) {
      return false;
    }
    const response = await clients.cms.getPodsSessionFreshness({
      installationId,
      sessionId: current.serverSessionId,
      duration,
    });
    return response.hasNewContent;
  }, [clients.cms, duration, installationId, sessionQuery.data]);

  const hideItem = useCallback(
    async (contentId: string): Promise<FrozenPodsSession | null> => {
      if (!installationId || !sessionScope || !sessionQuery.data) {
        return null;
      }
      const updated = await hidePodsItem(
        db,
        sessionQuery.data.id,
        sessionScope,
        contentId,
      );
      queryClient.setQueryData(['pods-session', sessionScope], updated);
      return updated;
    },
    [db, installationId, queryClient, sessionQuery.data, sessionScope],
  );

  return {
    identityQuery,
    sessionQuery,
    fetchNextPage,
    hideItem,
    refreshSession,
    checkForFreshness,
  };
}
