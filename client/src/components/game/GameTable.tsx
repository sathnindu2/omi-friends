import { useState } from 'react';
import { teamOf } from '../../../../shared/rules';
import type { CardId, RoomSnapshot, Seat, Suit } from '../../../../shared/types';
import { useGame } from '../../context/GameContext';
import { useSettings } from '../../context/SettingsContext';
import { storage } from '../../lib/storage';
import { Avatar } from '../ui';
import { GameMenu, HandResultModal, MatchResultModal, PausedBanner, ReactionsButton } from './overlays';
import { HandView, ReactionBubble, relPos, Scoreboard, SeatBadge, TrickArea, TrumpAnnouncement, TrumpPicker } from './parts';

/**
 * The Omi table. The view is rotated so that YOU are always at the bottom and
 * your partner is at the top. Turn order (counter-clockwise) therefore always
 * runs bottom → right → top → left.
 */
export function GameTable({ snapshot }: { snapshot: RoomSnapshot }) {
  const { t } = useSettings();
  const { act, reactions } = useGame();
  const { room, you } = snapshot;
  const g = room.game;
  const [menu, setMenu] = useState(false);
  const [rotateHintHidden, setRotateHintHidden] = useState(() => storage.read('omi.rotateHintHidden', false));

  if (!g) return null;
  const mySeat = you.seat;
  const at = (pos: number) => room.players.find((p) => relPos(p.seat, mySeat) === pos);
  const me = at(0);
  const reactionOf = (seat?: Seat) => reactions.find((r) => r.seat === seat)?.reaction;
  const turnPlayer = g.turn !== null ? room.players.find((p) => p.seat === g.turn) : undefined;
  const myTurn = g.turn === mySeat && !room.paused;
  const selector = room.players.find((p) => p.seat === g.trumpSelector);
  const canAnnounce = g.canAnnounceKapothiTeam !== null && g.canAnnounceKapothiTeam === teamOf(mySeat) && !room.paused;

  let status: string | null = null;
  if (room.status === 'playing' && !room.paused) {
    if (g.phase === 'trump_selection' && g.trumpSelector !== mySeat) status = t('game.waitingTrump', { name: selector?.nickname ?? '' });
    else if (g.phase === 'playing' && !myTurn && turnPlayer) status = t('game.turnOf', { name: turnPlayer.nickname });
  }

  async function playCard(id: CardId) {
    const res = await act('play_card', { cardId: id });
    return res.ok;
  }

  return (
    <div className="felt fixed inset-0 flex flex-col overflow-hidden select-none">
      <Scoreboard room={room} mySeat={mySeat} onMenu={() => setMenu(true)} />

      {room.pendingBonus > 0 && (
        <div className="mx-auto -mt-0.5 mb-0.5 rounded-full bg-gold-400/20 px-3 py-0.5 text-[11px] font-bold text-gold-200 ring-1 ring-gold-400/40">
          ⭐ {t('game.bonus', { n: room.pendingBonus })}
        </div>
      )}

      {!rotateHintHidden && (
        <button
          className="mx-auto mb-0.5 rounded-full bg-black/50 px-3 py-1 text-[11px] text-gold-200 ring-1 ring-gold-400/30 landscape:hidden sm:hidden"
          onClick={() => {
            storage.write('omi.rotateHintHidden', true);
            setRotateHintHidden(true);
          }}
        >
          📱↻ {t('game.rotateHint')} ✕
        </button>
      )}

      {/* Table */}
      <div className="relative min-h-0 flex-1 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <div className="table-oval absolute inset-x-3 inset-y-2 sm:inset-x-10" />

        {/* partner (top) */}
        <div className="seat-top absolute left-1/2 top-1 z-10 -translate-x-1/2">
          <SeatBadge player={at(2)} game={g} pos={2} reaction={reactionOf(at(2)?.seat)} />
        </div>
        {/* left opponent */}
        <div className="absolute left-1 top-1/2 z-10 -translate-y-1/2 sm:left-6">
          <SeatBadge player={at(3)} game={g} pos={3} reaction={reactionOf(at(3)?.seat)} />
        </div>
        {/* right opponent */}
        <div className="absolute right-1 top-1/2 z-10 -translate-y-1/2 sm:right-6">
          <SeatBadge player={at(1)} game={g} pos={1} reaction={reactionOf(at(1)?.seat)} />
        </div>

        <TrickArea game={g} mySeat={mySeat} players={room.players} />

        {status && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 flex justify-center">
            <div className="anim-fade-up rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-gold-200 ring-1 ring-gold-500/30 sm:text-sm">
              {status}
            </div>
          </div>
        )}

        {g.phase === 'trump_selection' && g.trumpSelector === mySeat && room.status === 'playing' && !room.paused && (
          <TrumpPicker onChoose={(suit: Suit) => act('choose_trump', { suit })} />
        )}

        {canAnnounce && (
          <div className="absolute inset-x-0 bottom-12 z-30 flex justify-center">
            <button className="btn btn-gold anim-pop turn-glow" onClick={() => act('announce_kapothi', {})}>
              📣 {t('game.announceKapothi')}
            </button>
          </div>
        )}

        <PausedBanner room={room} myId={you.playerId} />
      </div>

      {/* Me */}
      <div className="relative z-20 pb-[calc(env(safe-area-inset-bottom)+6px)]">
        <div className="flex items-center justify-between gap-2 px-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative">
              <Avatar avatar={me?.avatar ?? 'elephant'} size={34} connected active={myTurn} />
              {g.dealer === mySeat && (
                <span className="absolute -left-1.5 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold-400 text-[9px] font-extrabold text-felt-950">
                  D
                </span>
              )}
              {reactionOf(mySeat) && <ReactionBubble reaction={reactionOf(mySeat)!} />}
            </div>
            <span className={`truncate text-sm font-bold ${teamOf(mySeat) === 'A' ? 'text-sky-200' : 'text-rose-200'}`}>
              {me?.nickname} <span className="text-white/50">({t('common.you')})</span>
            </span>
          </div>
          {myTurn && g.phase === 'playing' && (
            <span className="turn-glow anim-pop shrink-0 rounded-full bg-gold-400 px-3 py-1 text-sm font-extrabold text-felt-950">
              ⭐ {t('game.yourTurn')}
            </span>
          )}
          <ReactionsButton />
        </div>
        <HandView hand={you.hand} legal={you.legalCardIds} game={g} mySeat={mySeat} paused={room.paused} onPlay={playCard} />
      </div>

      <TrumpAnnouncement />
      {g.phase === 'hand_complete' && g.lastHandResult && room.status === 'playing' && (
        <HandResultModal result={g.lastHandResult} room={room} mySeat={mySeat} />
      )}
      {room.status === 'match_complete' && <MatchResultModal room={room} mySeat={mySeat} myId={you.playerId} />}
      {menu && <GameMenu onClose={() => setMenu(false)} />}
    </div>
  );
}
