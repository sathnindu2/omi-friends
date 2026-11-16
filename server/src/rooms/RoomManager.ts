/**
 * RoomManager owns every room, seat, session and game in memory.
 *
 * It is transport-agnostic: it talks to sockets only through the small
 * `Transport` interface, so it can be unit-tested without a network and
 * later backed by Redis or another store.
 *
 * Node.js runs this code on a single thread, and every method below runs to
 * completion before the next socket message is handled, so there are no
 * races between two players acting "at the same time".
 */
import type { RoomTimings } from '../config';
import {
  announceKapothi,
  chooseTrump,
  collectTrick,
  kapothiAnnounceableTeam,
  legalCardsFor,
  playCard,
  RuleError,
  secureRandomInt,
  startHand,
  type HandState,
  type RandomInt,
} from '../game/engine';
import { AVATAR_IDS, nextSeat, scoreHand, teamOf, teamSeats } from '../../../shared/rules';
import type {
  CardId,
  HandResult,
  MatchSummary,
  PublicGameState,
  PublicPlayer,
  ReactionId,
  RoomSettings,
  RoomSnapshot,
  RoomStatus,
  Seat,
  ServerToClientEvents,
  SessionInfo,
  Suit,
  TeamCounts,
} from '../../../shared/types';
import { REACTIONS } from '../../../shared/types';
import {
  generateId,
  generateRoomCode,
  generateSessionToken,
  hashToken,
  normalizeRoomCode,
  RateLimiter,
  sanitizeNickname,
  tokenMatches,
} from '../security/security';

