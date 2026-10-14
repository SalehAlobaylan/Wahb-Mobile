import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  useLayoutEffect,
} from 'react';
import { beginFeedLoad, beginPagination } from './journeys';
import { isForeground } from './lifecycle';
import type { RuxSurface } from './types';

const boundaries = new Map<RuxSurface, boolean>();
const pages = new Map<
  RuxSurface,
  { journey: ReturnType<typeof beginPagination>; known: Set<string> }
>();
export function startExperiencePagination(surface: RuxSurface, ids: string[]) {
  pages.get(surface)?.journey.cancel();
  const journey = beginPagination(surface);
  pages.set(surface, { journey, known: new Set(ids) });
  if (boundaries.get(surface)) journey.starved();
  return {
    failed: () => {
      journey.failed();
      if (pages.get(surface)?.journey === journey) pages.delete(surface);
    },
    cancel: () => {
      journey.cancel();
      if (pages.get(surface)?.journey === journey) pages.delete(surface);
    },
    end: () => {
      journey.end();
      if (pages.get(surface)?.journey === journey) pages.delete(surface);
    },
  };
}
export function experienceBoundaryReached(surface: RuxSurface, reached = true) {
  boundaries.set(surface, reached);
  if (reached && isForeground()) pages.get(surface)?.journey.starved();
}
export function commitExperienceUnits(surface: RuxSurface, ids: string[]) {
  const page = pages.get(surface);
  if (page && ids.some((id) => !page.known.has(id))) {
    page.journey.received();
    pages.delete(surface);
  }
}
export function useFeedExperience(input: {
  surface: RuxSurface;
  key: string;
  active: boolean;
  error: boolean;
  empty: boolean;
  offline?: boolean;
  unitIds?: readonly string[];
}) {
  const [revision, setRevision] = useState(0);
  const awaitingRequest = useRef(false);
  const journey = useRef<ReturnType<typeof beginFeedLoad> | null>(null);
  const owner = useRef<object | null>(null);
  const committed = useRef<string | null>(null);
  const active = useRef(input.active);
  const eligibility = useRef({
    error: input.error,
    offline: input.offline,
    key: input.key,
    unitIds: input.unitIds,
  });
  useLayoutEffect(() => {
    if (eligibility.current.key !== input.key) committed.current = null;
    eligibility.current = {
      error: input.error,
      offline: input.offline,
      key: input.key,
      unitIds: input.unitIds,
    };
  }, [input.error, input.offline, input.key, input.unitIds]);
  useLayoutEffect(() => {
    active.current = input.active;
  }, [input.active]);
  useEffect(() => {
    if (!input.active) {
      journey.current?.cancel();
      return;
    }
    const current = {};
    owner.current = current;
    pages.get(input.surface)?.journey.cancel();
    pages.delete(input.surface);
    boundaries.delete(input.surface);
    journey.current?.cancel();
    awaitingRequest.current = false;
    journey.current = beginFeedLoad(input.surface);
    if (
      committed.current &&
      !eligibility.current.offline &&
      !eligibility.current.error &&
      (!eligibility.current.unitIds ||
        eligibility.current.unitIds.includes(committed.current))
    )
      journey.current.rendered(committed.current);
    return () =>
      queueMicrotask(() => {
        if (owner.current === current) {
          journey.current?.cancel();
          pages.get(input.surface)?.journey.cancel();
          pages.delete(input.surface);
          boundaries.delete(input.surface);
          journey.current = null;
          awaitingRequest.current = false;
        }
      });
  }, [input.active, input.key, input.surface]);
  useEffect(() => {
    if (awaitingRequest.current || !input.active) return;
    if (input.offline) journey.current?.cancel();
    else if (input.error) journey.current?.failed('network');
    else if (input.empty) journey.current?.empty();
    else if (
      committed.current &&
      (!input.unitIds || input.unitIds.includes(committed.current)) &&
      isForeground()
    )
      journey.current?.rendered(committed.current);
  }, [
    input.active,
    input.error,
    input.empty,
    input.offline,
    input.unitIds,
    revision,
  ]);
  const rendered = useCallback((id: string) => {
    committed.current = id;
    if (
      active.current &&
      !awaitingRequest.current &&
      isForeground() &&
      !eligibility.current.offline &&
      !eligibility.current.error
    )
      journey.current?.rendered(id);
  }, []);
  const requested = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T> => {
      journey.current?.cancel();
      const current = beginFeedLoad(input.surface);
      journey.current = current;
      awaitingRequest.current = true;
      if (eligibility.current.offline) current.cancel();
      try {
        return await operation();
      } catch (error) {
        current.failed('network');
        throw error;
      } finally {
        if (journey.current === current) {
          awaitingRequest.current = false;
          setRevision((value) => value + 1);
        }
      }
    },
    [input.surface],
  );
  return useMemo(() => ({ rendered, requested }), [rendered, requested]);
}
