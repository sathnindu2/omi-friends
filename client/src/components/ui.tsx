/** Small shared UI pieces. */
import { useEffect, useMemo, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AVATARS } from '../../../shared/rules';
import { useGame } from '../context/GameContext';
import { useSettings } from '../context/SettingsContext';
import { navigate } from '../lib/router';

export function Avatar({
  avatar,
  size = 44,
  connected = true,
  active = false,
  className = '',
}: {
  avatar: string;
  size?: number;
  connected?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative flex items-center justify-center rounded-full bg-gradient-to-b from-felt-600 to-felt-900 ring-2 ${
        active ? 'ring-gold-300 turn-glow' : 'ring-gold-500/40'
      } ${connected ? '' : 'grayscale opacity-60'} ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.55 }}
    >
      <span aria-hidden="true">{AVATARS[avatar] ?? '🙂'}</span>
      <span
        className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-felt-900 ${connected ? 'bg-emerald-400' : 'bg-red-500'}`}
        style={{ width: Math.max(10, size * 0.26), height: Math.max(10, size * 0.26) }}
        title={connected ? 'online' : 'offline'}
      />
    </div>
  );
}

export function Logo({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  const big = size === 'lg';
  return (
    <div className="flex flex-col items-center select-none">
      <div className={`flex items-center gap-1 ${big ? 'text-3xl sm:text-4xl' : 'text-lg'}`} aria-hidden="true">
        <span className="text-white drop-shadow">♠</span>
        <span className="text-red-500 drop-shadow">♥</span>
        <span className="text-red-500 drop-shadow">♦</span>
        <span className="text-white drop-shadow">♣</span>
      </div>
      <h1
        className={`font-display font-extrabold tracking-[0.08em] gold-text drop-shadow-[0_3px_10px_rgba(0,0,0,0.5)] ${
          big ? 'text-5xl sm:text-6xl' : 'text-xl'
        }`}
      >
        OMI FRIENDS
      </h1>
    </div>
  );
}

export function PageShell({
  title,
  children,
  back = '/',
  wide = false,
}: {
  title: string;
  children: ReactNode;
  back?: string | null;
  wide?: boolean;
}) {
  const { t } = useSettings();
  return (
    <div className="felt min-h-full safe-area">
      <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 bg-felt-950/60 backdrop-blur border-b border-gold-500/20">
        {back !== null && (
          <button className="btn btn-ghost btn-sm !min-h-[40px] !px-3" onClick={() => navigate(back)} aria-label={t('common.back')}>
            ← <span className="hidden sm:inline">{t('common.back')}</span>
          </button>
        )}
        <h2 className="font-display text-lg sm:text-xl font-bold text-gold-300 truncate">{title}</h2>
      </header>
      <main className={`mx-auto px-4 py-6 ${wide ? 'max-w-3xl' : 'max-w-md'}`}>{children}</main>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useGame();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+64px)] z-[80] flex flex-col items-center gap-2 px-3">
      {toasts.map((x) => (
        <div
          key={x.id}
          role="status"
          className={`anim-fade-up max-w-sm rounded-full px-4 py-2 text-sm font-semibold shadow-lg backdrop-blur ${
            x.kind === 'error'
              ? 'bg-red-900/90 text-red-50 ring-1 ring-red-400/50'
              : x.kind === 'success'
                ? 'bg-emerald-900/90 text-emerald-50 ring-1 ring-emerald-400/50'
                : 'bg-black/75 text-white ring-1 ring-gold-400/40'
          }`}
        >
          {x.text}
        </div>
      ))}
    </div>
  );
}

export function ConnectionBanner() {
  const { connected } = useGame();
  const { t } = useSettings();
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (connected) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[90] flex justify-center pb-[calc(env(safe-area-inset-bottom)+8px)] px-3 pointer-events-none">
      <div className="flex items-center gap-2 rounded-full bg-black/85 px-4 py-2 text-sm text-gold-200 ring-1 ring-gold-500/40">
        <span className="spinner !w-4 !h-4 !border-2" />
        {offline ? t('conn.offline') : t('conn.reconnecting')}
      </div>
    </div>
  );
}

export function Modal({ children, onClose, wide }: { children: ReactNode; onClose?: () => void; wide?: boolean }) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm safe-area"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`panel anim-pop w-full ${wide ? 'max-w-lg' : 'max-w-sm'} max-h-[92vh] overflow-y-auto p-5`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function Confetti({ count = 60 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 2.5,
        dur: 2.6 + Math.random() * 2,
        drift: (Math.random() - 0.5) * 160,
        spin: 360 + Math.random() * 720,
        color: ['#f3d27a', '#d4af37', '#ffffff', '#c0262d', '#22c55e', '#60a5fa'][i % 6],
      })),
    [count],
  );
  // Portal to <body>: a parent with backdrop-filter would otherwise trap position:fixed.
  return createPortal(
    <div aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti"
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              '--delay': `${p.delay}s`,
              '--dur': `${p.dur}s`,
              '--drift': `${p.drift}px`,
              '--spin': `${p.spin}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>,
    document.body,
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? 'bg-gold-500' : 'bg-white/15'}`}
    >
      <span
        className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'left-7' : 'left-1'}`}
      />
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-full bg-black/30 p-1 ring-1 ring-gold-500/25">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${
            value === o.value ? 'bg-gold-400 text-felt-950 shadow' : 'text-gold-200/80 hover:text-white'
          }`}
          aria-pressed={value === o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
