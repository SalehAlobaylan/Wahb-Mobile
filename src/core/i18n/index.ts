import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { resources } from './messages';

const deviceLanguage = getLocales()[0]?.languageCode;
const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: deviceLanguage === 'ar' ? 'ar' : 'en',
  fallbackLng: 'en',
  supportedLngs: ['ar', 'en'],
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
