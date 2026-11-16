import type { CSSProperties, ReactNode } from 'react';
import { makeCard } from '../../../shared/rules';
import { PlayingCard } from '../components/PlayingCard';
import { PageShell, Segmented, Toggle } from '../components/ui';
import { useSettings, type CardBack, type TableTheme } from '../context/SettingsContext';
import { Link } from '../lib/router';
import { LANGUAGES, type Lang } from '../translations';

const BACKS: CardBack[] = ['classic', 'royal', 'emerald', 'lotus'];
const TABLES: TableTheme[] = ['green', 'blue', 'maroon', 'night'];
const TABLE_SWATCH: Record<TableTheme, string> = {
  green: 'radial-gradient(circle, #146c43, #0b3d2a)',
  blue: 'radial-gradient(circle, #1d5f8c, #0d3552)',
  maroon: 'radial-gradient(circle, #8a2335, #511322)',
  night: 'radial-gradient(circle, #2b2f4a, #161829)',
};

export function SettingsPage() {
  const { t, settings, update } = useSettings();
  return (
    <PageShell title={t('settings.title')}>
      <div className="space-y-4">
        <section className="panel space-y-5 p-5 anim-fade-up">
          <Row label={t('settings.language')}>
            <div className="w-48">
              <Segmented<Lang>
                value={settings.lang}
                onChange={(lang) => update({ lang })}
                options={(Object.keys(LANGUAGES) as Lang[]).map((l) => ({ value: l, label: LANGUAGES[l].label }))}
              />
            </div>
          </Row>
          <Row label={t('settings.sound')}>
            <Toggle checked={settings.sound} onChange={(sound) => update({ sound })} label={t('settings.sound')} />
          </Row>
          <Row label={t('settings.animations')}>
            <div className="w-48">
              <Segmented<'full' | 'reduced'>
                value={settings.reducedMotion ? 'reduced' : 'full'}
                onChange={(v) => update({ reducedMotion: v === 'reduced' })}
                options={[
                  { value: 'full', label: t('settings.full') },
                  { value: 'reduced', label: t('settings.reduced') },
                ]}
              />
            </div>
          </Row>
        </section>

        <section className="panel p-5 anim-fade-up" style={{ animationDelay: '0.05s' }}>
          <h3 className="mb-3 text-sm font-semibold text-gold-200">{t('settings.cardBack')}</h3>
          <div className="grid grid-cols-4 gap-3">
            {BACKS.map((b) => (
              <button
                key={b}
                onClick={() => update({ cardBack: b })}
                className={`flex flex-col items-center gap-1 rounded-xl p-2 ${settings.cardBack === b ? 'bg-gold-400/20 ring-2 ring-gold-300' : 'bg-black/20'}`}
                aria-pressed={settings.cardBack === b}
              >
                <div data-back={b} className="card" style={{ '--cw': '48px' } as CSSProperties}>
                  <div className="card-back" data-back={b} />
                </div>
                <span className="text-[11px] text-white/70">{t(`settings.back.${b}`)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel p-5 anim-fade-up" style={{ animationDelay: '0.1s' }}>
          <h3 className="mb-3 text-sm font-semibold text-gold-200">{t('settings.table')}</h3>
          <div className="grid grid-cols-4 gap-3">
            {TABLES.map((tb) => (
              <button
                key={tb}
                onClick={() => update({ table: tb })}
                className={`flex flex-col items-center gap-1 rounded-xl p-2 ${settings.table === tb ? 'bg-gold-400/20 ring-2 ring-gold-300' : 'bg-black/20'}`}
                aria-pressed={settings.table === tb}
              >
                <span className="block h-12 w-12 rounded-full ring-2 ring-gold-500/40" style={{ background: TABLE_SWATCH[tb] }} />
                <span className="text-[11px] text-white/70">{t(`settings.table.${tb}`)}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-center gap-2">
            <PlayingCard card={makeCard('A', 'H')} width="52px" />
            <PlayingCard faceDown width="52px" />
          </div>
        </section>

        <section className="panel space-y-5 p-5 anim-fade-up" style={{ animationDelay: '0.15s' }}>
          <h3 className="text-sm font-semibold text-gold-200">{t('settings.defaults')}</h3>
          <Row label={t('create.target')}>
            <div className="w-40">
              <Segmented<5 | 10>
                value={settings.defaultTarget}
                onChange={(defaultTarget) => update({ defaultTarget })}
                options={[
                  { value: 10, label: '10' },
                  { value: 5, label: '5' },
                ]}
              />
            </div>
          </Row>
          <div>
            <Row label={t('settings.kapothiVariation')}>
              <Toggle
                checked={settings.defaultAnnouncedKapothi}
                onChange={(defaultAnnouncedKapothi) => update({ defaultAnnouncedKapothi })}
                label={t('settings.kapothiVariation')}
              />
            </Row>
            <p className="mt-2 text-xs text-white/60">{t('settings.kapothiVariationHelp')}</p>
          </div>
        </section>

        <Link to="/how-to-play" className="btn btn-ghost w-full">
          📖 {t('settings.help')}
        </Link>
        <p className="text-center text-xs text-white/50">{t('settings.savedLocally')}</p>
      </div>
    </PageShell>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-medium">{label}</span>
      {children}
    </div>
  );
}
