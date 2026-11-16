import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setSoundEnabled } from '../lib/sound';
import { storage } from '../lib/storage';
import { translate, type Lang, type TranslationKey } from '../translations';

export type CardBack = 'classic' | 'royal' | 'emerald' | 'lotus';
export type TableTheme = 'green' | 'blue' | 'maroon' | 'night';

export interface Settings {
  lang: Lang;
  sound: boolean;
  reducedMotion: boolean;
  cardBack: CardBack;
  table: TableTheme;
  defaultTarget: 5 | 10;
  defaultAnnouncedKapothi: boolean;
}

const prefersReduced =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const DEFAULTS: Settings = {
  lang: typeof navigator !== 'undefined' && navigator.language?.startsWith('si') ? 'si' : 'en',
  sound: true,
  reducedMotion: !!prefersReduced,
  cardBack: 'classic',
  table: 'green',
  defaultTarget: 10,
  defaultAnnouncedKapothi: false,
};

interface Ctx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => ({ ...DEFAULTS, ...storage.read<Partial<Settings>>('omi.settings', {}) }));

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      storage.write('omi.settings', next);
      return next;
    });
  }, []);

  useEffect(() => {
    setSoundEnabled(settings.sound);
    document.documentElement.lang = settings.lang;
    document.documentElement.classList.toggle('reduce-motion', settings.reducedMotion);
    document.documentElement.dataset.table = settings.table;
  }, [settings]);

  const t = useCallback((key: TranslationKey, vars?: Record<string, string | number>) => translate(settings.lang, key, vars), [settings.lang]);

  const value = useMemo(() => ({ settings, update, t }), [settings, update, t]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings outside provider');
  return ctx;
}
