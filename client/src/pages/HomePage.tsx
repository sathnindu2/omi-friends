import type { CSSProperties } from 'react';
import { makeCard } from '../../../shared/rules';
import { InstallPrompt } from '../components/InstallPrompt';
import { PlayingCard } from '../components/PlayingCard';
import { Logo, Segmented } from '../components/ui';
import { useSettings } from '../context/SettingsContext';
import { Link, navigate } from '../lib/router';
import { storage } from '../lib/storage';
import { LANGUAGES, type Lang } from '../translations';

const HERO_CARDS = [
  { card: makeCard('A', 'S'), rot: -18, x: -88, delay: 0 },
  { card: makeCard('K', 'H'), rot: -6, x: -30, delay: 0.4 },
  { card: makeCard('Q', 'D'), rot: 6, x: 30, delay: 0.8 },
  { card: makeCard('J', 'C'), rot: 18, x: 88, delay: 1.2 },
];

export function HomePage() {
  const { t, settings, update } = useSettings();
  const lastRoom = storage.getLastRoom();
  const lastSession = lastRoom ? storage.getSession(lastRoom) : null;

  return (
    <div className="felt min-h-full safe-area overflow-x-hidden">
      <div className="mx-auto flex min-h-full max-w-md flex-col items-center px-5 pb-8 pt-5">
        {/* top controls */}
        <div className="flex w-full items-center justify-between gap-3">
          <div className="w-44">
            <Segmented<Lang>
              value={settings.lang}
              onChange={(lang) => update({ lang })}
              options={(Object.keys(LANGUAGES) as Lang[]).map((l) => ({ value: l, label: LANGUAGES[l].label }))}
            />
          </div>
          <button
            className="btn btn-ghost btn-sm !px-3"
            onClick={() => update({ sound: !settings.sound })}
            aria-label={t('settings.sound')}
            aria-pressed={settings.sound}
          >
            {settings.sound ? '🔊' : '🔇'}
          </button>
        </div>

        {/* hero */}
        <div className="relative mt-8 h-40 w-full" aria-hidden="true">
          {HERO_CARDS.map(({ card, rot, x, delay }) => (
            <div
              key={card.id}
              className="absolute left-1/2 top-2 anim-float"
              style={{ '--rot': `${rot}deg`, marginLeft: x - 40, animationDelay: `${delay}s` } as CSSProperties}
            >
              <PlayingCard card={card} width="80px" />
            </div>
          ))}
        </div>

        <div className="anim-fade-up mt-4">
          <Logo />
        </div>
        <h2 className="anim-fade-up mt-4 text-center text-2xl font-bold text-white sm:text-3xl" style={{ animationDelay: '0.1s' }}>
          {t('home.title')}
        </h2>
        <p className="anim-fade-up mt-2 text-center text-gold-200/90" style={{ animationDelay: '0.2s' }}>
          {t('home.subtitle')}
        </p>

        <div className="anim-fade-up mt-8 flex w-full flex-col gap-3" style={{ animationDelay: '0.3s' }}>
          {lastSession && (
            <button className="btn btn-ghost w-full !border-emerald-400/60" onClick={() => navigate(`/room/${lastSession.roomCode}`)}>
              ↩ {t('home.resume', { code: lastSession.roomCode })}
            </button>
          )}
          <button className="btn btn-gold w-full text-lg" onClick={() => navigate('/create')}>
            ➕ {t('home.create')}
          </button>
          <button className="btn btn-ghost w-full text-lg" onClick={() => navigate('/join')}>
            🔑 {t('home.join')}
          </button>
          <div className="grid grid-cols-2 gap-3">
            <Link to="/how-to-play" className="btn btn-ghost">
              📖 {t('home.howto')}
            </Link>
            <Link to="/settings" className="btn btn-ghost">
              ⚙️ {t('home.settings')}
            </Link>
          </div>
        </div>

        <div className="mt-8">
          <InstallPrompt />
        </div>

        <p className="mt-auto pt-8 text-center text-xs text-gold-200/60">{t('home.free')}</p>
      </div>
    </div>
  );
}
