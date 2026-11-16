/**
 * Shared, typed contract between the OMI FRIENDS client and server.
 * Everything in here is safe to send to any browser: it never contains
 * another player's private cards.
 */

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'A' | 'K' | 'Q' | 'J' | '10' | '9' | '8' | '7';

/** Card ids look like "AS" (Ace of Spades) or "10H" (Ten of Hearts). */
export type CardId = `${Rank}${Suit}`;

export interface Card {
  id: CardId;
  suit: Suit;
  rank: Rank;
}

/** Seats 0..3 are "Player 1".."Player 4". Turn order is 0 → 1 → 2 → 3 (counter-clockwise). */
export type Seat = 0 | 1 | 2 | 3;
export type TeamId = 'A' | 'B';

export interface RoomSettings {
  /** Tokens needed to win the match: 5 (quick) or 10 (standard). */
  targetTokens: 5 | 10;
  /** Optional "announced Kapothi" rule. Off by default. */
  announcedKapothi: boolean;
}

export type RoomStatus = 'lobby' | 'playing' | 'match_complete';

export type HandPhase =
  | 'trump_selection' // first 4 cards dealt, waiting for trump
  | 'playing' // tricks being played
  | 'trick_review' // all 4 cards of a trick are on the table, briefly shown
  | 'hand_complete'; // all 8 tricks done, result screen showing

export interface PublicPlayer {
  playerId: string;
  seat: Seat;
  nickname: string;
  avatar: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  /** epoch ms when this player disconnected, if currently disconnected */
  disconnectedAt: number | null;
  /** cards left in hand (public information) */
  cardCount: number;
}

export interface PlayedCard {
  seat: Seat;
  card: Card;
}

export interface TeamCounts {
  A: number;
  B: number;
}

export interface HandResult {
  handNumber: number;
  trumpTeam: TeamId;
  trump: Suit;
  tricks: TeamCounts;
  /** null when the hand was a 4–4 draw */
  winner: TeamId | null;
  draw: boolean;
  kapothi: boolean;
  /** Announced-Kapothi variation: which team announced, if any */
  announcedBy: TeamId | null;
  announcedFailed: boolean;
  baseTokens: number;
  bonusTokens: number;
  totalTokens: number;
  /** bonus pool after this hand */
  pendingBonusAfter: number;
  tokensAfter: TeamCounts;
}

export interface MatchSummary {
  winner: TeamId;
  tokens: TeamCounts;
  handsPlayed: number;
  kapothis: TeamCounts;
  winnerNames: string[];
}

export interface PublicGameState {
  handNumber: number;
  phase: HandPhase;
  dealer: Seat;
  trumpSelector: Seat;
  trump: Suit | null;
  trumpTeam: TeamId;
  /** whose turn it is (to choose trump or to play) */
  turn: Seat | null;
  leader: Seat | null;
  currentTrick: PlayedCard[];
  /** set during 'trick_review' */
  trickWinner: Seat | null;
  tricksPlayed: number;
  tricks: TeamCounts;
  /** the previous trick, after it has been collected */
  lastTrick: { cards: PlayedCard[]; winner: Seat } | null;
  /** Announced-Kapothi variation */
  kapothiAnnouncedBy: TeamId | null;
  canAnnounceKapothiTeam: TeamId | null;
  lastHandResult: HandResult | null;
  /** epoch ms when the next hand will be dealt (during 'hand_complete') */
  nextHandAt: number | null;
}

export interface PublicRoomState {
  code: string;
  status: RoomStatus;
  settings: RoomSettings;
  hostId: string | null;
  players: PublicPlayer[];
  tokens: TeamCounts;
  pendingBonus: number;
  handsPlayed: number;
  kapothis: TeamCounts;
  game: PublicGameState | null;
  match: MatchSummary | null;
  rematchVotes: string[];
  abandonVotes: string[];
  /** epoch ms after which players may vote to abandon (someone disconnected too long) */
  abandonAvailableAt: number | null;
  paused: boolean;
  serverTime: number;
}

/** Private, per-player part of the snapshot. Only ever sent to that player. */
export interface PrivateView {
  playerId: string;
  seat: Seat;
  hand: Card[];
  /** ids of cards this player may legally play right now (empty if not their turn) */
  legalCardIds: CardId[];
}

export interface RoomSnapshot {
  room: PublicRoomState;
  you: PrivateView;
}

