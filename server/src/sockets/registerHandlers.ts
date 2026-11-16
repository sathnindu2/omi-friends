/**
 * Socket.IO adapter: validates every incoming message, applies rate limits,
 * forwards to the RoomManager and answers with an acknowledgement.
 */
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import type { Ack, ClientToServerEvents, GameError, ServerToClientEvents } from '../../../shared/types';
import { REACTIONS } from '../../../shared/types';
import { RuleError } from '../game/engine';
import type { RoomManager } from '../rooms/RoomManager';
import { RateLimiter } from '../security/security';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const empty = z.object({}).passthrough();
const nickname = z.string().max(64);
const avatar = z.string().max(32);
const code = z.string().max(64);

const schemas = {
  create_room: z.object({
    nickname,
    avatar,
    settings: z
      .object({ targetTokens: z.union([z.literal(5), z.literal(10)]).optional(), announcedKapothi: z.boolean().optional() })
      .optional(),
  }),
  join_room: z.object({ code, nickname, avatar }),
  reconnect_player: z.object({ code, sessionToken: z.string().max(200) }),
  select_seat: z.object({ seat: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]) }),
  player_ready: z.object({ ready: z.boolean() }),
  update_settings: z.object({
    targetTokens: z.union([z.literal(5), z.literal(10)]).optional(),
    announcedKapothi: z.boolean().optional(),
  }),
  remove_player: z.object({ playerId: z.string().max(64) }),
  start_game: empty,
  choose_trump: z.object({ suit: z.enum(['S', 'H', 'D', 'C']) }),
  play_card: z.object({ cardId: z.string().max(4) }),
  announce_kapothi: empty,
  request_rematch: empty,
  return_to_lobby: empty,
  vote_abandon: empty,
  send_reaction: z.object({ reaction: z.enum(REACTIONS) }),
  leave_room: empty,
} satisfies Record<keyof ClientToServerEvents, z.ZodTypeAny>;

export interface HandlerOptions {
  /** create_room per IP per minute */
  createLimit?: number;
  /** join/reconnect per IP per minute */
  joinLimit?: number;
  /** any event per socket per 10 seconds */
  eventLimit?: number;
}

export function clientIp(socket: Pick<ClientSocket, 'handshake'>, trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = socket.handshake.headers['x-forwarded-for'];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return socket.handshake.address || 'unknown';
}

export function registerHandlers(io: IO, rooms: RoomManager, trustProxy: boolean, opts: HandlerOptions = {}) {
  const createLimiter = new RateLimiter(opts.createLimit ?? 10, 60_000);
  const joinLimiter = new RateLimiter(opts.joinLimit ?? 40, 60_000);
  const eventLimiter = new RateLimiter(opts.eventLimit ?? 60, 10_000);
  const pruneTimer = setInterval(() => {
    createLimiter.prune();
    joinLimiter.prune();
    eventLimiter.prune();
  }, 60_000);
  pruneTimer.unref?.();

  io.on('connection', (socket: ClientSocket) => {
    const ip = clientIp(socket, trustProxy);

    function on<E extends keyof ClientToServerEvents>(
      event: E,
      handler: (payload: z.infer<(typeof schemas)[E]>) => unknown,
      limiter?: RateLimiter,
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.on(event as any, (payload: unknown, maybeAck: unknown) => {
        const ack: Ack<unknown> = typeof maybeAck === 'function' ? (maybeAck as Ack<unknown>) : () => {};
        const fail = (error: GameError) => {
          ack({ ok: false, error });
          socket.emit('game_error', error);
        };
        if (!eventLimiter.take(socket.id) || (limiter && !limiter.take(ip))) {
          return fail({ code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment.' });
        }
        const parsed = schemas[event].safeParse(payload ?? {});
        if (!parsed.success) return fail({ code: 'INVALID_INPUT', message: 'Invalid request.' });
        try {
          const data = handler(parsed.data as z.infer<(typeof schemas)[E]>);
          ack({ ok: true, data: data as never });
        } catch (e) {
          if (e instanceof RuleError) return fail({ code: e.code, message: e.message });
          console.error(`[socket] ${event} failed`, e);
          fail({ code: 'SERVER_ERROR', message: 'Something went wrong on the server.' });
        }
      });
    }

    on('create_room', (p) => rooms.createRoom(socket.id, p), createLimiter);
    on('join_room', (p) => rooms.joinRoom(socket.id, p), joinLimiter);
    on('reconnect_player', (p) => rooms.reconnect(socket.id, p), joinLimiter);
    on('select_seat', (p) => rooms.selectSeat(socket.id, p.seat));
    on('player_ready', (p) => rooms.setReady(socket.id, p.ready));
    on('update_settings', (p) => rooms.updateSettings(socket.id, p));
    on('remove_player', (p) => rooms.removePlayer(socket.id, p.playerId));
    on('start_game', () => rooms.startGame(socket.id));
    on('choose_trump', (p) => rooms.chooseTrump(socket.id, p.suit));
    on('play_card', (p) => rooms.playCard(socket.id, p.cardId));
    on('announce_kapothi', () => rooms.announceKapothi(socket.id));
    on('request_rematch', () => rooms.requestRematch(socket.id));
    on('return_to_lobby', () => rooms.returnToLobby(socket.id));
    on('vote_abandon', () => rooms.voteAbandon(socket.id));
    on('send_reaction', (p) => rooms.sendReaction(socket.id, p.reaction));
    on('leave_room', () => rooms.leaveRoom(socket.id));

    socket.on('disconnect', () => rooms.handleDisconnect(socket.id));
  });

  return {
    stop: () => clearInterval(pruneTimer),
  };
}
