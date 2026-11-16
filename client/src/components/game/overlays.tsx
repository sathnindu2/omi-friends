import { useState } from 'react';
import { SUIT_IS_RED, SUIT_SYMBOL, teamOf } from '../../../../shared/rules';
import { REACTIONS, type HandResult, type PublicRoomState, type ReactionId, type Seat, type TeamId } from '../../../../shared/types';
import { useGame } from '../../context/GameContext';
import { useSettings } from '../../context/SettingsContext';
import { useNow } from '../../hooks/useNow';
import { navigate } from '../../lib/router';
import { LANGUAGES, type Lang, type TranslationKey } from '../../translations';
import { Avatar, Confetti, Modal, Segmented, Toggle } from '../ui';

function TeamName({ team, mySeat }: { team: TeamId; mySeat: Seat }) {
  const { t } = useSettings();
  return (
    <span className={team === 'A' ? 'text-sky-300' : 'text-rose-300'}>
      {t(`team.${team}`)}
      {teamOf(mySeat) === team ? ` (${t('team.yours')})` : ''}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Hand result                                                         */
/* ------------------------------------------------------------------ */

export function HandResultModal({ result, room, mySeat }: { result: HandResult; room: PublicRoomState; mySeat: Seat }) {
  const { t } = useSettings();
  const { clockOffset } = useGame();
  const now = useNow(250, clockOffset);
  const secs = room.game?.nextHandAt ? Math.max(0, Math.ceil((room.game.nextHandAt - now) / 1000)) : null;
  const iWon = result.winner && teamOf(mySeat) === result.winner;

  return (
    <Modal>
      {result.kapothi && <Confetti count={70} />}
      <div className="text-center">
        <div className="text-xs uppercase tracking-widest text-gold-200/70">{t('result.title', { n: result.handNumber })}</div>
        {result.kapothi ? (
          <h3 className="anim-pop mt-2 font-display text-4xl font-extrabold shimmer">{t('result.kapothi')}</h3>
        ) : null}
        <h3 className="mt-2 font-display text-2xl font-extrabold text-white">
          {result.draw ? (
            t('result.draw')
          ) : (
            <>
              {iWon ? '🎉 ' : ''}
              {t('result.wins').split('{team}')[0]}
              <TeamName team={result.winner as TeamId} mySeat={mySeat} />
              {t('result.wins').split('{team}')[1]}
            </>
          )}
        </h3>

        {result.announcedFailed && result.announcedBy && (
          <p className="mt-2 rounded-lg bg-red-900/50 px-3 py-1.5 text-sm text-red-100">
            {t('result.announcedFailed', { team: t(`team.${result.winner as TeamId}`) })}
          </p>
        )}

        {/* tricks */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          {(['A', 'B'] as TeamId[]).map((team) => (
            <div key={team} className={`rounded-2xl p-3 ring-1 ${team === 'A' ? 'bg-sky-500/10 ring-sky-400/40' : 'bg-rose-500/10 ring-rose-400/40'}`}>
              <div className="text-xs font-bold"><TeamName team={team} mySeat={mySeat} /></div>
              <div className="font-display text-4xl font-extrabold text-white">{result.tricks[team]}</div>
              <div className="text-[11px] text-white/60">{t('game.tricks')}</div>
              {result.winner === team && (
                <div className="token-new mt-1 inline-block rounded-full bg-gold-400 px-2 py-0.5 text-xs font-extrabold text-felt-950">
                  {result.totalTokens === 1 ? t('result.tokenWon') : t('result.tokensWon', { n: result.totalTokens })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-1 text-sm text-gold-200/80">
          <div>
            {t('game.trumps')}: <span className={SUIT_IS_RED[result.trump] ? 'text-red-400' : 'text-white'}>{SUIT_SYMBOL[result.trump]}</span>{' '}
            · {t('result.trumpTeam', { team: t(`team.${result.trumpTeam}`) })}
          </div>
          {result.winner && result.bonusTokens > 0 && (
            <div>
              {t('result.base')} +{result.baseTokens} · {t('result.bonusAdded')} +{result.bonusTokens}
            </div>
          )}
          {result.draw && <div className="font-semibold text-gold-300">{t('game.bonus', { n: result.pendingBonusAfter })}</div>}
        </div>

        <div className="mt-4 rounded-xl bg-black/30 p-2">
          <div className="text-[11px] uppercase tracking-wider text-white/50">{t('result.score')}</div>
          <div className="font-display text-xl font-bold">
            <span className="text-sky-300">{result.tokensAfter.A}</span>
            <span className="mx-2 text-white/40">–</span>
            <span className="text-rose-300">{result.tokensAfter.B}</span>
          </div>
        </div>

        {secs !== null && <p className="mt-3 text-sm text-gold-200/80">{t('result.nextHand', { s: secs })}</p>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Match result                                                        */
/* ------------------------------------------------------------------ */

export function MatchResultModal({ room, mySeat, myId }: { room: PublicRoomState; mySeat: Seat; myId: string }) {
  const { t } = useSettings();
  const { act } = useGame();
  const [busy, setBusy] = useState(false);
  const m = room.match;
  if (!m) return null;
  const winners = room.players.filter((p) => teamOf(p.seat) === m.winner);
  const voted = room.rematchVotes.includes(myId);

  return (
    <Modal wide>
      <Confetti count={90} />
      <div className="text-center">
        <div className="text-5xl">{teamOf(mySeat) === m.winner ? '🏆' : '👏'}</div>
        <div className="mt-1 text-xs uppercase tracking-widest text-gold-200/70">{t('match.title')}</div>
        <h3 className="mt-1 font-display text-3xl font-extrabold shimmer">{t('match.wins', { team: t(`team.${m.winner}`) })}</h3>
        <div className="mt-4 flex justify-center gap-6">
          {winners.map((p) => (
            <div key={p.playerId} className="flex flex-col items-center gap-1">
              <Avatar avatar={p.avatar} size={56} connected={p.connected} active />
              <span className="font-bold">{p.nickname}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          <Stat label={`${t('match.finalScore')} (A–B)`} value={`${m.tokens.A} – ${m.tokens.B}`} />
          <Stat label={t('match.handsPlayed')} value={String(m.handsPlayed)} />
          <Stat label={`${t('match.kapothis')} (A–B)`} value={`${m.kapothis.A} – ${m.kapothis.B}`} />
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <button
            className="btn btn-gold w-full text-lg"
            disabled={busy || voted}
            onClick={async () => {
              setBusy(true);
              await act('request_rematch', {});
              setBusy(false);
            }}
          >
            🔁 {t('match.rematch')}
          </button>
          <p className="text-sm text-gold-200/80">{t('match.rematchVotes', { n: room.rematchVotes.length })}</p>
          <button className="btn btn-ghost w-full" disabled={busy} onClick={() => act('return_to_lobby', {})}>
            {t('match.lobby')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/30 p-2">
      <div className="font-display text-xl font-bold text-gold-300">{value}</div>
      <div className="text-[11px] text-white/60">{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Paused (someone disconnected)                                       */
/* ------------------------------------------------------------------ */

export function PausedBanner({ room, myId }: { room: PublicRoomState; myId: string }) {
  const { t } = useSettings();
  const { act, clockOffset } = useGame();
  const now = useNow(1000, clockOffset);
  const missing = room.players.filter((p) => !p.connected);
  const canAbandon = room.abandonAvailableAt !== null && now >= room.abandonAvailableAt;
  const connectedCount = room.players.filter((p) => p.connected).length;
  const voted = room.abandonVotes.includes(myId);
  if (!room.paused) return null;
  return (
    <div className="absolute inset-x-0 top-2 z-40 flex justify-center px-3">
      <div className="anim-pop panel flex max-w-sm flex-col items-center gap-2 p-3 text-center">
        <div className="flex items-center gap-2 font-bold text-gold-300">
          <span className="spinner !h-4 !w-4 !border-2" /> {t('game.paused')}
        </div>
        <p className="text-sm">{t('game.waitingReconnect', { names: missing.map((p) => p.nickname).join(', ') })}</p>
        {canAbandon && (
          <>
            <button className="btn btn-danger btn-sm" disabled={voted} onClick={() => act('vote_abandon', {})}>
              {t('game.abandon')}
            </button>
            <span className="text-xs text-white/60">{t('game.abandonVotes', { n: room.abandonVotes.length, total: connectedCount })}</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* In-game menu                                                        */
/* ------------------------------------------------------------------ */

export function GameMenu({ onClose }: { onClose: () => void }) {
  const { t, settings, update } = useSettings();
  const { leave } = useGame();
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal onClose={onClose}>
      <h3 className="mb-4 font-display text-xl font-bold text-gold-300">{t('game.menu')}</h3>
      <div className="space-y-4">
        <Segmented<Lang>
          value={settings.lang}
          onChange={(lang) => update({ lang })}
          options={(Object.keys(LANGUAGES) as Lang[]).map((l) => ({ value: l, label: LANGUAGES[l].label }))}
        />
        <div className="flex items-center justify-between">
          <span>{t('settings.sound')}</span>
          <Toggle checked={settings.sound} onChange={(sound) => update({ sound })} label={t('settings.sound')} />
        </div>
        <div className="flex items-center justify-between">
          <span>{t('settings.reduced')}</span>
          <Toggle checked={settings.reducedMotion} onChange={(reducedMotion) => update({ reducedMotion })} label={t('settings.reduced')} />
        </div>
        <button className="btn btn-ghost w-full" onClick={() => navigate('/how-to-play')}>
          📖 {t('settings.help')}
        </button>
        {confirm ? (
          <div className="rounded-xl bg-red-900/40 p-3 text-sm">
            <p>{t('game.leaveConfirm')}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)}>
                {t('common.cancel')}
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={async () => {
                  await leave();
                  navigate('/');
                }}
              >
                {t('game.leave')}
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-danger w-full" onClick={() => setConfirm(true)}>
            🚪 {t('game.leave')}
          </button>
        )}
        <button className="btn btn-ghost w-full" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Reactions                                                           */
/* ------------------------------------------------------------------ */

export function ReactionsButton() {
  const { t } = useSettings();
  const { act } = useGame();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button className="btn btn-ghost !min-h-[42px] !rounded-full !px-3 text-lg" onClick={() => setOpen((o) => !o)} aria-label={t('game.reactions')} aria-expanded={open}>
        😊
      </button>
      {open && (
        <div className="anim-pop panel absolute bottom-12 right-0 z-50 grid w-56 grid-cols-3 gap-1.5 p-2">
          {REACTIONS.map((r: ReactionId) => (
            <button
              key={r}
              className={`rounded-xl bg-white/5 px-1 py-2 hover:bg-white/15 ${r.length <= 2 ? 'text-2xl' : 'col-span-3 text-sm font-semibold'}`}
              onClick={() => {
                void act('send_reaction', { reaction: r });
                setOpen(false);
              }}
            >
              {r.length <= 2 ? r : t(`reaction.${r}` as TranslationKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
