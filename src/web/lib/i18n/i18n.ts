import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { defaultLanguage, resources } from './resources.ts';

void i18n.use(initReactI18next).init({
  resources,
  lng: defaultLanguage,
  fallbackLng: defaultLanguage,
  interpolation: {
    escapeValue: false,
  },
});

export { i18n };
