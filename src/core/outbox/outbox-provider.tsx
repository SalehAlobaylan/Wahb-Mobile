import { Alert, AppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import type { InteractionType } from '@/core/api';
import {
  captureDiagnostic,
  captureException,
  elapsedMilliseconds,
} from '@/core/diagnostics/diagnostics';
import { getInstallationId } from '@/core/identity/installation-id';
import { queryClient } from '@/core/query/query-client';
import { recordContentTombstone } from '@/core/database/tombstones';
import { useConnectivity } from '@/core/network/connectivity-provider';
import { useAuth } from '@/features/auth/auth-provider';
import i18n from '@/core/i18n';

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
  const { reconnectSequence } = useConnectivity();
  const flushInFlight = useRef(new Map<string, Promise<void>>());
  const flush = useCallback(async () => {
    const installationId = await getInstallationId();
    const identityScope = subject
      ? `user:${subject.id}`
      : `anonymous:${installationId}`;
    const existing = flushInFlight.current.get(identityScope);
    if (existing) return existing;
    const delivery = (async () => {
      const flushStartedAt = performance.now();
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
            onPermanentRejection: async (event, status) => {
              // Never include a content title, URL, account, or server error in this
              // notification. The action was optimistic, so make the reconciliation
              // visible and re-read affected data from its server owner.
              await queryClient.invalidateQueries({
                queryKey: ['foryou-session'],
              });
              await queryClient.invalidateQueries({
                queryKey: ['saved-content'],
              });
              captureDiagnostic('outbox_rejected', {
                event_type: event.type,
                status_code: status ?? 0,
              });
              Alert.alert(
                i18n.t('outbox.rejectedTitle'),
                i18n.t('outbox.rejectedCopy'),
              );
            },
          },
        );
        const health = await readOutboxHealth(db, identityScope);
        captureDiagnostic('outbox_health', {
          delivered,
          duration_ms: elapsedMilliseconds(flushStartedAt),
          ...health,
        });
      } catch (error) {
        captureException('outbox_flush_failed', error);
      } finally {
        flushInFlight.current.delete(identityScope);
      }
    })();
    flushInFlight.current.set(identityScope, delivery);
    return delivery;
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

  // The connectivity boundary emits one increment only for a real
  // offline-to-online edge. It does not create or replace a feed session.
  useEffect(() => {
    if (reconnectSequence > 0) {
      void flush();
    }
  }, [flush, reconnectSequence]);

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
