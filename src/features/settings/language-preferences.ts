import { I18nManager } from 'react-native';
import Storage from 'expo-sqlite/kv-store';

import i18n from '@/core/i18n';

export type UiLanguage = 'ar' | 'en';
export type ContentLanguage = 'ar' | 'en' | 'both';

export type LanguagePreferences = {
  uiLanguage: UiLanguage;
  contentLanguage: ContentLanguage;
};

const key = 'language-preferences-v1';

export function defaultLanguagePreferences(): LanguagePreferences {
  // Arabic-first is intentional for the Saudi launch. Settings remains the
  // durable, explicit source of truth once a user makes a choice.
  return { uiLanguage: 'ar', contentLanguage: 'ar' };
}

function normalize(value: unknown): LanguagePreferences {
  const fallback = defaultLanguagePreferences();
  if (!value || typeof value !== 'object') {
    return fallback;
  }
  const candidate = value as Partial<LanguagePreferences>;
  return {
    uiLanguage:
      candidate.uiLanguage === 'ar' || candidate.uiLanguage === 'en'
        ? candidate.uiLanguage
        : fallback.uiLanguage,
    contentLanguage:
      candidate.contentLanguage === 'ar' ||
      candidate.contentLanguage === 'en' ||
      candidate.contentLanguage === 'both'
        ? candidate.contentLanguage
        : fallback.contentLanguage,
  };
}

export async function readLanguagePreferences(): Promise<LanguagePreferences> {
  const raw = await Storage.getItem(key);
  if (!raw) {
    return defaultLanguagePreferences();
  }
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return defaultLanguagePreferences();
  }
}

function applyUiLanguage(language: UiLanguage): void {
  void i18n.changeLanguage(language);
  // React Native applies a forced direction on the next native root creation.
  // Calling this during boot ensures every flex layout is mirrored together;
  // Settings makes the same durable choice for the next launch.
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(language === 'ar');
}

export async function bootstrapLanguagePreferences(): Promise<LanguagePreferences> {
  const preferences = await readLanguagePreferences();
  applyUiLanguage(preferences.uiLanguage);
  return preferences;
}

export async function writeLanguagePreferences(
  preferences: LanguagePreferences,
): Promise<void> {
  const normalized = normalize(preferences);
  await Storage.setItem(key, JSON.stringify(normalized));
  applyUiLanguage(normalized.uiLanguage);
}
