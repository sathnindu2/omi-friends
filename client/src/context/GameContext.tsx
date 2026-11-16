import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  AckResponse,
  ClientToServerEvents,
  GameError,
  ReactionId,
  RoomSettings,
  RoomSnapshot,
  Seat,
  ServerToClientEvents,
  SessionInfo,
} from '../../../shared/types';
import { navigate } from '../lib/router';
import { request, socket } from '../lib/socket';
import { playSound, unlockAudio } from '../lib/sound';
import { storage, type Profile } from '../lib/storage';
import type { TranslationKey } from '../translations';
import { useSettings } from './SettingsContext';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

export interface ReactionBubble {
  id: number;
  seat: Seat;
  reaction: ReactionId;
}

type AnyEvent = {
  [K in keyof ServerToClientEvents]: { type: K; payload: Parameters<ServerToClientEvents[K]>[0] };
}[keyof ServerToClientEvents];

type Listener = (e: AnyEvent) => void;

interface GameCtx {
  connected: boolean;
  snapshot: RoomSnapshot | null;
  session: SessionInfo | null;
  restoring: boolean;
  restoreError: GameError | null;
  clockOffset: number;
  toasts: Toast[];
  reactions: ReactionBubble[];
  pushToast: (text: string, kind?: Toast['kind']) => void;
  errorText: (e: GameError) => string;
  createRoom: (profile: Profile, settings: Partial<RoomSettings>) => Promise<AckResponse<SessionInfo>>;
  joinRoom: (code: string, profile: Profile) => Promise<AckResponse<SessionInfo>>;
  enterRoom: (code: string) => void;
  act: <E extends keyof ClientToServerEvents>(
    event: E,
    payload: Parameters<ClientToServerEvents[E]>[0],
  ) => Promise<AckResponse<unknown>>;
  leave: () => Promise<void>;
  subscribe: (l: Listener) => () => void;
}

