import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { resources } from './messages';

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources,
  // Saudi Arabia is the launch market. English remains available in Settings.
  lng: 'ar',
  fallbackLng: 'ar',
  supportedLngs: ['ar', 'en'],
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
