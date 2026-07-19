import { useQuery } from '@tanstack/react-query';
import { useSQLiteContext } from 'expo-sqlite';

import { createServiceClients } from '@/core/api';
import { getInstallationId } from '@/core/identity/installation-id';

import {
  loadFreshForYouSession,
  materializeForYouSession,
  type FrozenForYouSession,
} from './for-you-session-repository';

const { cms } = createServiceClients();

export function useForYouSession() {
  const db = useSQLiteContext();
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

      const page = await cms.getForYouPage({
        installationId,
        limit: 10,
        signal,
      });
      return materializeForYouSession(db, identityScope, page);
    },
  });

  return { identityQuery, sessionQuery };
}
