import { AppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';

import type { InteractionType } from '@/core/api';
import {
  captureDiagnostic,
  captureException,
} from '@/core/diagnostics/diagnostics';
import { getInstallationId } from '@/core/identity/installation-id';
import { queryClient } from '@/core/query/query-client';
import { recordContentTombstone } from '@/core/database/tombstones';
import { useAuth } from '@/features/auth/auth-provider';

import {
  enqueueInteraction,
  readOutboxHealth,
  type QueuedOutboxEvent,
} from './outbox-repository';
import { flushOutbox } from './outbox-service';

type OutboxController = {
  enqueue(interaction: QueuedOutboxEvent): Promise<void>;
  flush(): Promise<void>;
};

const OutboxContext = createContext<OutboxController | null>(null);
export function OutboxProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { clients, subject } = useAuth();
  const flush = useCallback(async () => {
    const installationId = await getInstallationId();
    const identityScope = subject
      ? `user:${subject.id}`
      : `anonymous:${installationId}`;
    try {
      const delivered = await flushOutbox(
        db,
        clients.cms,
        identityScope,
        installationId,
        {
          onContentTombstone: async (contentId) => {
            await recordContentTombstone(db, contentId);
            await queryClient.invalidateQueries({
              queryKey: ['foryou-session'],
            });
          },
        },
      );
      const health = await readOutboxHealth(db, identityScope);
      captureDiagnostic('outbox_health', { delivered, ...health });
    } catch (error) {
      captureException('outbox_flush_failed', error);
    }
  }, [clients.cms, db, subject]);

  const enqueue = useCallback(
    async (interaction: QueuedOutboxEvent) => {
      const installationId = await getInstallationId();
      const identityScope = subject
        ? `user:${subject.id}`
        : `anonymous:${installationId}`;
      await enqueueInteraction(db, identityScope, interaction);
      await flush();
    },
    [db, flush, subject],
  );

  useEffect(() => {
    void flush();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void flush();
      }
    });
    return () => subscription.remove();
  }, [flush]);

  const controller = useMemo<OutboxController>(
    () => ({ enqueue, flush }),
    [enqueue, flush],
  );
  return (
    <OutboxContext.Provider value={controller}>
      {children}
    </OutboxContext.Provider>
  );
}

export function useOutbox(): OutboxController {
  const controller = useContext(OutboxContext);
  if (!controller) {
    throw new Error('useOutbox must be used inside OutboxProvider.');
  }
  return controller;
}

export type { InteractionType };
