import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown, Check } from 'lucide-react';

const languages = [
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
];

export default function LanguageSelector() {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const currentCode = (i18n.resolvedLanguage || i18n.language || 'pt').split('-')[0];
  const currentLanguage = languages.find((language) => language.code === currentCode) || languages[0];

  async function changeLanguage(language: string) {
    await i18n.changeLanguage(language);
    document.documentElement.lang = language;
    try {
      localStorage.setItem('ctrlclima_language', language);
    } catch {
      // Language still changes for the current session if storage is unavailable.
    }
    setOpen(false);
  }

  return (
    <div className="language-selector">
      <button
        type="button"
        className="language-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-label={t('language.label')}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Globe size={18} />
        <span>{currentLanguage.label}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="language-dropdown" role="menu" aria-label={t('language.label')}>
          <span className="language-heading">{t('language.label')}</span>
          {languages.map((language) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={currentCode === language.code}
              key={language.code}
              className="language-option"
              onClick={() => void changeLanguage(language.code)}
            >
              <span aria-hidden="true">{language.flag}</span>
              <span>{language.label}</span>
              {currentCode === language.code && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
