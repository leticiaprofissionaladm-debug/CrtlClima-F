import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import pt from './locales/pt.json';
import es from './locales/es.json';

const resources = {
  en: { translation: en },
  pt: { translation: pt },
  es: { translation: es },
};

function getSavedLanguage() {
  try {
    const saved = localStorage.getItem('ctrlclima_language');
    return saved && ['pt', 'en', 'es'].includes(saved) ? saved : 'pt';
  } catch {
    return 'pt';
  }
}

const initialLanguage = getSavedLanguage();
document.documentElement.lang = initialLanguage;

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLanguage,
    fallbackLng: 'pt',
    supportedLngs: ['pt', 'en', 'es'],
    interpolation: { escapeValue: false },
    returnNull: false,
    returnEmptyString: false,
  });

export default i18n;
