import { useEffect, useState } from 'react';
import { useSettings } from '../context/SettingsContext';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
  });
}

/** Mobile install guidance: a real Install button on Android/desktop Chrome, instructions on iPhone. */
export function InstallPrompt() {
  const { t } = useSettings();
  const [canPrompt, setCanPrompt] = useState(!!deferred);
  const [open, setOpen] = useState(false);

  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  useEffect(() => {
    const onPrompt = () => setTimeout(() => setCanPrompt(true), 0);
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (standalone) return null;

  if (canPrompt && deferred) {
    return (
      <button
        className="btn btn-ghost btn-sm"
        onClick={async () => {
          await deferred?.prompt();
          deferred = null;
          setCanPrompt(false);
        }}
      >
        📲 {t('install.button')}
      </button>
    );
  }

  return (
    <div className="text-center">
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        📲 {t('install.title')}
      </button>
      {open && (
        <p className="anim-fade-up mx-auto mt-3 max-w-xs rounded-xl bg-black/30 p-3 text-sm text-gold-200">
          {ios ? t('install.ios') : t('install.android')}
        </p>
      )}
    </div>
  );
}
