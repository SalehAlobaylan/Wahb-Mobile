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
  loadFreshForYouSession,
  appendForYouSessionPage,
  hideForYouItem,
  loadRecoverableForYouSession,
  materializeForYouSession,
  type FrozenForYouSession,
} from './for-you-session-repository';
import {
  consumePaginationToken,
  createPaginationBudget,
} from './pagination-policy';

export function useForYouSession() {
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
  const sessionScope = identityScope
    ? `${identityScope}:content-language:${contentLanguage}`
    : undefined;
  const sessionQuery = useQuery<FrozenForYouSession>({
    queryKey: ['foryou-session', sessionScope],
    enabled: Boolean(
      installationId && sessionScope && !languageQuery.isPending,
    ),
    queryFn: async ({ signal }) => {
      if (!installationId || !sessionScope) {
        throw new Error('Installation identity is unavailable.');
      }

      const restored = await loadFreshForYouSession(db, sessionScope);
      if (restored) {
        captureDiagnostic('foryou_session_health', {
          event_type: 'fresh_restore',
        });
        return restored;
      }

      try {
        const page = await clients.cms.createForYouSession({
          installationId,
          limit: 10,
          contentLanguage,
          signal,
        });
        return materializeForYouSession(
          db,
          sessionScope,
          page,
          page.serverSessionId,
          page.expiresAt,
        );
      } catch (error) {
        const recovery = await loadRecoverableForYouSession(db, sessionScope);
        if (recovery) {
          const createdAtMs = new Date(recovery.createdAt).getTime();
          captureException('foryou_session_offline_restore', error, {
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
      const page = await clients.cms.getForYouSessionPage({
        installationId,
        sessionId: current.serverSessionId,
        cursor: current.cursor,
        limit: 10,
      });
      const updated = await appendForYouSessionPage(
        db,
        current.id,
        sessionScope,
        page,
      );
      if (updated) {
        queryClient.setQueryData(['foryou-session', sessionScope], updated);
        return true;
      }
      return false;
    } catch (error) {
      captureException('foryou_session_page_failed', error);
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
    const page = await clients.cms.createForYouSession({
      installationId,
      limit: 10,
      contentLanguage,
    });
    const updated = await materializeForYouSession(
      db,
      sessionScope,
      page,
      page.serverSessionId,
      page.expiresAt,
    );
    queryClient.setQueryData(['foryou-session', sessionScope], updated);
  }, [
    clients.cms,
    contentLanguage,
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
    const response = await clients.cms.getForYouSessionFreshness({
      installationId,
      sessionId: current.serverSessionId,
    });
    return response.hasNewContent;
  }, [clients.cms, installationId, sessionQuery.data]);

  const hideItem = useCallback(
    async (contentId: string): Promise<FrozenForYouSession | null> => {
      if (!installationId || !sessionScope || !sessionQuery.data) {
        return null;
      }
      const updated = await hideForYouItem(
        db,
        sessionQuery.data.id,
        sessionScope,
        contentId,
      );
      queryClient.setQueryData(['foryou-session', sessionScope], updated);
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
