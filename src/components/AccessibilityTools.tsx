import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Accessibility, Minus, Plus, Eye, BookOpen, Volume2, X, Focus,
  Pause, Play, Square, Type, Move,
} from 'lucide-react';

type Preferences = {
  fontScale: number;
  contrast: boolean;
  links: boolean;
  spacing: boolean;
  dyslexia: boolean;
  focus: boolean;
  reduceMotion: boolean;
};

const defaults: Preferences = {
  fontScale: 100,
  contrast: false,
  links: false,
  spacing: false,
  dyslexia: false,
  focus: false,
  reduceMotion: false,
};

function readPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem('ctrlclima_accessibility') || '{}');
    const scale = Number(saved.fontScale);
    return {
      ...defaults,
      ...saved,
      fontScale: Number.isFinite(scale) ? Math.min(140, Math.max(90, scale)) : 100,
    };
  } catch {
    return defaults;
  }
}

declare global {
  interface Window {
    VLibras?: { Widget: new (url: string) => unknown };
  }
}

export default function AccessibilityTools() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>(readPreferences);
  const [readingPaused, setReadingPaused] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = `${prefs.fontScale}%`;
    root.style.filter = prefs.contrast ? 'contrast(1.35)' : '';
    root.dataset.contrast = prefs.contrast ? 'high' : 'normal';
    root.dataset.links = prefs.links ? 'underlined' : 'normal';
    root.dataset.spacing = prefs.spacing ? 'wide' : 'normal';
    root.dataset.dyslexia = prefs.dyslexia ? 'on' : 'off';
    root.dataset.focus = prefs.focus ? 'on' : 'off';
    root.dataset.reduceMotion = prefs.reduceMotion ? 'on' : 'off';

    try {
      localStorage.setItem('ctrlclima_accessibility', JSON.stringify(prefs));
    } catch {
      // Preferences still apply for the current session.
    }
  }, [prefs]);

  // Load and initialize the official VLibras widget once.
  useEffect(() => {
    const scriptId = 'vlibras-plugin-script';
    const initialize = () => {
      if (window.VLibras && !document.getElementById('vlibras-widget-container')) {
        const container = document.createElement('div');
        container.id = 'vlibras-widget-container';
        container.setAttribute('vw', '');
        container.className = 'enabled';

        const accessButton = document.createElement('div');
        accessButton.setAttribute('vw-access-button', '');
        accessButton.className = 'active';

        const pluginWrapper = document.createElement('div');
        pluginWrapper.setAttribute('vw-plugin-wrapper', '');
        const topWrapper = document.createElement('div');
        topWrapper.className = 'vw-plugin-top-wrapper';
        pluginWrapper.appendChild(topWrapper);
        container.appendChild(accessButton);
        container.appendChild(pluginWrapper);
        document.body.appendChild(container);
        new window.VLibras.Widget('https://vlibras.gov.br/app');
      }
    };

    if (window.VLibras) {
      initialize();
      return;
    }

    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://vlibras.gov.br/app/vlibras-plugin.js';
      script.async = true;
      document.body.appendChild(script);
    }
    script.addEventListener('load', initialize);
    return () => script?.removeEventListener('load', initialize);
  }, []);

  useEffect(() => {
    if (!prefs.focus) return;
    let current: Element | null = null;

    const highlight = (target: EventTarget | null) => {
      const element = target instanceof Element
        ? target.closest('p, li, h1, h2, h3, h4, label, blockquote, button, a')
        : null;
      if (current && current !== element) current.classList.remove('reading-focus-highlight');
      current = element;
      current?.classList.add('reading-focus-highlight');
    };
    const clear = () => {
      current?.classList.remove('reading-focus-highlight');
      current = null;
    };
    const mouseOver = (event: MouseEvent) => highlight(event.target);
    const focusIn = (event: FocusEvent) => highlight(event.target);
    const focusOut = () => clear();

    document.addEventListener('mouseover', mouseOver);
    document.addEventListener('focusin', focusIn);
    document.addEventListener('focusout', focusOut);
    return () => {
      document.removeEventListener('mouseover', mouseOver);
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('focusout', focusOut);
      clear();
    };
  }, [prefs.focus]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  function update(partial: Partial<Preferences>) {
    setPrefs((current) => ({ ...current, ...partial }));
  }

  function readPage() {
    if (typeof window.speechSynthesis === 'undefined') {
      window.alert(t('accessibility.speechUnavailable'));
      return;
    }
    window.speechSynthesis.cancel();
    const main = document.querySelector('main');
    const text = (main?.innerText || document.body.innerText).slice(0, 12000);
    const utterance = new SpeechSynthesisUtterance(text);
    const language = (i18n.resolvedLanguage || i18n.language || 'pt').split('-')[0];
    utterance.lang = language === 'en' ? 'en-US' : language === 'es' ? 'es-ES' : 'pt-BR';
    window.speechSynthesis.speak(utterance);
    setReadingPaused(false);
  }

  function pauseReading() {
    if (typeof window.speechSynthesis === 'undefined') return;
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setReadingPaused(false);
    } else {
      window.speechSynthesis.pause();
      setReadingPaused(true);
    }
  }

  function stopReading() {
    if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel();
    setReadingPaused(false);
  }

  function restoreDefaults() {
    stopReading();
    setPrefs(defaults);
  }

  const status = (enabled: boolean) => enabled ? t('accessibility.on') : t('accessibility.off');

  return (
    <div className="accessibility-tools">
      <button
        className="accessibility-launcher"
        type="button"
        aria-label={t('accessibility.open')}
        aria-expanded={open}
        aria-controls="ctrlclima-accessibility-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <Accessibility size={20} />
        <span>{t('accessibility.title')}</span>
      </button>

      {open && (
        <section
          id="ctrlclima-accessibility-panel"
          className="accessibility-panel"
          role="dialog"
          aria-label={t('accessibility.title')}
          aria-modal="false"
        >
          <div className="accessibility-panel-heading">
            <div>
              <strong>{t('accessibility.title')}</strong>
              <p>{t('accessibility.subtitle')}</p>
            </div>
            <button className="icon-button" type="button" aria-label={t('accessibility.close')} onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
          </div>

          <div className="accessibility-control">
            <span>{t('accessibility.textSize')}</span>
            <div className="accessibility-inline">
              <button type="button" className="secondary-button" aria-label={t('accessibility.decrease')} disabled={prefs.fontScale <= 90} onClick={() => update({ fontScale: Math.max(90, prefs.fontScale - 5) })}>
                <Minus size={16} />
              </button>
              <strong aria-live="polite">{prefs.fontScale}%</strong>
              <button type="button" className="secondary-button" aria-label={t('accessibility.increase')} disabled={prefs.fontScale >= 140} onClick={() => update({ fontScale: Math.min(140, prefs.fontScale + 5) })}>
                <Plus size={16} />
              </button>
            </div>
          </div>

          <button type="button" className={`accessibility-option ${prefs.dyslexia ? 'selected' : ''}`} aria-pressed={prefs.dyslexia} onClick={() => update({ dyslexia: !prefs.dyslexia })}>
            <Type size={17} /><span>{t('accessibility.readingFont')}</span><strong>{status(prefs.dyslexia)}</strong>
          </button>
          <button type="button" className={`accessibility-option ${prefs.focus ? 'selected' : ''}`} aria-pressed={prefs.focus} onClick={() => update({ focus: !prefs.focus })}>
            <Focus size={17} /><span>{t('accessibility.focus')}</span><strong>{status(prefs.focus)}</strong>
          </button>
          <button type="button" className={`accessibility-option ${prefs.contrast ? 'selected' : ''}`} aria-pressed={prefs.contrast} onClick={() => update({ contrast: !prefs.contrast })}>
            <Eye size={17} /><span>{t('accessibility.contrast')}</span><strong>{status(prefs.contrast)}</strong>
          </button>
          <button type="button" className={`accessibility-option ${prefs.links ? 'selected' : ''}`} aria-pressed={prefs.links} onClick={() => update({ links: !prefs.links })}>
            <BookOpen size={17} /><span>{t('accessibility.underline')}</span><strong>{status(prefs.links)}</strong>
          </button>
          <button type="button" className={`accessibility-option ${prefs.spacing ? 'selected' : ''}`} aria-pressed={prefs.spacing} onClick={() => update({ spacing: !prefs.spacing })}>
            <Move size={17} /><span>{t('accessibility.spacing')}</span><strong>{status(prefs.spacing)}</strong>
          </button>
          <button type="button" className={`accessibility-option ${prefs.reduceMotion ? 'selected' : ''}`} aria-pressed={prefs.reduceMotion} onClick={() => update({ reduceMotion: !prefs.reduceMotion })}>
            <Accessibility size={17} /><span>{t('accessibility.motion')}</span><strong>{status(prefs.reduceMotion)}</strong>
          </button>

          <div className="accessibility-section-label">{t('accessibility.speech')}</div>
          <div className="accessibility-inline accessibility-speech">
            <button type="button" className="primary-button" onClick={readPage}><Volume2 size={16} /> {t('accessibility.read')}</button>
            <button type="button" className="secondary-button" onClick={pauseReading} aria-label={readingPaused ? t('accessibility.resume') : t('accessibility.pause')}>
              {readingPaused ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button type="button" className="secondary-button" onClick={stopReading} aria-label={t('accessibility.stop')}><Square size={16} /></button>
          </div>
          <button type="button" className="secondary-button full" onClick={restoreDefaults}>{t('accessibility.restore')}</button>
          <p className="accessibility-note">{t('accessibility.vlibras')}</p>
        </section>
      )}
    </div>
  );
}
