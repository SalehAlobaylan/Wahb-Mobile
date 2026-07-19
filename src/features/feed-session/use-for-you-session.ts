import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { createServiceClients } from '@/core/api';
import { captureException } from '@/core/diagnostics/diagnostics';
import { getInstallationId } from '@/core/identity/installation-id';

import {
  loadFreshForYouSession,
  appendForYouSessionPage,
  materializeForYouSession,
  type FrozenForYouSession,
} from './for-you-session-repository';
import {
  consumePaginationToken,
  createPaginationBudget,
} from './pagination-policy';

const { cms } = createServiceClients();

export function useForYouSession() {
  const db = useSQLiteContext();
  const queryClient = useQueryClient();
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
  const sessionQuery = useQuery<FrozenForYouSession>({
    queryKey: ['foryou-session', installationId],
    enabled: Boolean(installationId),
    queryFn: async ({ signal }) => {
      if (!installationId) {
        throw new Error('Installation identity is unavailable.');
      }

      const identityScope = `anonymous:${installationId}`;
      const restored = await loadFreshForYouSession(db, identityScope);
      if (restored) {
        return restored;
      }

      const page = await cms.createForYouSession({
        installationId,
        limit: 10,
        signal,
      });
      return materializeForYouSession(
        db,
        identityScope,
        page,
        page.serverSessionId,
        page.expiresAt,
      );
    },
  });

  const fetchNextPage = useCallback(async (): Promise<boolean> => {
    if (!installationId) {
      return false;
    }
    const current = sessionQuery.data;
    if (!current?.cursor || !current.serverSessionId) {
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
      const page = await cms.getForYouSessionPage({
        installationId,
        sessionId: current.serverSessionId,
        cursor: current.cursor,
        limit: 10,
      });
      const updated = await appendForYouSessionPage(db, current.id, page);
      if (updated) {
        queryClient.setQueryData(['foryou-session', installationId], updated);
        return true;
      }
      return false;
    } catch (error) {
      captureException('foryou_session_page_failed', error);
      return false;
    } finally {
      paginationInFlight.current = false;
    }
  }, [db, installationId, queryClient, sessionQuery.data]);

  const refreshSession = useCallback(async () => {
    if (!installationId) {
      return;
    }
    // Materialization expires the prior session only after this request has
    // succeeded, so a failed refresh leaves the current frozen session intact.
    const page = await cms.createForYouSession({ installationId, limit: 10 });
    const updated = await materializeForYouSession(
      db,
      `anonymous:${installationId}`,
      page,
      page.serverSessionId,
      page.expiresAt,
    );
    queryClient.setQueryData(['foryou-session', installationId], updated);
  }, [db, installationId, queryClient]);

  return { identityQuery, sessionQuery, fetchNextPage, refreshSession };
}
