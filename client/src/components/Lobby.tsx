import { useState } from 'react';
import { teamOf } from '../../../shared/rules';
import type { PublicPlayer, RoomSnapshot, Seat } from '../../../shared/types';
import { useGame } from '../context/GameContext';
import { useSettings } from '../context/SettingsContext';
import { copyText, inviteLink } from '../lib/clipboard';
import { navigate } from '../lib/router';
import { Avatar, Logo, Segmented, Toggle } from './ui';

/** Seat layout in the lobby: Player 3 top, Player 2 right, Player 1 bottom, Player 4 left. */
const SEAT_POS: Record<Seat, string> = {
  2: 'col-start-2 row-start-1',
  3: 'col-start-1 row-start-2',
  1: 'col-start-3 row-start-2',
  0: 'col-start-2 row-start-3',
};

export function Lobby({ snapshot }: { snapshot: RoomSnapshot }) {
  const { t } = useSettings();
  const { act, leave, pushToast } = useGame();
  const { room, you } = snapshot;
  const me = room.players.find((p) => p.playerId === you.playerId);
  const isHost = room.hostId === you.playerId;
  const bySeat = (s: Seat) => room.players.find((p) => p.seat === s);
  const allReady = room.players.length === 4 && room.players.every((p) => p.ready && p.connected);
  const [busy, setBusy] = useState(false);
  const link = inviteLink(room.code);

  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    await fn();
    setBusy(false);
  }

  async function copy(text: string) {
    pushToast((await copyText(text)) ? t('common.copied') : text, 'success');
  }

  const shareText = t('lobby.whatsappText', { code: room.code, link });

  return (
    <div className="felt min-h-full safe-area">
      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-10 pt-4">
        <div className="flex items-center justify-between">
          <button className="btn btn-ghost btn-sm" onClick={() => run(async () => { await leave(); navigate('/'); })}>
            ← {t('lobby.leave')}
          </button>
          <Logo size="sm" />
        </div>

        {/* Room code + invite */}
        <section className="panel anim-fade-up p-5 text-center">
          <div className="text-xs font-semibold uppercase tracking-widest text-gold-200/80">{t('lobby.roomCode')}</div>
          <button
            className="mt-1 font-mono text-5xl font-extrabold tracking-[0.25em] text-gold-300 drop-shadow"
            onClick={() => copy(room.code)}
            aria-label={t('lobby.copyCode')}
          >
            {room.code}
          </button>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="btn btn-ghost btn-sm" onClick={() => copy(room.code)}>
              📋 {t('lobby.copyCode')}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => copy(link)}>
              🔗 {t('lobby.copyLink')}
            </button>
          </div>
          <a
            className="btn btn-sm mt-2 w-full !bg-[#25D366] !text-white"
            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            💬 {t('lobby.whatsapp')}
          </a>
          {'share' in navigator && (
            <button
              className="btn btn-ghost btn-sm mt-2 w-full"
              onClick={() => navigator.share({ title: 'OMI FRIENDS', text: shareText }).catch(() => {})}
            >
              📤 Share…
            </button>
          )}
        </section>

        {/* Seats */}
        <section className="panel anim-fade-up p-4" style={{ animationDelay: '0.08s' }}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-gold-300">
              {room.players.length < 4 ? t('lobby.waitingPlayers') : `${room.players.length}/4`}
            </h3>
            <span className="text-xs text-white/60">{t('lobby.partnersOpposite')}</span>
          </div>
          <div className="table-oval grid grid-cols-3 grid-rows-3 place-items-center gap-1 p-2 sm:gap-2">
            {([0, 1, 2, 3] as Seat[]).map((seat) => (
              <div key={seat} className={`${SEAT_POS[seat]} w-full`}>
                <SeatCard
                  seat={seat}
                  player={bySeat(seat)}
                  isMe={bySeat(seat)?.playerId === you.playerId}
                  canMove={!bySeat(seat)}
                  canRemove={isHost && !!bySeat(seat) && bySeat(seat)?.playerId !== you.playerId}
                  onMove={() => run(() => act('select_seat', { seat }))}
                  onRemove={(id) => run(() => act('remove_player', { playerId: id }))}
                />
              </div>
            ))}
            <div className="col-start-2 row-start-2 text-center text-[11px] leading-tight text-gold-200/80">
              <div><span className="font-bold text-sky-300">{t('team.A')}</span>: P1 + P3</div>
              <div><span className="font-bold text-rose-300">{t('team.B')}</span>: P2 + P4</div>
            </div>
          </div>
        </section>

        {/* Settings */}
        <section className="panel anim-fade-up space-y-4 p-4" style={{ animationDelay: '0.16s' }}>
          <h3 className="font-display font-bold text-gold-300">{t('lobby.settings')}</h3>
          <div>
            <span className="mb-2 block text-sm text-gold-200">{t('create.target')}</span>
            {isHost ? (
              <Segmented<5 | 10>
                value={room.settings.targetTokens}
                onChange={(v) => run(() => act('update_settings', { targetTokens: v }))}
                options={[
                  { value: 10, label: t('create.tokens', { n: 10 }) },
                  { value: 5, label: t('create.tokens', { n: 5 }) },
                ]}
              />
            ) : (
              <div className="font-semibold">{t('create.tokens', { n: room.settings.targetTokens })}</div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gold-200">{t('settings.kapothiVariation')}</span>
            {isHost ? (
              <Toggle
                checked={room.settings.announcedKapothi}
                onChange={(v) => run(() => act('update_settings', { announcedKapothi: v }))}
                label={t('settings.kapothiVariation')}
              />
            ) : (
              <span className="font-semibold">{room.settings.announcedKapothi ? t('common.on') : t('common.off')}</span>
            )}
          </div>
        </section>

        {/* Ready / Start */}
        <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 bg-gradient-to-t from-felt-950 via-felt-950/90 to-transparent px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-6">
          <button
            className={`btn w-full text-lg ${me?.ready ? 'btn-ghost' : 'btn-gold'}`}
            disabled={busy}
            onClick={() => run(() => act('player_ready', { ready: !me?.ready }))}
          >
            {me?.ready ? `✓ ${t('lobby.ready')} · ${t('lobby.cancelReady')}` : `✋ ${t('lobby.imReady')}`}
          </button>
          {isHost ? (
            <>
              <button className="btn btn-gold w-full text-lg" disabled={!allReady || busy} onClick={() => run(() => act('start_game', {}))}>
                ▶ {t('lobby.start')}
              </button>
              {!allReady && <p className="text-center text-xs text-gold-200/70">{t('lobby.startHint')}</p>}
            </>
          ) : (
            <p className="text-center text-sm text-gold-200/80">{t('lobby.onlyHostStarts')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SeatCard({
  seat,
  player,
  isMe,
  canMove,
  canRemove,
  onMove,
  onRemove,
}: {
  seat: Seat;
  player?: PublicPlayer;
  isMe: boolean;
  canMove: boolean;
  canRemove: boolean;
  onMove: () => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useSettings();
  const team = teamOf(seat);
  const ring = team === 'A' ? 'ring-sky-400/60' : 'ring-rose-400/60';
  return (
    <div className={`relative mx-auto flex w-full max-w-[9.5rem] flex-col items-center gap-1 rounded-2xl bg-black/35 p-2 text-center ring-1 ${ring} ${isMe ? '!ring-2 !ring-gold-300' : ''}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">
        {t('common.player', { n: seat + 1 })} · {team}
      </div>
      {player ? (
        <>
          <Avatar avatar={player.avatar} size={40} connected={player.connected} />
          <div className="w-full truncate text-sm font-bold">
            {player.nickname}
            {isMe && <span className="text-gold-300"> ({t('common.you')})</span>}
          </div>
          <div className="flex flex-wrap justify-center gap-1">
            {player.isHost && <span className="chip bg-gold-400/25 text-gold-200">👑 {t('common.host')}</span>}
            {!player.connected ? (
              <span className="chip bg-red-500/25 text-red-200">{t('lobby.disconnected')}</span>
            ) : player.ready ? (
              <span className="chip bg-emerald-500/25 text-emerald-200">✓ {t('lobby.ready')}</span>
            ) : (
              <span className="chip bg-white/10 text-white/70">{t('lobby.notReady')}</span>
            )}
          </div>
          {canRemove && (
            <button
              className="absolute -right-1 -top-1 h-6 w-6 rounded-full bg-red-600 text-xs font-bold text-white shadow"
              onClick={() => onRemove(player.playerId)}
              aria-label={`${t('lobby.remove')} ${player.nickname}`}
              title={t('lobby.remove')}
            >
              ✕
            </button>
          )}
        </>
      ) : (
        <>
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-white/25 text-white/40">?</div>
          <div className="text-sm text-white/50">{t('lobby.waiting')}</div>
          {canMove && (
            <button className="chip bg-gold-400/20 text-gold-200 hover:bg-gold-400/35" onClick={onMove}>
              {t('lobby.sitHere')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
