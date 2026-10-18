import { useCallback, useRef, useState } from 'react';

/** Keep the playing item and pager intact until the replacement is committed. */
export function usePodsRefresh({
  replace,
  committed,
  failed,
}: {
  replace: () => Promise<boolean>;
  committed: () => void;
  failed: (error: unknown) => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      if (await replace()) committed();
    } catch (error) {
      failed(error);
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, [replace, committed, failed]);
  return { refreshing, refresh };
}
