/**
 * Authoritative Omi hand engine. Pure TypeScript, no networking.
 * The room layer calls these functions; clients never touch this state directly.
 */
import { randomInt } from 'node:crypto';
import {
  createDeck,
  isLegalPlay,
  legalCards,
  nextSeat,
  parseCardId,
  teamOf,
  trickWinner,
  CARDS_PER_PLAYER,
  TRICKS_PER_HAND,
} from '../../../shared/rules';
import type {
  Card,
  CardId,
  ErrorCode,
  HandPhase,
  PlayedCard,
  Seat,
  Suit,
  TeamCounts,
  TeamId,
} from '../../../shared/types';

/** Returns a uniformly random integer in [0, maxExclusive). */
export type RandomInt = (maxExclusive: number) => number;

/** Cryptographically secure randomness from the Node.js runtime. */
export const secureRandomInt: RandomInt = (max) => randomInt(max);

export class RuleError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface HandState {
  handNumber: number;
  dealer: Seat;
  trumpSelector: Seat;
  trumpTeam: TeamId;
  trump: Suit | null;
  phase: HandPhase;
  /** private hands, indexed by seat */
  hands: Card[][];
  /** the 16 cards waiting for the second deal */
  stock: Card[];
  turn: Seat | null;
  leader: Seat | null;
  currentTrick: PlayedCard[];
  trickWinner: Seat | null;
  tricksPlayed: number;
  tricks: TeamCounts;
  /** winner of each completed trick, in order */
  trickWinners: Seat[];
  lastTrick: { cards: PlayedCard[]; winner: Seat } | null;
  announcedBy: TeamId | null;
}

/** Fisher–Yates shuffle using secure randomness. Returns a new array. */
export function shuffle<T>(items: readonly T[], rand: RandomInt = secureRandomInt): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Deal `count` cards to each player, starting at the dealer's right, counter-clockwise. */
function dealRound(hands: Card[][], stock: Card[], dealer: Seat, count: number) {
  let seat = nextSeat(dealer);
  for (let i = 0; i < 4; i++) {
    hands[seat].push(...stock.splice(0, count));
    seat = nextSeat(seat);
  }
}

/**
 * Start a new hand: shuffle the 32-card deck and deal FOUR cards to each player.
 * The player on the dealer's right must now choose trumps.
 */
export function startHand(handNumber: number, dealer: Seat, rand: RandomInt = secureRandomInt): HandState {
  const stock = shuffle(createDeck(), rand);
  const hands: Card[][] = [[], [], [], []];
  dealRound(hands, stock, dealer, 4);
  const trumpSelector = nextSeat(dealer);
  return {
    handNumber,
    dealer,
    trumpSelector,
    trumpTeam: teamOf(trumpSelector),
    trump: null,
    phase: 'trump_selection',
    hands,
    stock,
    turn: trumpSelector,
    leader: null,
    currentTrick: [],
    trickWinner: null,
    tricksPlayed: 0,
    tricks: { A: 0, B: 0 },
    trickWinners: [],
    lastTrick: null,
    announcedBy: null,
  };
}

/** The trump selector picks any suit; then the remaining four cards each are dealt. */
export function chooseTrump(h: HandState, seat: Seat, suit: Suit): void {
  if (h.phase !== 'trump_selection') throw new RuleError('WRONG_PHASE', 'Trumps have already been chosen.');
  if (seat !== h.trumpSelector) throw new RuleError('NOT_YOUR_TURN', 'Only the player on the dealer’s right chooses trumps.');
  if (!['S', 'H', 'D', 'C'].includes(suit)) throw new RuleError('INVALID_INPUT', 'Unknown suit.');
  h.trump = suit;
  dealRound(h.hands, h.stock, h.dealer, 4);
  if (h.stock.length !== 0 || h.hands.some((x) => x.length !== CARDS_PER_PLAYER)) {
    throw new Error('Dealing invariant broken');
  }
  h.phase = 'playing';
  h.leader = h.trumpSelector;
  h.turn = h.trumpSelector;
}

