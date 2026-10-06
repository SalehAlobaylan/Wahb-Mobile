import Storage from 'expo-sqlite/kv-store';
import { useCallback, useEffect, useRef, useState } from 'react';

export type AudioDisplayMode = 'listen' | 'transcript';
const key = 'pods-audio-display-mode-v1';

export function useAudioDisplayMode() {
  const [mode, setMode] = useState<AudioDisplayMode>('transcript');
  const changed = useRef(false);
  useEffect(() => {
    let mounted = true;
    void Storage.getItem(key)
      .then((value) => {
        if (
          mounted &&
          !changed.current &&
          (value === 'listen' || value === 'transcript')
        )
          setMode(value);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);
  const select = useCallback((value: AudioDisplayMode) => {
    changed.current = true;
    setMode(value);
    void Storage.setItem(key, value).catch(() => undefined);
  }, []);
  return [mode, select] as const;
}