const GameContext = createContext<GameCtx | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const { t } = useSettings();
  const [connected, setConnected] = useState(socket.connected);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<GameError | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [reactions, setReactions] = useState<ReactionBubble[]>([]);
  const listeners = useRef(new Set<Listener>());
  const sessionRef = useRef<SessionInfo | null>(null);
  const snapshotRef = useRef<RoomSnapshot | null>(null);
  const tRef = useRef(t);
  tRef.current = t;
  sessionRef.current = session;
  snapshotRef.current = snapshot;

  const pushToast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 3500);
  }, []);

  const errorText = useCallback(
    (e: GameError) => (e.message === 'TIMEOUT' ? t('error.TIMEOUT') : t(`error.${e.code}` as TranslationKey)),
    [t],
  );

  const restore = useCallback(async (s: SessionInfo) => {
    setRestoring(true);
    setRestoreError(null);
    const res = await request('reconnect_player', { code: s.roomCode, sessionToken: s.sessionToken });
    setRestoring(false);
    if (!res.ok) {
      if (res.error.message !== 'TIMEOUT') {
        storage.clearSession(s.roomCode);
        setSession(null);
        setSnapshot(null);
      }
      setRestoreError(res.error);
    }
  }, []);

  // Socket lifecycle + server events
  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      if (sessionRef.current) void restore(sessionRef.current);
    };
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    const emit = (e: AnyEvent) => listeners.current.forEach((l) => l(e));

    const handlers: Partial<{ [K in keyof ServerToClientEvents]: ServerToClientEvents[K] }> = {
      room_updated: (s) => {
        setSnapshot(s);
        setClockOffset(s.room.serverTime - Date.now());
      },
      player_joined: (p) => pushToast(tRef.current('event.joined', { name: p.nickname })),
      player_left: (p) => pushToast(tRef.current('event.left', { name: p.nickname })),
      player_disconnected: (p) => pushToast(tRef.current('event.disconnected', { name: p.nickname }), 'error'),
      player_reconnected: (p) => pushToast(tRef.current('event.reconnected', { name: p.nickname }), 'success'),
      hand_dealt: (p) => playSound(p.round === 1 ? 'shuffle' : 'deal'),
      trump_selected: () => playSound('trump'),
      card_played: () => playSound('play'),
      trick_completed: () => setTimeout(() => playSound('trick'), 350),
      player_turn: (p) => {
        if (snapshotRef.current?.you.seat === p.seat) setTimeout(() => playSound('turn'), 150);
      },
      hand_completed: (r) => {
        if (r.kapothi) playSound('kapothi');
      },
      match_completed: () => playSound('win'),
      kapothi_announced: (p) => pushToast(tRef.current('game.kapothiAnnounced', { team: tRef.current(`team.${p.team}`) }), 'success'),
      reaction: (p) => {
        const id = Date.now() + Math.random();
        setReactions((r) => [...r.filter((x) => x.seat !== p.seat), { id, seat: p.seat, reaction: p.reaction }]);
        setTimeout(() => setReactions((r) => r.filter((x) => x.id !== id)), 3000);
      },
      kicked: (p) => {
        const code = sessionRef.current?.roomCode ?? snapshotRef.current?.room.code;
        // If another tab took over, keep the saved token: that tab is still using it.
        if (code && p.reason !== 'session_replaced') storage.clearSession(code);
        setSession(null);
        setSnapshot(null);
        pushToast(tRef.current(`event.kicked.${p.reason}` as TranslationKey), 'error');
        navigate('/', { replace: true });
      },
    };

    const allEvents: (keyof ServerToClientEvents)[] = [
      'room_updated', 'player_joined', 'player_left', 'player_disconnected', 'player_reconnected', 'game_started',
      'hand_dealt', 'trump_required', 'trump_selected', 'player_turn', 'card_played', 'trick_completed',
      'kapothi_announced', 'hand_completed', 'score_updated', 'match_completed', 'reaction', 'kicked', 'game_error',
    ];
    const bound = allEvents.map((type) => {
      const fn = (payload: never) => {
        (handlers[type] as ((p: unknown) => void) | undefined)?.(payload);
        emit({ type, payload } as AnyEvent);
      };
      socket.on(type, fn as never);
      return [type, fn] as const;
    });

    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      for (const [type, fn] of bound) socket.off(type, fn as never);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [pushToast, restore]);

  const adopt = useCallback((s: SessionInfo) => {
    storage.setSession(s);
    setSession(s);
    setRestoreError(null);
  }, []);

  const createRoom = useCallback(
    async (profile: Profile, settings: Partial<RoomSettings>) => {
      const res = await request('create_room', { nickname: profile.nickname, avatar: profile.avatar, settings });
      if (res.ok) adopt(res.data);
      return res;
    },
    [adopt],
  );

  const joinRoom = useCallback(
    async (code: string, profile: Profile) => {
      const res = await request('join_room', { code, nickname: profile.nickname, avatar: profile.avatar });
      if (res.ok) adopt(res.data);
      return res;
    },
    [adopt],
  );

  /** Called by the room page: make sure we are (re)attached to this room. */
  const enterRoom = useCallback(
    (code: string) => {
      const upper = code.toUpperCase();
      if (sessionRef.current?.roomCode === upper) return;
      const stored = storage.getSession(upper);
      if (!stored) {
        setRestoreError({ code: 'SESSION_INVALID', message: '' });
        return;
      }
      setSnapshot(null);
      setSession(stored);
      if (socket.connected) void restore(stored);
    },
    [restore],
  );

  const act = useCallback(
    async <E extends keyof ClientToServerEvents>(event: E, payload: Parameters<ClientToServerEvents[E]>[0]) => {
      const res = (await request(event, payload)) as AckResponse<unknown>;
      if (!res.ok) {
        playSound('error');
        pushToast(errorText(res.error), 'error');
      }
      return res;
    },
    [errorText, pushToast],
  );

  const leave = useCallback(async () => {
    const code = sessionRef.current?.roomCode;
    if (socket.connected) await request('leave_room', {});
    if (code) storage.clearSession(code);
    setSession(null);
    setSnapshot(null);
  }, []);

  const subscribe = useCallback((l: Listener) => {
    listeners.current.add(l);
    return () => {
      listeners.current.delete(l);
    };
  }, []);

  const value = useMemo(
    () => ({
      connected,
      snapshot,
      session,
      restoring,
      restoreError,
      clockOffset,
      toasts,
      reactions,
      pushToast,
      errorText,
      createRoom,
      joinRoom,
      enterRoom,
      act,
      leave,
      subscribe,
    }),
    [connected, snapshot, session, restoring, restoreError, clockOffset, toasts, reactions, pushToast, errorText, createRoom, joinRoom, enterRoom, act, leave, subscribe],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame outside provider');
  return ctx;
}

export function useGameEvents(listener: Listener) {
  const { subscribe } = useGame();
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => subscribe((e) => ref.current(e)), [subscribe]);
}
