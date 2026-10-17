import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { useAuth } from '@/features/auth/auth-provider';
import { getInstallationId } from '@/core/identity/installation-id';
import { enqueueInteraction } from '@/core/outbox/outbox-repository';
import { useOutbox } from '@/core/outbox/outbox-provider';
import { captureException } from '@/core/diagnostics/diagnostics';
import { ConsumptionTracker } from './consumption-tracker';

type Observation = {
  itemId: string | null;
  position: number;
  duration: number;
  playing: boolean;
  ended: boolean;
  rate: number;
};
type Active = {
  itemId: string;
  identity: string;
  segment: string;
  tracker: ConsumptionTracker;
  duration: number;
  ended: boolean;
};

export function usePlaybackConsumption(observation: Observation) {
  const db = useSQLiteContext();
  const { subject } = useAuth();
  const outbox = useOutbox();
  const [installation, setInstallation] = useState<string | null>(null);
  const active = useRef<Active | null>(null);
  const identity = subject
    ? `user:${subject.id}`
    : installation
      ? `anonymous:${installation}`
      : null;
  const identityRef = useRef(identity);
  const dependencies = useRef({ db, outbox });
  useLayoutEffect(() => {
    identityRef.current = identity;
    dependencies.current = { db, outbox };
  }, [identity, db, outbox]);
  useEffect(() => {
    let live = true;
    void getInstallationId().then((id) => {
      if (live) setInstallation(id);
    });
    return () => {
      live = false;
    };
  }, []);

  const owner = useMemo(() => {
    const flush = (terminal = true) => {
      const current = active.current;
      if (!current || current.identity !== identityRef.current) return;
      const event = current.tracker.event(
        current.duration,
        terminal,
        current.ended,
      );
      if (!event) return;
      const { db, outbox } = dependencies.current;
      // Freeze identity and evidence before asynchronous SQLite/network work.
      void enqueueInteraction(db, current.identity, {
        contentId: current.itemId,
        type: event.type,
        metadata: {
          surface: 'pods',
          consumption_contract_version: 1,
          ...(event.type !== 'progress' ? { consumption_classification: event.type === 'complete' ? 'completed' : event.type } : {}),
          position_seconds: Math.floor(current.tracker.state.lastObservedPositionSeconds),
          actual_played_seconds: event.played,
          furthest_position_seconds: event.furthest,
          economics_version: 1,
          economics_client: 'mobile',
          economics_segment_id: current.segment,
          economics_observed_at: new Date().toISOString(),
          economics_observation: 'media_position_seconds_v1',
        },
      })
        .then(() => outbox.flush())
        .catch((error) =>
          captureException('pods_consumption_queue_failed', error),
        );
    };
    return {
      flush,
      seek: (position: number) => {
        active.current?.tracker.seek(position);
      },
      handoff: (itemId: string, position: number) => {
        const current = active.current;
        if (current?.itemId !== itemId || current?.ended) {
          flush();
          active.current = null;
        } else current.tracker.seek(position);
      },
    };
  }, []);

  const { itemId, position, duration, playing, ended, rate } = observation;
  useEffect(() => {
    const o = { itemId, position, duration, playing, ended, rate };
    if (!identity || !o.itemId) {
      owner.flush();
      active.current = null;
      return;
    }
    if (
      active.current?.identity !== identity ||
      active.current.itemId !== o.itemId ||
      (active.current.ended &&
        !o.ended &&
        o.position < active.current.tracker.state.lastObservedPositionSeconds)
    ) {
      owner.flush();
      active.current = {
        itemId: o.itemId,
        identity,
        segment: Crypto.randomUUID(),
        tracker: new ConsumptionTracker(o.position),
        duration: o.duration,
        ended: false,
      };
    }
    const current = active.current;
    current.duration = o.duration;
    current.ended = o.ended;
    current.tracker.observe(o.position, o.playing, Date.now(), o.rate);
    owner.flush(!o.playing || o.ended);
  }, [identity, itemId, position, playing, duration, ended, rate, owner]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') owner.flush();
    });
    return () => {
      subscription.remove();
      owner.flush();
    };
  }, [owner]);
  return owner;
}
