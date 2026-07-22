import Storage from 'expo-sqlite/kv-store';
import { Appearance } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';

export type ExperiencePreferences = {
  autoplayEnabled: boolean;
  hapticsEnabled: boolean;
  theme: ThemePreference;
};

const key = 'experience-preferences-v1';

export const defaultExperiencePreferences: ExperiencePreferences = {
  autoplayEnabled: true,
  hapticsEnabled: true,
  theme: 'system',
};

function normalize(value: unknown): ExperiencePreferences {
  if (!value || typeof value !== 'object') {
    return defaultExperiencePreferences;
  }
  const candidate = value as Partial<ExperiencePreferences>;
  return {
    autoplayEnabled:
      typeof candidate.autoplayEnabled === 'boolean'
        ? candidate.autoplayEnabled
        : defaultExperiencePreferences.autoplayEnabled,
    hapticsEnabled:
      typeof candidate.hapticsEnabled === 'boolean'
        ? candidate.hapticsEnabled
        : defaultExperiencePreferences.hapticsEnabled,
    theme:
      candidate.theme === 'light' ||
      candidate.theme === 'dark' ||
      candidate.theme === 'system'
        ? candidate.theme
        : defaultExperiencePreferences.theme,
  };
}

export function applyThemePreference(theme: ThemePreference): void {
  // React Native accepts null here to clear a previous app-level override and
  // resume following the device; the Expo SDK declaration omits that value.
  Appearance.setColorScheme(theme === 'system' ? (null as never) : theme);
}

export async function readExperiencePreferences(): Promise<ExperiencePreferences> {
  const raw = await Storage.getItem(key);
  if (!raw) {
    return defaultExperiencePreferences;
  }
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return defaultExperiencePreferences;
  }
}

export async function writeExperiencePreferences(
  preferences: ExperiencePreferences,
): Promise<ExperiencePreferences> {
  const next = normalize(preferences);
  await Storage.setItem(key, JSON.stringify(next));
  applyThemePreference(next.theme);
  return next;
}
