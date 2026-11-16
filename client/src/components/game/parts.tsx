import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { SUIT_IS_RED, SUIT_SYMBOL, teamOf } from '../../../../shared/rules';
import type { Card, CardId, PublicGameState, PublicPlayer, PublicRoomState, ReactionId, Seat, Suit } from '../../../../shared/types';
import { useGame, useGameEvents } from '../../context/GameContext';
import { useSettings } from '../../context/SettingsContext';
import type { TranslationKey } from '../../translations';
import { PlayingCard } from '../PlayingCard';
import { Avatar } from '../ui';

/** Position of a seat relative to me: 0 bottom (me), 1 right, 2 top (partner), 3 left. */
export type RelPos = 0 | 1 | 2 | 3;
export const relPos = (seat: Seat, mySeat: Seat) => (((seat - mySeat + 4) % 4) as RelPos);

/* ------------------------------------------------------------------ */
/* Scoreboard                                                          */
/* ------------------------------------------------------------------ */

export function Scoreboard({ room, mySeat, onMenu }: { room: PublicRoomState; mySeat: Seat; onMenu: () => void }) {
  const { t } = useSettings();
  const g = room.game;
  const myTeam = teamOf(mySeat);
  const target = room.settings.targetTokens;

  const TeamBox = ({ team }: { team: 'A' | 'B' }) => {
    const mine = team === myTeam;
    const tokens = room.tokens[team];
    return (
      <div
        className={`flex min-w-0 flex-1 flex-col rounded-xl px-2 py-1 ring-1 ${
          team === 'A' ? 'bg-sky-500/10 ring-sky-400/40' : 'bg-rose-500/10 ring-rose-400/40'
        } ${mine ? '' : ''}`}
      >
        <div className="flex items-center justify-between gap-1">
          <span className={`truncate text-[11px] font-bold uppercase tracking-wide ${team === 'A' ? 'text-sky-200' : 'text-rose-200'}`}>
            {t(`team.${team}`)}
            {mine && <span className="text-gold-300"> · {t('common.you')}</span>}
          </span>
          <span className="shrink-0 text-[11px] text-white/70" title={t('game.tricks')}>
            🂠 {g ? g.tricks[team] : 0}
          </span>
        </div>
        <div className="flex items-end gap-1.5">
          <span key={tokens} className="token-new font-display text-2xl font-extrabold leading-none text-gold-300">
            {tokens}
          </span>
          <span className="mb-0.5 text-[11px] text-white/50">/ {target}</span>
        </div>
        <div className="score-bar mt-1 h-1 overflow-hidden rounded-full bg-black/40">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300 transition-all duration-700"
            style={{ width: `${Math.min(100, (tokens / target) * 100)}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="scoreboard mx-auto flex w-full max-w-4xl items-stretch gap-1.5 px-2 pt-[calc(env(safe-area-inset-top)+6px)] pb-1.5 sm:gap-3 sm:px-4">
      <TeamBox team="A" />
      <div className="flex shrink-0 flex-col items-center justify-center rounded-xl bg-black/30 px-2 py-1 ring-1 ring-gold-500/30">
        <span className="text-[10px] uppercase tracking-wider text-gold-200/70">{t('game.trump')}</span>
        {g?.trump ? (
          <span key={g.trump} className={`anim-pop text-3xl leading-none ${SUIT_IS_RED[g.trump] ? 'text-red-500' : 'text-white'} drop-shadow`}>
            {SUIT_SYMBOL[g.trump]}
          </span>
        ) : (
          <span className="text-xl leading-none text-white/40">?</span>
        )}
        <span className="mt-0.5 text-[10px] text-white/60">{g ? t('game.hand', { n: g.handNumber }) : ''}</span>
      </div>
      <TeamBox team="B" />
      <button className="btn btn-ghost !min-h-0 shrink-0 !rounded-xl !px-2.5" onClick={onMenu} aria-label={t('game.menu')}>
        ☰
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Seats around the table                                              */
/* ------------------------------------------------------------------ */

export function SeatBadge({
  player,
  game,
  pos,
  reaction,
}: {
  player?: PublicPlayer;
  game: PublicGameState;
  pos: RelPos;
  reaction?: ReactionId;
}) {
  const { t } = useSettings();
  if (!player) return null;
  const active = game.turn === player.seat && game.phase !== 'trick_review';
  const team = teamOf(player.seat);
  const vertical = pos === 1 || pos === 3;
  const count = player.cardCount;

  return (
    <div className={`seat-badge relative flex flex-col items-center gap-1 ${vertical ? 'seat-side' : ''}`}>
      <div className="relative">
        <Avatar avatar={player.avatar} size={46} connected={player.connected} active={active} />
        {game.dealer === player.seat && (
          <span className="absolute -left-2 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gold-400 text-[10px] font-extrabold text-felt-950 shadow" title={t('game.dealer')}>
            D
          </span>
        )}
        {reaction && <ReactionBubble reaction={reaction} />}
      </div>
      <div
        className={`max-w-[6.5rem] truncate rounded-full px-2 py-0.5 text-xs font-bold ${
          team === 'A' ? 'bg-sky-900/70 text-sky-100' : 'bg-rose-900/70 text-rose-100'
        } ${active ? 'ring-2 ring-gold-300' : ''}`}
      >
        {player.nickname}
      </div>
      {/* hidden hand: card backs only */}
      <div className="seat-backs flex h-7 items-center" aria-label={`${count} cards`}>
        {Array.from({ length: count }, (_, i) => (
          <PlayingCard key={i} faceDown width="18px" style={{ marginLeft: i ? -11 : 0 }} />
        ))}
      </div>
    </div>
  );
}

export function ReactionBubble({ reaction }: { reaction: ReactionId }) {
  const { t } = useSettings();
  const text = reaction.length <= 2 ? reaction : t(`reaction.${reaction}` as TranslationKey);
  return (
    <div className="anim-bubble pointer-events-none absolute -top-9 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-2xl bg-white px-2.5 py-1 text-sm font-bold text-felt-950 shadow-lg">
      <span className={reaction.length <= 2 ? 'text-2xl' : ''}>{text}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cards in the middle of the table                                    */
/* ------------------------------------------------------------------ */

const SLOT: Record<RelPos, { sx: string; sy: string; fx: string; fy: string; r: string }> = {
  0: { sx: '0px', sy: 'calc(var(--cw) * 0.5)', fx: '0px', fy: '38vh', r: '-3deg' },
  1: { sx: 'calc(var(--cw) * 0.72)', sy: '0px', fx: '45vw', fy: '0px', r: '6deg' },
  2: { sx: '0px', sy: 'calc(var(--cw) * -0.5)', fx: '0px', fy: '-30vh', r: '2deg' },
  3: { sx: 'calc(var(--cw) * -0.72)', sy: '0px', fx: '-45vw', fy: '0px', r: '-7deg' },
};
const TOWARD: Record<RelPos, { wx: string; wy: string }> = {
  0: { wx: '0px', wy: '30vh' },
  1: { wx: '40vw', wy: '0px' },
  2: { wx: '0px', wy: '-26vh' },
  3: { wx: '-40vw', wy: '0px' },
};

export function TrickArea({ game, mySeat, players }: { game: PublicGameState; mySeat: Seat; players: PublicPlayer[] }) {
  const { t } = useSettings();
  const winner = game.trickWinner;
  const reviewing = game.phase === 'trick_review' && winner !== null;
  const winnerName = reviewing ? players.find((p) => p.seat === winner)?.nickname : null;

  return (
    <div className="pointer-events-none absolute inset-0" style={{ '--cw': 'min(clamp(52px, 15vw, 92px), 15vh)' } as CSSProperties}>
      {game.currentTrick.map((pc) => {
        const pos = relPos(pc.seat, mySeat);
        const s = SLOT[pos];
        const w = reviewing ? TOWARD[relPos(winner as Seat, mySeat)] : { wx: '0px', wy: '0px' };
        return (
          <div
            key={`${game.handNumber}-${pc.card.id}`}
            className={`trick-slot ${reviewing ? 'collect' : ''}`}
            style={{ '--sx': s.sx, '--sy': s.sy, '--fx': s.fx, '--fy': s.fy, '--r': s.r, '--wx': w.wx, '--wy': w.wy, zIndex: 10 + game.currentTrick.indexOf(pc) } as CSSProperties}
          >
            <PlayingCard card={pc.card} className="trick-card" winner={reviewing && pc.seat === winner} />
          </div>
        );
      })}
      {winnerName && (
        <div className="anim-pop absolute left-1/2 top-[calc(50%+var(--cw)*1.35)] z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/70 px-3 py-1 text-sm font-bold text-gold-200 ring-1 ring-gold-400/50">
          🏆 {t('game.wonTrick', { name: winnerName })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* My hand                                                             */
/* ------------------------------------------------------------------ */

const SUIT_ORDER: Suit[] = ['S', 'H', 'C', 'D'];

export function sortHand(hand: Card[], trump: Suit | null): Card[] {
  const order = trump ? [trump, ...SUIT_ORDER.filter((s) => s !== trump)] : SUIT_ORDER;
  const rank = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'];
  return [...hand].sort((a, b) => order.indexOf(a.suit) - order.indexOf(b.suit) || rank.indexOf(a.rank) - rank.indexOf(b.rank));
}

export function HandView({
  hand,
  legal,
  game,
  mySeat,
  paused,
  onPlay,
}: {
  hand: Card[];
  legal: CardId[];
  game: PublicGameState;
  mySeat: Seat;
  paused: boolean;
  onPlay: (id: CardId) => Promise<boolean>;
}) {
  const { t } = useSettings();
  const { pushToast } = useGame();
  const [selected, setSelected] = useState<CardId | null>(null);
  const [pending, setPending] = useState(false);
  const seen = useRef<{ hand: number; ids: Set<string> }>({ hand: -1, ids: new Set() });
  const sorted = useMemo(() => sortHand(hand, game.trump), [hand, game.trump]);
  const myTurn = game.phase === 'playing' && game.turn === mySeat && !paused;
  const legalSet = useMemo(() => new Set(legal), [legal]);

  // Which cards are new (to animate the deal)?
  const fresh = useMemo(() => {
    const prev = seen.current.hand === game.handNumber ? seen.current.ids : new Set<string>();
    return new Set(sorted.filter((c) => !prev.has(c.id)).map((c) => c.id));
  }, [sorted, game.handNumber]);
  useEffect(() => {
    seen.current = { hand: game.handNumber, ids: new Set(hand.map((c) => c.id)) };
  }, [hand, game.handNumber]);

  useEffect(() => {
    if (!myTurn) setSelected(null);
  }, [myTurn]);

  async function tap(card: Card) {
    if (pending) return;
    if (game.phase !== 'playing') return;
    if (!myTurn) {
      pushToast(t('game.notYourTurn'));
      return;
    }
    if (!legalSet.has(card.id)) {
      const led = game.currentTrick[0]?.card.suit;
      pushToast(led ? t('game.mustFollow', { suit: `${SUIT_SYMBOL[led]} ${t(`suit.${led}`)}` }) : t('error.MUST_FOLLOW_SUIT'), 'error');
      return;
    }
    if (selected !== card.id) {
      setSelected(card.id);
      return;
    }
    setPending(true);
    const ok = await onPlay(card.id);
    setPending(false);
    if (ok) setSelected(null);
  }

  let freshIndex = 0;
  return (
    <div className="relative">
      {myTurn && selected && (
        <div className="anim-fade-up pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold-400 px-3 py-1 text-xs font-bold text-felt-950 shadow">
          👆 {t('game.tapAgain')}
        </div>
      )}
      <div className="hand pt-6">
        {sorted.map((card) => {
          const isLegal = legalSet.has(card.id);
          const isFresh = fresh.has(card.id);
          const delay = isFresh ? freshIndex++ * 70 : 0;
          return (
            <PlayingCard
              key={card.id}
              card={card}
              selected={selected === card.id}
              playable={myTurn && isLegal}
              dim={myTurn && !isLegal}
              className={isFresh ? 'anim-deal' : ''}
              style={isFresh ? { animationDelay: `${delay}ms` } : undefined}
              onClick={() => void tap(card)}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Trump selection                                                     */
/* ------------------------------------------------------------------ */

export function TrumpPicker({ onChoose }: { onChoose: (s: Suit) => Promise<unknown> }) {
  const { t } = useSettings();
  const [busy, setBusy] = useState(false);
  return (
    <div className="anim-pop panel absolute left-1/2 top-1/2 z-40 w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 p-4 text-center">
      <h3 className="font-display text-xl font-extrabold shimmer">{t('game.chooseTrump')}</h3>
      <p className="mt-1 text-xs text-gold-200/80">{t('game.chooseTrumpHint')}</p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {(['S', 'H', 'D', 'C'] as Suit[]).map((s) => (
          <button
            key={s}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onChoose(s);
              setBusy(false);
            }}
            className="flex aspect-[3/4] flex-col items-center justify-center rounded-2xl bg-gradient-to-b from-white to-[#efe6cf] shadow-lg ring-2 ring-gold-400/60 transition hover:scale-105 active:scale-95"
            aria-label={t(`suit.${s}`)}
          >
            <span className={`text-4xl sm:text-5xl ${SUIT_IS_RED[s] ? 'text-red-600' : 'text-neutral-900'}`}>{SUIT_SYMBOL[s]}</span>
            <span className="mt-1 text-[11px] font-bold text-neutral-700">{t(`suit.${s}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Big animated announcement whenever trumps are chosen. */
export function TrumpAnnouncement() {
  const { t } = useSettings();
  const [suit, setSuit] = useState<{ s: Suit; key: number } | null>(null);
  useGameEvents((e) => {
    if (e.type === 'trump_selected') {
      const key = Date.now();
      setSuit({ s: e.payload.suit, key });
      setTimeout(() => setSuit((cur) => (cur?.key === key ? null : cur)), 1900);
    }
  });
  if (!suit) return null;
  return (
    <div key={suit.key} className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
      <div className="anim-trump flex flex-col items-center rounded-3xl bg-black/70 px-8 py-5 ring-2 ring-gold-400/70">
        <span className={`text-8xl leading-none drop-shadow-lg ${SUIT_IS_RED[suit.s] ? 'text-red-500' : 'text-white'}`}>{SUIT_SYMBOL[suit.s]}</span>
        <span className="mt-2 font-display text-xl font-extrabold text-gold-300">{t('game.trumpIs', { suit: t(`suit.${suit.s}`) })}</span>
      </div>
    </div>
  );
}