export interface SessionInfo {
  roomCode: string;
  playerId: string;
  sessionToken: string;
}

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_EXPIRED'
  | 'INVALID_INVITE'
  | 'GAME_ALREADY_STARTED'
  | 'INVALID_NICKNAME'
  | 'INVALID_INPUT'
  | 'NOT_IN_ROOM'
  | 'NOT_HOST'
  | 'SEAT_TAKEN'
  | 'NOT_ALL_READY'
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  | 'CARD_NOT_IN_HAND'
  | 'MUST_FOLLOW_SUIT'
  | 'ALREADY_PLAYED'
  | 'GAME_PAUSED'
  | 'CANNOT_ANNOUNCE'
  | 'RATE_LIMITED'
  | 'SESSION_INVALID'
  | 'SESSION_REPLACED'
  | 'SERVER_ERROR';

export interface GameError {
  code: ErrorCode;
  message: string;
}

export type Ack<T = undefined> = (response: { ok: true; data: T } | { ok: false; error: GameError }) => void;

export type AckResponse<T = undefined> = Parameters<Ack<T>>[0];

export const REACTIONS = ['👍', '😂', '😮', '🔥', '👏', '😢', 'nice', 'well_played', 'good_game', 'hurry'] as const;
export type ReactionId = (typeof REACTIONS)[number];

/* ---------------------------------------------------------------- */
/* Socket.IO event contract                                          */
/* ---------------------------------------------------------------- */

export interface ClientToServerEvents {
  create_room: (
    p: { nickname: string; avatar: string; settings?: Partial<RoomSettings> },
    ack: Ack<SessionInfo>,
  ) => void;
  join_room: (p: { code: string; nickname: string; avatar: string }, ack: Ack<SessionInfo>) => void;
  reconnect_player: (p: { code: string; sessionToken: string }, ack: Ack<SessionInfo>) => void;
  select_seat: (p: { seat: Seat }, ack: Ack) => void;
  player_ready: (p: { ready: boolean }, ack: Ack) => void;
  update_settings: (p: Partial<RoomSettings>, ack: Ack) => void;
  remove_player: (p: { playerId: string }, ack: Ack) => void;
  start_game: (p: Record<string, never>, ack: Ack) => void;
  choose_trump: (p: { suit: Suit }, ack: Ack) => void;
  play_card: (p: { cardId: CardId }, ack: Ack) => void;
  announce_kapothi: (p: Record<string, never>, ack: Ack) => void;
  request_rematch: (p: Record<string, never>, ack: Ack) => void;
  return_to_lobby: (p: Record<string, never>, ack: Ack) => void;
  vote_abandon: (p: Record<string, never>, ack: Ack) => void;
  send_reaction: (p: { reaction: ReactionId }, ack: Ack) => void;
  leave_room: (p: Record<string, never>, ack: Ack) => void;
}

export interface ServerToClientEvents {
  /** Full personalised snapshot. Sent after every change. Includes your private hand. */
  room_updated: (s: RoomSnapshot) => void;
  player_joined: (p: { seat: Seat; nickname: string }) => void;
  player_left: (p: { seat: Seat; nickname: string }) => void;
  player_disconnected: (p: { seat: Seat; nickname: string }) => void;
  player_reconnected: (p: { seat: Seat; nickname: string }) => void;
  game_started: (p: { handNumber: number }) => void;
  hand_dealt: (p: { handNumber: number; dealer: Seat; round: 1 | 2 }) => void;
  trump_required: (p: { seat: Seat }) => void;
  trump_selected: (p: { suit: Suit; seat: Seat }) => void;
  player_turn: (p: { seat: Seat }) => void;
  card_played: (p: PlayedCard) => void;
  trick_completed: (p: { winner: Seat; team: TeamId; cards: PlayedCard[]; tricks: TeamCounts }) => void;
  kapothi_announced: (p: { team: TeamId; seat: Seat }) => void;
  hand_completed: (p: HandResult) => void;
  score_updated: (p: { tokens: TeamCounts; pendingBonus: number }) => void;
  match_completed: (p: MatchSummary) => void;
  reaction: (p: { seat: Seat; reaction: ReactionId }) => void;
  kicked: (p: { reason: 'removed_by_host' | 'session_replaced' | 'room_closed' }) => void;
  game_error: (e: GameError) => void;
}
