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
import { captureException } from '@/core/diagnostics/diagnostics';
import { getInstallationId } from '@/core/identity/installation-id';
import { useAuth } from '@/features/auth/auth-provider';

import {
  enqueueInteraction,
  type QueuedInteraction,
} from './outbox-repository';
import { flushOutbox } from './outbox-service';

type OutboxController = {
  enqueue(interaction: QueuedInteraction): Promise<void>;
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
      await flushOutbox(db, clients.cms, identityScope, installationId);
    } catch (error) {
      captureException('outbox_flush_failed', error);
    }
  }, [clients.cms, db, subject]);

  const enqueue = useCallback(
    async (interaction: QueuedInteraction) => {
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