export interface Transport {
  emit<E extends keyof ServerToClientEvents>(
    socketId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void;
  /** Force-close a socket (e.g. a duplicate session). */
  disconnect(socketId: string): void;
}

export interface Scheduler {
  now(): number;
  /** returns a cancel function */
  schedule(fn: () => void, ms: number): () => void;
}

export const realScheduler: Scheduler = {
  now: () => Date.now(),
  schedule(fn, ms) {
    const t = setTimeout(fn, ms);
    t.unref?.();
    return () => clearTimeout(t);
  },
};

interface PlayerRecord {
  playerId: string;
  nickname: string;
  avatar: string;
  seat: Seat;
  tokenHash: string;
  socketId: string | null;
  connected: boolean;
  disconnectedAt: number | null;
  ready: boolean;
}

interface Room {
  code: string;
  createdAt: number;
  lastActivity: number;
  emptySince: number | null;
  status: RoomStatus;
  settings: RoomSettings;
  hostId: string | null;
  seats: (PlayerRecord | null)[];
  tokens: TeamCounts;
  pendingBonus: number;
  handsPlayed: number;
  kapothis: TeamCounts;
  handHistory: HandResult[];
  hand: HandState | null;
  nextDealer: Seat;
  lastHandResult: HandResult | null;
  nextHandAt: number | null;
  match: MatchSummary | null;
  rematchVotes: Set<string>;
  abandonVotes: Set<string>;
  /** increases every time a game (re)starts, so stale timers can be ignored */
  gameEpoch: number;
  timers: {
    trick?: () => void;
    nextHand?: () => void;
    hostTransfer?: () => void;
    seatRelease: Map<string, () => void>;
  };
}

const DEFAULT_SETTINGS: RoomSettings = { targetTokens: 10, announcedKapothi: false };

function err(code: ConstructorParameters<typeof RuleError>[0], message: string): never {
  throw new RuleError(code, message);
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  /** socketId -> where that socket sits */
  private sockets = new Map<string, { code: string; playerId: string }>();
  /** codes of rooms that were cleaned up, to show "Room expired" */
  private expired = new Map<string, number>();
  private reactionLimiter = new RateLimiter(6, 5000);

  constructor(
    private transport: Transport,
    private timings: RoomTimings,
    private scheduler: Scheduler = realScheduler,
    private rand: RandomInt = secureRandomInt,
  ) {}

  /* ------------------------------------------------------------ */
  /* Public helpers (used by tests / health endpoint)              */
  /* ------------------------------------------------------------ */

  get roomCount() {
    return this.rooms.size;
  }

  hasRoom(code: string) {
    return this.rooms.has(code);
  }

  /** For tests only: inspect the authoritative hand. Never sent to clients. */
  debugHand(code: string): HandState | null {
    return this.rooms.get(code)?.hand ?? null;
  }

  /* ------------------------------------------------------------ */
  /* Joining, sessions and connections                             */
  /* ------------------------------------------------------------ */

  createRoom(
    socketId: string,
    p: { nickname: unknown; avatar: unknown; settings?: Partial<RoomSettings> },
  ): SessionInfo {
    const nickname = sanitizeNickname(p.nickname);
    if (!nickname) err('INVALID_NICKNAME', 'Please enter a nickname (1–16 characters).');
    this.detachSocket(socketId);

    let code = generateRoomCode();
    let attempts = 0;
    while (this.rooms.has(code) || this.expired.has(code)) {
      if (++attempts > 50) err('SERVER_ERROR', 'Could not create a room code. Please try again.');
      code = generateRoomCode();
    }

    const now = this.scheduler.now();
    const room: Room = {
      code,
      createdAt: now,
      lastActivity: now,
      emptySince: null,
      status: 'lobby',
      settings: this.cleanSettings(p.settings, DEFAULT_SETTINGS),
      hostId: null,
      seats: [null, null, null, null],
      tokens: { A: 0, B: 0 },
      pendingBonus: 0,
      handsPlayed: 0,
      kapothis: { A: 0, B: 0 },
      handHistory: [],
      hand: null,
      nextDealer: 0,
      lastHandResult: null,
      nextHandAt: null,
      match: null,
      rematchVotes: new Set(),
      abandonVotes: new Set(),
      gameEpoch: 0,
      timers: { seatRelease: new Map() },
    };
    this.rooms.set(code, room);
    const { player, token } = this.seatNewPlayer(room, socketId, nickname, p.avatar, 0);
    room.hostId = player.playerId;
    this.broadcast(room);
    return { roomCode: code, playerId: player.playerId, sessionToken: token };
  }

  joinRoom(socketId: string, p: { code: unknown; nickname: unknown; avatar: unknown }): SessionInfo {
    const code = normalizeRoomCode(p.code);
    if (!code) err('INVALID_INVITE', 'That room code or invitation link is not valid.');
    const room = this.getRoomOrThrow(code);
    const nickname = sanitizeNickname(p.nickname);
    if (!nickname) err('INVALID_NICKNAME', 'Please enter a nickname (1–16 characters).');

    const bound = this.sockets.get(socketId);
    if (bound && bound.code === code) {
      err('INVALID_INPUT', 'You are already in this room.');
    }
    if (room.status !== 'lobby') err('GAME_ALREADY_STARTED', 'This game has already started.');
    const free = room.seats.findIndex((s) => s === null);
    if (free < 0) err('ROOM_FULL', 'This room is full (4 players).');

    this.detachSocket(socketId);
    const { player, token } = this.seatNewPlayer(room, socketId, nickname, p.avatar, free as Seat);
    if (!room.hostId) room.hostId = player.playerId;
    this.emitRoom(room, 'player_joined', { seat: player.seat, nickname: player.nickname });
    this.broadcast(room);
    return { roomCode: code, playerId: player.playerId, sessionToken: token };
  }

  /** A returning player proves who they are with their secret session token. */
  reconnect(socketId: string, p: { code: unknown; sessionToken: unknown }): SessionInfo {
    const code = normalizeRoomCode(p.code);
    if (!code || typeof p.sessionToken !== 'string' || p.sessionToken.length > 200) {
      err('SESSION_INVALID', 'Your previous session could not be restored.');
    }
    const room = this.getRoomOrThrow(code);
    const player = room.seats.find((s) => s && tokenMatches(p.sessionToken as string, s.tokenHash)) ?? null;
    if (!player) err('SESSION_INVALID', 'Your previous session could not be restored.');

    // Only one live connection per player: kick any older socket.
    if (player.socketId && player.socketId !== socketId) {
      const old = player.socketId;
      this.sockets.delete(old);
      this.transport.emit(old, 'kicked', { reason: 'session_replaced' });
      this.transport.disconnect(old);
    }
    if (this.sockets.get(socketId)?.playerId !== player.playerId) this.detachSocket(socketId);

    const wasDisconnected = !player.connected;
    player.socketId = socketId;
    player.connected = true;
    player.disconnectedAt = null;
    this.sockets.set(socketId, { code, playerId: player.playerId });
    room.timers.seatRelease.get(player.playerId)?.();
    room.timers.seatRelease.delete(player.playerId);
    if (room.hostId === player.playerId) {
      room.timers.hostTransfer?.();
      room.timers.hostTransfer = undefined;
    }
    room.emptySince = null;
    this.touch(room);
    if (wasDisconnected) this.emitRoom(room, 'player_reconnected', { seat: player.seat, nickname: player.nickname });
    this.broadcast(room);
    return { roomCode: code, playerId: player.playerId, sessionToken: p.sessionToken as string };
  }

  /** Called when a socket's network connection drops. The seat is kept. */
  handleDisconnect(socketId: string) {
    const ctx = this.sockets.get(socketId);
    if (!ctx) return;
    this.sockets.delete(socketId);
    const room = this.rooms.get(ctx.code);
    if (!room) return;
    const player = this.findPlayer(room, ctx.playerId);
    if (!player || player.socketId !== socketId) return;

    const now = this.scheduler.now();
    player.socketId = null;
    player.connected = false;
    player.disconnectedAt = now;

    if (room.status === 'lobby') {
      player.ready = false;
      const cancel = this.scheduler.schedule(() => {
        room.timers.seatRelease.delete(player.playerId);
        if (!player.connected && room.status === 'lobby' && room.seats[player.seat] === player) {
          this.removeFromSeat(room, player);
          this.broadcast(room);
        }
      }, this.timings.lobbyReconnectTimeoutMs);
      room.timers.seatRelease.set(player.playerId, cancel);
    }

    if (room.hostId === player.playerId) this.scheduleHostTransfer(room);
    if (!this.connectedPlayers(room).length) room.emptySince = now;

    this.emitRoom(room, 'player_disconnected', { seat: player.seat, nickname: player.nickname });
    this.broadcast(room);
  }

  leaveRoom(socketId: string) {
    const { room, player } = this.ctx(socketId);
    this.sockets.delete(socketId);
    player.socketId = null;
    player.connected = false;

    if (room.status === 'playing') {
      // Keep the seat so the game state stays valid; the others may abandon right away.
      player.disconnectedAt = this.scheduler.now() - this.timings.reconnectTimeoutMs;
      if (room.hostId === player.playerId) this.transferHost(room);
      this.emitRoom(room, 'player_left', { seat: player.seat, nickname: player.nickname });
    } else {
      if (room.status === 'match_complete') this.resetToLobby(room);
      this.removeFromSeat(room, player);
    }
    if (!this.connectedPlayers(room).length) room.emptySince = this.scheduler.now();
    if (room.seats.every((s) => s === null)) {
      this.deleteRoom(room, false);
      return;
    }
    this.broadcast(room);
  }

  /* ------------------------------------------------------------ */
  /* Lobby actions                                                 */
  /* ------------------------------------------------------------ */

  selectSeat(socketId: string, seat: unknown) {
    const { room, player } = this.ctx(socketId);
    if (room.status !== 'lobby') err('GAME_ALREADY_STARTED', 'Seats cannot change during a game.');
    if (seat !== 0 && seat !== 1 && seat !== 2 && seat !== 3) err('INVALID_INPUT', 'Unknown seat.');
    if (player.seat === seat) return;
    if (room.seats[seat]) err('SEAT_TAKEN', 'That seat is taken.');
    room.seats[player.seat] = null;
    room.seats[seat] = player;
    player.seat = seat;
    player.ready = false;
    this.touch(room);
    this.broadcast(room);
  }

  setReady(socketId: string, ready: unknown) {
    const { room, player } = this.ctx(socketId);
    if (room.status !== 'lobby') err('WRONG_PHASE', 'The game has already started.');
    player.ready = ready === true;
    this.touch(room);
    this.broadcast(room);
  }

  updateSettings(socketId: string, s: Partial<RoomSettings>) {
    const { room, player } = this.ctx(socketId);
    this.requireHost(room, player);
    if (room.status !== 'lobby') err('GAME_ALREADY_STARTED', 'Settings can only change in the lobby.');
    room.settings = this.cleanSettings(s, room.settings);
    this.touch(room);
    this.broadcast(room);
  }

  removePlayer(socketId: string, targetId: unknown) {
    const { room, player } = this.ctx(socketId);
    this.requireHost(room, player);
    if (room.status !== 'lobby') err('GAME_ALREADY_STARTED', 'Players can only be removed in the lobby.');
    const target = typeof targetId === 'string' ? this.findPlayer(room, targetId) : null;
    if (!target || target === player) err('INVALID_INPUT', 'That player cannot be removed.');
    if (target.socketId) {
      this.sockets.delete(target.socketId);
      this.transport.emit(target.socketId, 'kicked', { reason: 'removed_by_host' });
    }
    this.removeFromSeat(room, target);
    this.broadcast(room);
  }

  startGame(socketId: string) {
    const { room, player } = this.ctx(socketId);
    this.requireHost(room, player);
    if (room.status !== 'lobby') err('GAME_ALREADY_STARTED', 'The game has already started.');
    const players = room.seats.filter(Boolean) as PlayerRecord[];
    if (players.length !== 4) err('NOT_ALL_READY', 'You need four players to start.');
    if (!players.every((p) => p.connected && p.ready)) {
      err('NOT_ALL_READY', 'All four players must be connected and ready.');
    }
    this.beginMatch(room, this.rand(4) as Seat);
  }

  /* ------------------------------------------------------------ */
  /* Game actions                                                  */
  /* ------------------------------------------------------------ */

  chooseTrump(socketId: string, suit: unknown) {
    const { room, player, hand } = this.gameCtx(socketId);
    if (suit !== 'S' && suit !== 'H' && suit !== 'D' && suit !== 'C') err('INVALID_INPUT', 'Unknown suit.');
    chooseTrump(hand, player.seat, suit as Suit);
    this.touch(room);
    this.emitRoom(room, 'trump_selected', { suit: suit as Suit, seat: player.seat });
    this.emitRoom(room, 'hand_dealt', { handNumber: hand.handNumber, dealer: hand.dealer, round: 2 });
    this.emitRoom(room, 'player_turn', { seat: hand.turn as Seat });
    this.broadcast(room);
  }

  playCard(socketId: string, cardId: unknown) {
    const { room, player, hand } = this.gameCtx(socketId);
    if (typeof cardId !== 'string') err('INVALID_INPUT', 'Unknown card.');
    const outcome = playCard(hand, player.seat, cardId as CardId);
    this.touch(room);
    this.emitRoom(room, 'card_played', outcome.played);

    if (outcome.trickComplete) {
      const { winner, cards } = outcome.trickComplete;
      this.emitRoom(room, 'trick_completed', { winner, team: teamOf(winner), cards, tricks: { ...hand.tricks } });
      const epoch = room.gameEpoch;
      room.timers.trick = this.scheduler.schedule(() => {
        room.timers.trick = undefined;
        if (room.gameEpoch !== epoch || room.hand !== hand) return;
        this.afterTrickReview(room, hand);
      }, this.timings.trickReviewMs);
    } else {
      this.emitRoom(room, 'player_turn', { seat: hand.turn as Seat });
    }
    this.broadcast(room);
  }

  announceKapothi(socketId: string) {
    const { room, player, hand } = this.gameCtx(socketId);
    if (!room.settings.announcedKapothi) err('CANNOT_ANNOUNCE', 'The announced Kapothi rule is not enabled in this room.');
    const team = announceKapothi(hand, player.seat);
    this.touch(room);
    this.emitRoom(room, 'kapothi_announced', { team, seat: player.seat });
    this.broadcast(room);
  }

  requestRematch(socketId: string) {
    const { room, player } = this.ctx(socketId);
    if (room.status !== 'match_complete') err('WRONG_PHASE', 'The match is not finished yet.');
    room.rematchVotes.add(player.playerId);
    const players = room.seats.filter(Boolean) as PlayerRecord[];
    if (players.length === 4 && players.every((p) => p.connected && room.rematchVotes.has(p.playerId))) {
      // the dealer keeps rotating to the right across matches
      this.beginMatch(room, room.nextDealer);
      return;
    }
    this.broadcast(room);
  }

  returnToLobby(socketId: string) {
    const { room } = this.ctx(socketId);
    if (room.status !== 'match_complete') err('WRONG_PHASE', 'You can return to the lobby after the match.');
    this.resetToLobby(room);
    this.broadcast(room);
  }

  /** When someone cannot reconnect, the connected players can agree to stop the game. */
  voteAbandon(socketId: string) {
    const { room, player } = this.ctx(socketId);
    if (room.status !== 'playing') err('WRONG_PHASE', 'There is no game to abandon.');
    const availableAt = this.abandonAvailableAt(room);
    if (availableAt === null || availableAt > this.scheduler.now()) {
      err('WRONG_PHASE', 'You can abandon only after a player has been disconnected for a while.');
    }
    room.abandonVotes.add(player.playerId);
    const connected = this.connectedPlayers(room);
    if (connected.every((p) => room.abandonVotes.has(p.playerId))) {
      this.resetToLobby(room);
      for (const p of room.seats) if (p && !p.connected) this.removeFromSeat(room, p);
    }
    this.broadcast(room);
  }

  sendReaction(socketId: string, reaction: unknown) {
    const { room, player } = this.ctx(socketId);
    if (!REACTIONS.includes(reaction as ReactionId)) err('INVALID_INPUT', 'Unknown reaction.');
    if (!this.reactionLimiter.take(player.playerId)) err('RATE_LIMITED', 'Slow down a little!');
    this.emitRoom(room, 'reaction', { seat: player.seat, reaction: reaction as ReactionId });
  }

  /* ------------------------------------------------------------ */
  /* Match flow                                                    */
  /* ------------------------------------------------------------ */

  private beginMatch(room: Room, firstDealer: Seat) {
    this.clearGameTimers(room);
    room.gameEpoch += 1;
    room.status = 'playing';
    room.tokens = { A: 0, B: 0 };
    room.pendingBonus = 0;
    room.handsPlayed = 0;
    room.kapothis = { A: 0, B: 0 };
    room.handHistory = [];
    room.lastHandResult = null;
    room.match = null;
    room.rematchVotes.clear();
    room.abandonVotes.clear();
    room.nextDealer = firstDealer;
    this.touch(room);
    this.emitRoom(room, 'game_started', { handNumber: 1 });
    this.dealNextHand(room);
  }

  private dealNextHand(room: Room) {
    room.nextHandAt = null;
    const hand = startHand(room.handsPlayed + 1, room.nextDealer, this.rand);
    room.hand = hand;
    this.emitRoom(room, 'hand_dealt', { handNumber: hand.handNumber, dealer: hand.dealer, round: 1 });
    this.emitRoom(room, 'trump_required', { seat: hand.trumpSelector });
    this.emitRoom(room, 'player_turn', { seat: hand.trumpSelector });
    this.broadcast(room);
  }

  private afterTrickReview(room: Room, hand: HandState) {
    const handOver = collectTrick(hand);
    if (handOver) {
      this.finishHand(room, hand);
    } else {
      this.emitRoom(room, 'player_turn', { seat: hand.turn as Seat });
      this.broadcast(room);
    }
  }

  private finishHand(room: Room, hand: HandState) {
    const score = scoreHand({
      trumpTeam: hand.trumpTeam,
      tricks: hand.tricks,
      pendingBonus: room.pendingBonus,
      announcedVariation: room.settings.announcedKapothi,
      announcedBy: hand.announcedBy,
    });
    if (score.winner) room.tokens[score.winner] += score.totalTokens;
    if (score.kapothi && score.winner) room.kapothis[score.winner] += 1;
    room.pendingBonus = score.pendingBonusAfter;
    room.handsPlayed += 1;

    const result: HandResult = {
      handNumber: hand.handNumber,
      trumpTeam: hand.trumpTeam,
      trump: hand.trump as Suit,
      tricks: { ...hand.tricks },
      winner: score.winner,
      draw: score.draw,
      kapothi: score.kapothi,
      announcedBy: hand.announcedBy,
      announcedFailed: score.announcedFailed,
      baseTokens: score.baseTokens,
      bonusTokens: score.bonusTokens,
      totalTokens: score.totalTokens,
      pendingBonusAfter: score.pendingBonusAfter,
      tokensAfter: { ...room.tokens },
    };
    room.lastHandResult = result;
    room.handHistory.push(result);
    room.nextDealer = nextSeat(hand.dealer); // dealer moves to the right

    this.emitRoom(room, 'hand_completed', result);
    this.emitRoom(room, 'score_updated', { tokens: { ...room.tokens }, pendingBonus: room.pendingBonus });

    const target = room.settings.targetTokens;
    const winner = room.tokens.A >= target ? 'A' : room.tokens.B >= target ? 'B' : null;
    if (winner) {
      room.status = 'match_complete';
      room.match = {
        winner,
        tokens: { ...room.tokens },
        handsPlayed: room.handsPlayed,
        kapothis: { ...room.kapothis },
        winnerNames: teamSeats(winner).map((s) => room.seats[s]?.nickname ?? '?'),
      };
      this.emitRoom(room, 'match_completed', room.match);
      this.broadcast(room);
      return;
    }

    room.nextHandAt = this.scheduler.now() + this.timings.handResultMs;
    const epoch = room.gameEpoch;
    room.timers.nextHand = this.scheduler.schedule(() => {
      room.timers.nextHand = undefined;
      if (room.gameEpoch !== epoch || room.status !== 'playing') return;
      this.dealNextHand(room);
    }, this.timings.handResultMs);
    this.broadcast(room);
  }

  private resetToLobby(room: Room) {
    this.clearGameTimers(room);
    room.gameEpoch += 1;
    room.status = 'lobby';
    room.hand = null;
    room.match = null;
    room.lastHandResult = null;
    room.nextHandAt = null;
    room.tokens = { A: 0, B: 0 };
    room.pendingBonus = 0;
    room.handsPlayed = 0;
    room.kapothis = { A: 0, B: 0 };
    room.rematchVotes.clear();
    room.abandonVotes.clear();
    for (const p of room.seats) if (p) p.ready = false;
  }

  private clearGameTimers(room: Room) {
    room.timers.trick?.();
    room.timers.nextHand?.();
    room.timers.trick = undefined;
    room.timers.nextHand = undefined;
  }

  /* ------------------------------------------------------------ */
  /* Snapshots – the ONLY place game state leaves the server       */
  /* ------------------------------------------------------------ */

  snapshotFor(code: string, playerId: string): RoomSnapshot | null {
    const room = this.rooms.get(code);
    const player = room && this.findPlayer(room, playerId);
    if (!room || !player) return null;
    return this.buildSnapshot(room, player);
  }

  private buildSnapshot(room: Room, me: PlayerRecord): RoomSnapshot {
    const hand = room.hand;
    const players: PublicPlayer[] = (room.seats.filter(Boolean) as PlayerRecord[]).map((p) => ({
      playerId: p.playerId,
      seat: p.seat,
      nickname: p.nickname,
      avatar: p.avatar,
      isHost: p.playerId === room.hostId,
      ready: p.ready,
      connected: p.connected,
      disconnectedAt: p.disconnectedAt,
      cardCount: hand && room.status !== 'lobby' ? hand.hands[p.seat].length : 0,
    }));

    let game: PublicGameState | null = null;
    if (hand && room.status !== 'lobby') {
      game = {
        handNumber: hand.handNumber,
        phase: hand.phase,
        dealer: hand.dealer,
        trumpSelector: hand.trumpSelector,
        trump: hand.trump,
        trumpTeam: hand.trumpTeam,
        turn: hand.turn,
        leader: hand.leader,
        currentTrick: hand.currentTrick.map((pc) => ({ seat: pc.seat, card: { ...pc.card } })),
        trickWinner: hand.trickWinner,
        tricksPlayed: hand.tricksPlayed,
        tricks: { ...hand.tricks },
        lastTrick: hand.lastTrick
          ? { winner: hand.lastTrick.winner, cards: hand.lastTrick.cards.map((pc) => ({ seat: pc.seat, card: { ...pc.card } })) }
          : null,
        kapothiAnnouncedBy: hand.announcedBy,
        canAnnounceKapothiTeam: room.settings.announcedKapothi ? kapothiAnnounceableTeam(hand) : null,
        lastHandResult: room.lastHandResult,
        nextHandAt: room.nextHandAt,
      };
    }

    const myHand = hand && room.status !== 'lobby' ? hand.hands[me.seat].map((c) => ({ ...c })) : [];
    const paused = this.isPaused(room);
    return {
      room: {
        code: room.code,
        status: room.status,
        settings: { ...room.settings },
        hostId: room.hostId,
        players,
        tokens: { ...room.tokens },
        pendingBonus: room.pendingBonus,
        handsPlayed: room.handsPlayed,
        kapothis: { ...room.kapothis },
        game,
        match: room.match,
        rematchVotes: [...room.rematchVotes],
        abandonVotes: [...room.abandonVotes],
        abandonAvailableAt: room.status === 'playing' ? this.abandonAvailableAt(room) : null,
        paused,
        serverTime: this.scheduler.now(),
      },
      you: {
        playerId: me.playerId,
        seat: me.seat,
        hand: myHand,
        legalCardIds: hand && !paused && room.status === 'playing' ? legalCardsFor(hand, me.seat).map((c) => c.id) : [],
      },
    };
  }

  private broadcast(room: Room) {
    for (const p of room.seats) {
      if (p?.socketId) this.transport.emit(p.socketId, 'room_updated', this.buildSnapshot(room, p));
    }
  }

  /** Public notifications only – never include private cards here. */
  private emitRoom<E extends keyof ServerToClientEvents>(
    room: Room,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ) {
    for (const p of room.seats) if (p?.socketId) this.transport.emit(p.socketId, event, ...args);
  }

  /* ------------------------------------------------------------ */
  /* Housekeeping                                                  */
  /* ------------------------------------------------------------ */

  /** Remove abandoned and very old rooms. Call periodically. */
  cleanup() {
    const now = this.scheduler.now();
    for (const room of this.rooms.values()) {
      const idle = room.emptySince !== null && now - room.emptySince >= this.timings.roomIdleTimeoutMs;
      const tooOld = now - room.createdAt >= this.timings.roomMaxAgeMs;
      if (idle || tooOld) this.deleteRoom(room, true);
    }
    for (const [code, at] of this.expired) if (now - at > 24 * 60 * 60_000) this.expired.delete(code);
    this.reactionLimiter.prune();
  }

  private deleteRoom(room: Room, markExpired: boolean) {
    this.clearGameTimers(room);
    room.timers.hostTransfer?.();
    for (const cancel of room.timers.seatRelease.values()) cancel();
    for (const p of room.seats) {
      if (p?.socketId) {
        this.transport.emit(p.socketId, 'kicked', { reason: 'room_closed' });
        this.sockets.delete(p.socketId);
      }
    }
    this.rooms.delete(room.code);
    if (markExpired) this.expired.set(room.code, this.scheduler.now());
  }

  /* ------------------------------------------------------------ */
  /* Internals                                                     */
  /* ------------------------------------------------------------ */

  private seatNewPlayer(room: Room, socketId: string, nickname: string, avatar: unknown, seat: Seat) {
    const token = generateSessionToken();
    const player: PlayerRecord = {
      playerId: generateId(),
      nickname,
      avatar: typeof avatar === 'string' && AVATAR_IDS.includes(avatar) ? avatar : AVATAR_IDS[seat],
      seat,
      tokenHash: hashToken(token),
      socketId,
      connected: true,
      disconnectedAt: null,
      ready: false,
    };
    room.seats[seat] = player;
    room.emptySince = null;
    this.sockets.set(socketId, { code: room.code, playerId: player.playerId });
    this.touch(room);
    return { player, token };
  }

  private removeFromSeat(room: Room, player: PlayerRecord) {
    if (room.seats[player.seat] === player) room.seats[player.seat] = null;
    room.timers.seatRelease.get(player.playerId)?.();
    room.timers.seatRelease.delete(player.playerId);
    if (player.socketId) this.sockets.delete(player.socketId);
    this.emitRoom(room, 'player_left', { seat: player.seat, nickname: player.nickname });
    if (room.hostId === player.playerId) this.transferHost(room);
  }

  private scheduleHostTransfer(room: Room) {
    room.timers.hostTransfer?.();
    room.timers.hostTransfer = this.scheduler.schedule(() => {
      room.timers.hostTransfer = undefined;
      const host = room.hostId ? this.findPlayer(room, room.hostId) : null;
      if (host && host.connected) return;
      this.transferHost(room);
      this.broadcast(room);
    }, this.timings.hostTransferMs);
  }

  private transferHost(room: Room) {
    const candidates = (room.seats.filter(Boolean) as PlayerRecord[]).filter((p) => p.playerId !== room.hostId);
    const next = candidates.find((p) => p.connected) ?? candidates[0] ?? null;
    room.hostId = next ? next.playerId : null;
  }

  /** Detach a socket from whatever room it was in before (switching rooms). */
  private detachSocket(socketId: string) {
    if (this.sockets.has(socketId)) this.handleDisconnect(socketId);
  }

  private abandonAvailableAt(room: Room): number | null {
    const times = (room.seats.filter(Boolean) as PlayerRecord[])
      .filter((p) => !p.connected && p.disconnectedAt !== null)
      .map((p) => (p.disconnectedAt as number) + this.timings.reconnectTimeoutMs);
    return times.length ? Math.min(...times) : null;
  }

  private isPaused(room: Room) {
    return room.status === 'playing' && room.seats.some((p) => !p || !p.connected);
  }

  private connectedPlayers(room: Room) {
    return (room.seats.filter(Boolean) as PlayerRecord[]).filter((p) => p.connected);
  }

  private findPlayer(room: Room, playerId: string) {
    return (room.seats.find((p) => p?.playerId === playerId) as PlayerRecord | undefined) ?? null;
  }

  private getRoomOrThrow(code: string): Room {
    const room = this.rooms.get(code);
    if (room) return room;
    if (this.expired.has(code)) err('ROOM_EXPIRED', 'This room has expired. Please create a new one.');
    err('ROOM_NOT_FOUND', 'Room not found. Check the code and try again.');
  }

  private ctx(socketId: string) {
    const c = this.sockets.get(socketId);
    const room = c && this.rooms.get(c.code);
    const player = room && c && this.findPlayer(room, c.playerId);
    if (!room || !player || player.socketId !== socketId) err('NOT_IN_ROOM', 'You are not in a room.');
    return { room, player };
  }

  private gameCtx(socketId: string) {
    const { room, player } = this.ctx(socketId);
    if (room.status !== 'playing' || !room.hand) err('WRONG_PHASE', 'There is no game in progress.');
    if (this.isPaused(room)) err('GAME_PAUSED', 'The game is paused until every player is connected.');
    return { room, player, hand: room.hand };
  }

  private requireHost(room: Room, player: PlayerRecord) {
    if (room.hostId !== player.playerId) err('NOT_HOST', 'Only the host can do that.');
  }

  private cleanSettings(input: Partial<RoomSettings> | undefined, base: RoomSettings): RoomSettings {
    const s = { ...base };
    if (input && typeof input === 'object') {
      if (input.targetTokens === 5 || input.targetTokens === 10) s.targetTokens = input.targetTokens;
      if (typeof input.announcedKapothi === 'boolean') s.announcedKapothi = input.announcedKapothi;
    }
    return s;
  }

  private touch(room: Room) {
    room.lastActivity = this.scheduler.now();
  }
}

