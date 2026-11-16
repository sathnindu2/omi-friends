/**
 * Pure Omi rule helpers, shared by the server (authoritative) and the client
 * (only for highlighting legal cards and for the tutorial).
 *
 * Traditional Sri Lankan Omi:
 *  - 32 cards: A K Q J 10 9 8 7 in four suits.
 *  - Seats 0..3, play goes counter-clockwise: 0 → 1 → 2 → 3 → 0.
 *  - Team A = seats 0 & 2, Team B = seats 1 & 3 (partners sit opposite).
 */
import type { Card, CardId, PlayedCard, Rank, Seat, Suit, TeamCounts, TeamId } from './types';

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
/** Highest first. */
export const RANKS: readonly Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'];
export const SEATS: readonly Seat[] = [0, 1, 2, 3];

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_IS_RED: Record<Suit, boolean> = { S: false, H: true, D: true, C: false };

export const CARDS_PER_PLAYER = 8;
export const TRICKS_PER_HAND = 8;

export function makeCard(rank: Rank, suit: Suit): Card {
  return { id: `${rank}${suit}` as CardId, rank, suit };
}

export function parseCardId(id: string): Card | null {
  const m = /^(A|K|Q|J|10|9|8|7)([SHDC])$/.exec(id);
  if (!m) return null;
  return makeCard(m[1] as Rank, m[2] as Suit);
}

/** A fresh, ordered 32-card Omi deck. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push(makeCard(rank, suit));
  return deck;
}

/** Higher number = stronger card. A = 8 … 7 = 1. */
export function rankValue(rank: Rank): number {
  return RANKS.length - RANKS.indexOf(rank);
}

export function teamOf(seat: Seat): TeamId {
  return seat % 2 === 0 ? 'A' : 'B';
}

export function otherTeam(team: TeamId): TeamId {
  return team === 'A' ? 'B' : 'A';
}

export function teamSeats(team: TeamId): [Seat, Seat] {
  return team === 'A' ? [0, 2] : [1, 3];
}

/** The seat to the right = next player counter-clockwise. */
export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

export function partnerOf(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat;
}

/**
 * Cards a player may legally play.
 * Must follow the led suit when possible; otherwise anything.
 */
export function legalCards(hand: readonly Card[], trick: readonly PlayedCard[]): Card[] {
  if (trick.length === 0) return [...hand];
  const led = trick[0].card.suit;
  const follow = hand.filter((c) => c.suit === led);
  return follow.length > 0 ? follow : [...hand];
}

export function isLegalPlay(hand: readonly Card[], trick: readonly PlayedCard[], cardId: CardId): boolean {
  return legalCards(hand, trick).some((c) => c.id === cardId);
}

/**
 * Winner of a trick: the highest trump if any trump was played,
 * otherwise the highest card of the suit that was led.
 */
export function trickWinner(trick: readonly PlayedCard[], trump: Suit): PlayedCard {
  if (trick.length === 0) throw new Error('Empty trick');
  const led = trick[0].card.suit;
  let best = trick[0];
  for (const pc of trick.slice(1)) {
    if (beats(pc.card, best.card, led, trump)) best = pc;
  }
  return best;
}

function beats(challenger: Card, current: Card, led: Suit, trump: Suit): boolean {
  const cTrump = challenger.suit === trump;
  const bTrump = current.suit === trump;
  if (cTrump && !bTrump) return true;
  if (!cTrump && bTrump) return false;
  if (cTrump && bTrump) return rankValue(challenger.rank) > rankValue(current.rank);
  // neither is trump: only cards of the led suit can win
  if (challenger.suit !== led) return false;
  if (current.suit !== led) return true;
  return rankValue(challenger.rank) > rankValue(current.rank);
}

export interface ScoreInput {
  trumpTeam: TeamId;
  tricks: TeamCounts;
  pendingBonus: number;
  /** announced-Kapothi variation enabled for this room */
  announcedVariation: boolean;
  /** team that announced Kapothi this hand (variation only) */
  announcedBy: TeamId | null;
}

export interface ScoreOutput {
  winner: TeamId | null;
  draw: boolean;
  kapothi: boolean;
  announcedFailed: boolean;
  baseTokens: number;
  bonusTokens: number;
  totalTokens: number;
  pendingBonusAfter: number;
}

/**
 * Traditional Omi scoring (tokens, never card points):
 *  - trump team wins 5–7 tricks  → 1 token
 *  - other team wins 5–7 tricks  → 2 tokens
 *  - any team wins all 8 (Kapothi) → 3 tokens
 *  - 4–4 draw → nobody scores, +1 bonus token carried to the next decided hand
 *  - pending bonus tokens are added to the next hand that has a winner
 *
 * Announced-Kapothi variation (optional, off by default):
 *  - only an announced sweep scores 3; an unannounced 8–0 scores as a normal win
 *  - a failed announcement gives the opponents 4 tokens
 */
export function scoreHand(input: ScoreInput): ScoreOutput {
  const { trumpTeam, tricks, pendingBonus, announcedVariation, announcedBy } = input;
  if (tricks.A + tricks.B !== TRICKS_PER_HAND) {
    throw new Error(`Hand must have exactly ${TRICKS_PER_HAND} tricks, got ${tricks.A + tricks.B}`);
  }

  if (tricks.A === 4 && tricks.B === 4) {
    return {
      winner: null,
      draw: true,
      kapothi: false,
      announcedFailed: false,
      baseTokens: 0,
      bonusTokens: 0,
      totalTokens: 0,
      pendingBonusAfter: pendingBonus + 1,
    };
  }

  let winner: TeamId = tricks.A > tricks.B ? 'A' : 'B';
  const sweep = tricks[winner] === TRICKS_PER_HAND;
  let base: number;
  let kapothi = false;
  let announcedFailed = false;

  if (announcedVariation && announcedBy) {
    if (tricks[announcedBy] === TRICKS_PER_HAND) {
      winner = announcedBy;
      base = 3;
      kapothi = true;
    } else {
      announcedFailed = true;
      winner = otherTeam(announcedBy);
      base = 4;
    }
  } else if (sweep && !announcedVariation) {
    base = 3;
    kapothi = true;
  } else {
    base = winner === trumpTeam ? 1 : 2;
    kapothi = false;
  }

  return {
    winner,
    draw: false,
    kapothi,
    announcedFailed,
    baseTokens: base,
    bonusTokens: pendingBonus,
    totalTokens: base + pendingBonus,
    pendingBonusAfter: 0,
  };
}

export const AVATARS: Record<string, string> = {
  elephant: '🐘',
  peacock: '🦚',
  leopard: '🐆',
  tuktuk: '🛺',
  coconut: '🥥',
  tea: '🍵',
  kite: '🪁',
  lotus: '🪷',
  parrot: '🦜',
  turtle: '🐢',
  mango: '🥭',
  crown: '👑',
};
export const AVATAR_IDS = Object.keys(AVATARS);
