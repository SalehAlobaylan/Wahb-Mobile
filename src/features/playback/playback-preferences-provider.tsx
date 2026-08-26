import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Storage from 'expo-sqlite/kv-store';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';

import {
  playbackPreferencesSchema,
  type PlaybackPreferences,
} from '@/core/api';
import { useConnectivity } from '@/core/network/connectivity-provider';
import { useAuth } from '@/features/auth/auth-provider';

const defaults: PlaybackPreferences = {
  audio_quality: 'standard',
  streaming_quality: 'auto',
  allow_cellular_high_quality: false,
  prefer_audio_when_available: true,
};
const anonymousKey = 'playback-preferences-v2:anonymous';
const keyFor = (userId?: string) =>
  userId ? `playback-preferences-v2:user:${userId}` : anonymousKey;

type PreferenceField = keyof PlaybackPreferences;
type PersistedPreferences = {
  version: 2;
  values: PlaybackPreferences;
  dirtyFields: PreferenceField[];
};

type PlaybackPreferencesController = {
  preferences: PlaybackPreferences;
  isLoading: boolean;
  update(input: Partial<PlaybackPreferences>): Promise<PlaybackPreferences>;
};
const Context = createContext<PlaybackPreferencesController | null>(null);

function normalize(value: unknown): PlaybackPreferences {
  const parsed = playbackPreferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : defaults;
}

async function readLocal(key: string): Promise<PersistedPreferences> {
  const raw = await Storage.getItem(key);
  if (!raw) return { version: 2, values: defaults, dirtyFields: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedPreferences>;
    return {
      version: 2,
      values: normalize(parsed.values),
      dirtyFields: Array.isArray(parsed.dirtyFields)
        ? parsed.dirtyFields.filter(
            (field): field is PreferenceField => field in defaults,
          )
        : [],
    };
  } catch {
    return { version: 2, values: defaults, dirtyFields: [] };
  }
}

async function writeLocal(key: string, value: PersistedPreferences) {
  await Storage.setItem(key, JSON.stringify(value));
}

export function PlaybackPreferencesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const auth = useAuth();
  const { reconnectSequence } = useConnectivity();
  const queryClient = useQueryClient();
  const storageKey = keyFor(auth.subject?.id);
  const queryKey = useMemo(
    () => ['playback-preferences', storageKey] as const,
    [storageKey],
  );
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const local = await readLocal(storageKey);
      if (!auth.subject) return local.values;
      try {
        let canonical = await auth.clients.cms.getPlaybackPreferences();
        if (local.dirtyFields.length > 0) {
          const replay = Object.fromEntries(
            local.dirtyFields.map((field) => [field, local.values[field]]),
          ) as Partial<PlaybackPreferences>;
          canonical = await auth.clients.cms.updatePlaybackPreferences(replay);
        }
        await writeLocal(storageKey, {
          version: 2,
          values: canonical,
          dirtyFields: [],
        });
        return canonical;
      } catch {
        return local.values;
      }
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (reconnectSequence > 0 && auth.subject) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [auth.subject, queryClient, queryKey, reconnectSequence]);

  const mutation = useMutation({
    mutationFn: async (input: Partial<PlaybackPreferences>) => {
      const current = await readLocal(storageKey);
      const next = normalize({ ...current.values, ...input });
      const dirtyFields = [
        ...new Set([...current.dirtyFields, ...Object.keys(input)]),
      ].filter((field): field is PreferenceField => field in defaults);
      await writeLocal(storageKey, { version: 2, values: next, dirtyFields });
      queryClient.setQueryData(queryKey, next);
      if (!auth.subject) return next;
      try {
        const replay = Object.fromEntries(
          dirtyFields.map((field) => [field, next[field]]),
        ) as Partial<PlaybackPreferences>;
        const canonical =
          await auth.clients.cms.updatePlaybackPreferences(replay);
        await writeLocal(storageKey, {
          version: 2,
          values: canonical,
          dirtyFields: [],
        });
        return canonical;
      } catch {
        return next;
      }
    },
    onSuccess: (value) => queryClient.setQueryData(queryKey, value),
  });
  const value = useMemo(
    () => ({
      preferences: query.data ?? defaults,
      isLoading: query.isLoading,
      update: mutation.mutateAsync,
    }),
    [mutation.mutateAsync, query.data, query.isLoading],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePlaybackPreferences(): PlaybackPreferencesController {
  const value = useContext(Context);
  if (!value) {
    throw new Error(
      'usePlaybackPreferences must be used inside PlaybackPreferencesProvider',
    );
  }
  return value;
}
