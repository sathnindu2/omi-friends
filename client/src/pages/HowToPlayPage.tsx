import { useState, type CSSProperties, type ReactNode } from 'react';
import { createDeck, legalCards, parseCardId, SUIT_SYMBOL, trickWinner } from '../../../shared/rules';
import type { Card, PlayedCard, Seat, Suit } from '../../../shared/types';
import { PlayingCard } from '../components/PlayingCard';
import { PageShell } from '../components/ui';
import { useGame } from '../context/GameContext';
import { useSettings } from '../context/SettingsContext';
import { navigate } from '../lib/router';
import type { TranslationKey } from '../translations';

const c = (id: string) => parseCardId(id) as Card;
const trick = (...ids: string[]): PlayedCard[] => ids.map((id, i) => ({ seat: i as Seat, card: c(id) }));

function Section({ n, children }: { n: number; children?: ReactNode }) {
  const { t } = useSettings();
  return (
    <section className="panel anim-fade-up p-5">
      <h3 className="font-display text-lg font-bold text-gold-300">{t(`howto.s${n}.title` as TranslationKey)}</h3>
      <p className="mt-2 leading-relaxed text-white/85">{t(`howto.s${n}.body` as TranslationKey)}</p>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

function TrickExample({ ids, trump }: { ids: string[]; trump: Suit }) {
  const { t } = useSettings();
  const tr = trick(...ids);
  const win = trickWinner(tr, trump);
  return (
    <div className="rounded-xl bg-black/25 p-3">
      <div className="mb-2 text-xs text-gold-200/80">
        {t('howto.example')} · {t('howto.trumpIs', { suit: `${SUIT_SYMBOL[trump]} ${t(`suit.${trump}`)}` })}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {tr.map((pc, i) => (
          <div key={pc.card.id} className="flex flex-col items-center gap-1">
            <PlayingCard card={pc.card} width="54px" winner={pc.card.id === win.card.id} />
            <span className="text-[10px] text-white/60">{i === 0 ? '1st' : `${i + 1}`}</span>
          </div>
        ))}
        <div className="ml-2 self-center text-sm font-bold text-gold-300">
          → {t('howto.winner')}: {win.card.rank}
          {SUIT_SYMBOL[win.card.suit]}
        </div>
      </div>
    </div>
  );
}

const PRACTICE: { led: string; hand: string[]; trump: Suit }[] = [
  { led: '9H', hand: ['AS', 'KH', 'QD', '7H', '8C'], trump: 'S' },
  { led: 'JD', hand: ['AS', 'KC', '10H', '7S'], trump: 'C' },
  { led: '10C', hand: ['AC', '9D', 'KS', 'QH', '8C'], trump: 'D' },
];

function Practice() {
  const { t } = useSettings();
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState<{ id: string; ok: boolean } | null>(null);
  const p = PRACTICE[i];
  const hand = p.hand.map(c);
  const led = c(p.led);
  const legal = legalCards(hand, [{ seat: 0, card: led }]);
  const isVoid = !hand.some((h) => h.suit === led.suit);

  return (
    <section className="panel anim-fade-up p-5 ring-2 ring-gold-400/50">
      <h3 className="font-display text-lg font-bold text-gold-300">🎯 {t('howto.practice')}</h3>
      <p className="mt-1 text-sm text-white/80">{t('howto.practiceHint')}</p>
      <div className="mt-3 flex items-center gap-3 rounded-xl bg-black/25 p-3">
        <PlayingCard card={led} width="58px" />
        <div className="text-sm">
          <div className="font-semibold">{t('howto.leadSuit', { suit: `${SUIT_SYMBOL[led.suit]} ${t(`suit.${led.suit}`)}` })}</div>
          <div className="text-white/60">{t('howto.trumpIs', { suit: `${SUIT_SYMBOL[p.trump]} ${t(`suit.${p.trump}`)}` })}</div>
        </div>
      </div>
      <div className="hand mt-4 !px-0" style={{ '--cw': 'clamp(52px, 15vw, 72px)' } as CSSProperties}>
        {hand.map((card) => (
          <PlayingCard
            key={card.id}
            card={card}
            selected={answer?.id === card.id}
            playable
            onClick={() => setAnswer({ id: card.id, ok: legal.some((l) => l.id === card.id) })}
          />
        ))}
      </div>
      {answer && (
        <p
          className={`anim-pop mt-4 rounded-lg px-3 py-2 text-sm font-semibold ${answer.ok ? 'bg-emerald-800/60 text-emerald-100' : 'bg-red-900/60 text-red-100'}`}
          role="status"
        >
          {answer.ok ? (isVoid ? t('howto.practiceVoid') : t('howto.practiceGood')) : t('howto.practiceBad')}
        </p>
      )}
      <button
        className="btn btn-ghost btn-sm mt-4"
        onClick={() => {
          setI((x) => (x + 1) % PRACTICE.length);
          setAnswer(null);
        }}
      >
        {t('howto.next')} →
      </button>
    </section>
  );
}

export function HowToPlayPage() {
  const { t } = useSettings();
  const { session } = useGame();
  const spades = createDeck().filter((x) => x.suit === 'S');

  return (
    <PageShell title={t('howto.title')} wide back={session ? `/room/${session.roomCode}` : '/'}>
      <div className="space-y-4">
        <p className="anim-fade-up text-center text-lg text-gold-200">{t('howto.intro')}</p>
        <Section n={1} />
        <Section n={2}>
          <div className="mx-auto grid w-56 grid-cols-3 grid-rows-3 place-items-center gap-1 rounded-[45%] bg-black/25 p-3 text-xs font-bold">
            <span className="col-start-2 rounded-full bg-sky-800 px-2 py-1">P3 · A</span>
            <span className="col-start-1 row-start-2 rounded-full bg-rose-800 px-2 py-1">P4 · B</span>
            <span className="col-start-2 row-start-2 text-2xl">🃏</span>
            <span className="col-start-3 row-start-2 rounded-full bg-rose-800 px-2 py-1">P2 · B</span>
            <span className="col-start-2 row-start-3 rounded-full bg-sky-800 px-2 py-1">P1 · A</span>
          </div>
          <p className="mt-2 text-center text-xs text-white/60">P1 → P2 → P3 → P4 ↺</p>
        </Section>
        <Section n={3}>
          <div className="flex flex-wrap justify-center gap-1.5">
            {spades.map((card) => (
              <PlayingCard key={card.id} card={card} width="44px" />
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-white/60">A &gt; K &gt; Q &gt; J &gt; 10 &gt; 9 &gt; 8 &gt; 7</p>
        </Section>
        <Section n={4}>
          <div className="flex justify-center gap-1">
            {[0, 1, 2, 3].map((i) => (
              <PlayingCard key={i} faceDown width="44px" className="anim-deal" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
        </Section>
        <Section n={5}>
          <div className="flex justify-center gap-3 text-4xl">
            {(['S', 'H', 'D', 'C'] as Suit[]).map((s) => (
              <span key={s} className={`flex h-16 w-14 items-center justify-center rounded-xl bg-white shadow ${s === 'H' || s === 'D' ? 'text-red-600' : 'text-neutral-900'}`}>
                {SUIT_SYMBOL[s]}
              </span>
            ))}
          </div>
        </Section>
        <Section n={6} />
        <Section n={7}>
          <TrickExample ids={['9H', 'KH', '7H', 'AH']} trump="S" />
        </Section>
        <Practice />
        <Section n={8}>
          <div className="space-y-2">
            <TrickExample ids={['AH', '7S', 'KH', '8H']} trump="S" />
            <TrickExample ids={['AH', '7S', 'KS', '10H']} trump="S" />
          </div>
        </Section>
        <Section n={9}>
          <TrickExample ids={['AH', 'KH', '7H', '10H']} trump="S" />
        </Section>
        <Section n={10}>
          <table className="w-full overflow-hidden rounded-xl text-sm">
            <tbody>
              {[
                ['5–7', t('howto.row.trump'), '1'],
                ['5–7', t('howto.row.defend'), '2'],
                ['8', t('howto.row.kapothi'), '3'],
                ['4–4', t('howto.row.draw'), '0 (+1)'],
              ].map(([a, b, n]) => (
                <tr key={b} className="odd:bg-black/25">
                  <td className="px-3 py-2 font-semibold">{a}</td>
                  <td className="px-3 py-2 text-white/80">{b}</td>
                  <td className="px-3 py-2 text-right font-display text-lg font-bold text-gold-300">{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section n={11} />
        <Section n={12} />
        <Section n={13} />
        <button className="btn btn-gold w-full text-lg" onClick={() => navigate(session ? `/room/${session.roomCode}` : '/create')}>
          ▶ {t('howto.play')}
        </button>
      </div>
    </PageShell>
  );
}