export function legalCardsFor(h: HandState, seat: Seat): Card[] {
  if (h.phase !== 'playing' || h.turn !== seat) return [];
  return legalCards(h.hands[seat], h.currentTrick);
}

export interface PlayOutcome {
  played: PlayedCard;
  trickComplete: { winner: Seat; cards: PlayedCard[] } | null;
}

/** Validate and apply a card play. Throws RuleError for any illegal action. */
export function playCard(h: HandState, seat: Seat, cardId: CardId): PlayOutcome {
  if (h.phase === 'trick_review') throw new RuleError('WRONG_PHASE', 'Wait for the trick to be collected.');
  if (h.phase !== 'playing') throw new RuleError('WRONG_PHASE', 'You cannot play a card right now.');
  if (h.currentTrick.some((p) => p.seat === seat)) throw new RuleError('ALREADY_PLAYED', 'You already played a card in this trick.');
  if (h.turn !== seat) throw new RuleError('NOT_YOUR_TURN', 'It is not your turn.');
  const parsed = parseCardId(cardId);
  if (!parsed) throw new RuleError('INVALID_INPUT', 'Unknown card.');
  const hand = h.hands[seat];
  const idx = hand.findIndex((c) => c.id === cardId);
  if (idx < 0) throw new RuleError('CARD_NOT_IN_HAND', 'That card is not in your hand.');
  if (!isLegalPlay(hand, h.currentTrick, cardId)) {
    throw new RuleError('MUST_FOLLOW_SUIT', 'You must follow the suit that was led when you can.');
  }

  const [card] = hand.splice(idx, 1);
  const played: PlayedCard = { seat, card };
  h.currentTrick.push(played);

  if (h.currentTrick.length < 4) {
    h.turn = nextSeat(seat);
    return { played, trickComplete: null };
  }

  const win = trickWinner(h.currentTrick, h.trump as Suit);
  h.trickWinner = win.seat;
  h.tricks[teamOf(win.seat)] += 1;
  h.tricksPlayed += 1;
  h.trickWinners.push(win.seat);
  h.phase = 'trick_review';
  h.turn = null;
  return { played, trickComplete: { winner: win.seat, cards: [...h.currentTrick] } };
}

/**
 * Collect the reviewed trick. The winner leads next.
 * Returns true when this was the 8th trick (hand complete).
 */
export function collectTrick(h: HandState): boolean {
  if (h.phase !== 'trick_review' || h.trickWinner === null) throw new RuleError('WRONG_PHASE', 'No trick to collect.');
  const winner = h.trickWinner;
  h.lastTrick = { cards: h.currentTrick, winner };
  h.currentTrick = [];
  h.trickWinner = null;
  if (h.tricksPlayed >= TRICKS_PER_HAND) {
    if (h.hands.some((x) => x.length !== 0)) throw new Error('Hand finished with cards remaining');
    h.phase = 'hand_complete';
    h.turn = null;
    h.leader = null;
    return true;
  }
  h.phase = 'playing';
  h.leader = winner;
  h.turn = winner;
  return false;
}

/**
 * Announced-Kapothi variation: a team that has won the first six tricks may
 * announce before the seventh trick starts.
 */
export function kapothiAnnounceableTeam(h: HandState): TeamId | null {
  if (h.phase !== 'playing' || h.announcedBy || h.tricksPlayed !== 6 || h.currentTrick.length !== 0) return null;
  if (h.tricks.A === 6) return 'A';
  if (h.tricks.B === 6) return 'B';
  return null;
}

export function announceKapothi(h: HandState, seat: Seat): TeamId {
  const team = kapothiAnnounceableTeam(h);
  if (!team || teamOf(seat) !== team) {
    throw new RuleError('CANNOT_ANNOUNCE', 'Kapothi can only be announced by a team that won the first 6 tricks, before trick 7.');
  }
  h.announcedBy = team;
  return team;
}
