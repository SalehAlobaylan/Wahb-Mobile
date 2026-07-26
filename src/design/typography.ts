import { useTranslation } from 'react-i18next';

import { fontFamilies } from './tokens';

export type WahbTextRole = 'body' | 'medium' | 'bold' | 'editorial' | 'mono';

export function fontForLocale(language: string, role: WahbTextRole): string {
  if (language.startsWith('ar')) {
    if (role === 'bold' || role === 'editorial') return fontFamilies.arabicBold;
    if (role === 'medium') return fontFamilies.arabicMedium;
    return role === 'mono' ? fontFamilies.mono : fontFamilies.arabic;
  }
  if (role === 'editorial') return fontFamilies.editorial;
  if (role === 'mono') return fontFamilies.mono;
  if (role === 'bold') return fontFamilies.bodyBold;
  if (role === 'medium') return fontFamilies.bodyMedium;
  return fontFamilies.body;
}

/** Content can be Arabic while the surrounding product chrome is English. */
export function fontForText(
  text: string | null | undefined,
  role: WahbTextRole,
): string {
  return /[\u0600-\u06FF\u0750-\u077F]/u.test(text ?? '')
    ? fontForLocale('ar', role)
    : fontForLocale('en', role);
}

export function useWahbTypography() {
  const { i18n } = useTranslation();
  return {
    font: (role: WahbTextRole = 'body') => fontForLocale(i18n.language, role),
    isRTL: i18n.language.startsWith('ar'),
  };
}
