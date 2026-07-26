import Storage from 'expo-sqlite/kv-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme } from 'react-native';

import {
  applyThemePreference,
  type ThemePreference,
} from '@/features/settings/experience-preferences';

import { darkTheme, lightTheme } from './tokens';

const preferenceKey = 'experience-preferences-v1';

export type WahbTheme = {
  background: string;
  foreground: string;
  card: string;
  muted: string;
  mutedForeground: string;
  border: string;
  accent: string;
  accentPressed: string;
  inverse: string;
};

type WahbThemeContextValue = {
  colorScheme: 'light' | 'dark';
  preference: ThemePreference;
  theme: WahbTheme;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

const fallbackThemeContext: WahbThemeContextValue = {
  colorScheme: 'light',
  preference: 'system',
  theme: lightTheme,
  setPreference: async () => undefined,
};

const WahbThemeContext =
  createContext<WahbThemeContextValue>(fallbackThemeContext);

function resolveScheme(
  preference: ThemePreference,
  systemScheme: 'light' | 'dark' | 'unspecified' | null | undefined,
): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemScheme === 'dark' ? 'dark' : 'light';
}

export function WahbThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    void Storage.getItem(preferenceKey).then((raw) => {
      if (!raw) return;
      try {
        const candidate = JSON.parse(raw) as { theme?: ThemePreference };
        if (
          candidate.theme === 'light' ||
          candidate.theme === 'dark' ||
          candidate.theme === 'system'
        ) {
          setPreferenceState(candidate.theme);
        }
      } catch {
        // A malformed local preference must never block the product shell.
      }
    });
  }, []);

  const setPreference = useCallback(async (next: ThemePreference) => {
    setPreferenceState(next);
    applyThemePreference(next);
  }, []);

  const colorScheme = resolveScheme(preference, systemScheme);
  const value = useMemo<WahbThemeContextValue>(
    () => ({
      colorScheme,
      preference,
      theme: colorScheme === 'dark' ? darkTheme : lightTheme,
      setPreference,
    }),
    [colorScheme, preference, setPreference],
  );

  return (
    <WahbThemeContext.Provider value={value}>
      {children}
    </WahbThemeContext.Provider>
  );
}

export function useWahbTheme(): WahbThemeContextValue {
  return useContext(WahbThemeContext);
}

export { resolveScheme };
