import { useEffect, useRef } from 'react';

/** A native error may remain in successive status snapshots during replacement. */
export function useAudioErrorRecovery(
  error: string | null | undefined,
  recover: () => void,
) {
  const handled = useRef(false);
  useEffect(() => {
    if (!error) {
      handled.current = false;
    } else if (!handled.current) {
      handled.current = true;
      recover();
    }
  }, [error, recover]);
}
