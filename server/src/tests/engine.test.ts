import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  announceKapothi,
  chooseTrump,
  collectTrick,
  legalCardsFor,
  playCard,
  RuleError,
  shuffle,
  startHand,
  type HandState,
} from '../game/engine';
import { createDeck, legalCards, makeCard, parseCardId, scoreHand, trickWinner } from '../../../shared/rules';
import type { Card, CardId, PlayedCard, Seat, Suit } from '../../../shared/types';

const c = (id: string): Card => {
  const card = parseCardId(id);
  if (!card) throw new Error(`bad card ${id}`);
  return card;
};
const trick = (...ids: string[]): PlayedCard[] => ids.map((id, i) => ({ seat: i as Seat, card: c(id) }));

function expectRule(fn: () => unknown, code: string) {
  assert.throws(fn, (e: unknown) => e instanceof RuleError && e.code === code);
}

/** Build a hand in the playing phase with fixed cards. */
function fixedHand(hands: string[][], trump: Suit, leader: Seat): HandState {
  return {
    handNumber: 1,
    dealer: ((leader + 3) % 4) as Seat,
    trumpSelector: leader,
    trumpTeam: leader % 2 === 0 ? 'A' : 'B',
    trump,
    phase: 'playing',
    hands: hands.map((h) => h.map(c)),
    stock: [],
    turn: leader,
    leader,
    currentTrick: [],
    trickWinner: null,
    tricksPlayed: 0,
    tricks: { A: 0, B: 0 },
    trickWinners: [],
    lastTrick: null,
    announcedBy: null,
  };
}

/** Play out the rest of a hand with the first legal card each time. */
function playOut(h: HandState) {
  while (h.phase !== 'hand_complete') {
    if (h.phase === 'trick_review') {
      collectTrick(h);
      continue;
    }
    const seat = h.turn as Seat;
    playCard(h, seat, legalCardsFor(h, seat)[0].id);
  }
}

describe('deck and dealing', () => {
  test('1. a deck contains exactly 32 unique cards (A K Q J 10 9 8 7)', () => {
    const deck = createDeck();
    assert.equal(deck.length, 32);
    assert.equal(new Set(deck.map((x) => x.id)).size, 32);
    for (const card of deck) assert.ok(['A', 'K', 'Q', 'J', '10', '9', '8', '7'].includes(card.rank));
    assert.ok(!deck.some((x) => ['2', '3', '4', '5', '6'].includes(x.rank as string)));
  });

  test('shuffle keeps every card exactly once', () => {
    const s = shuffle(createDeck());
    assert.deepEqual([...s.map((x) => x.id)].sort(), [...createDeck().map((x) => x.id)].sort());
  });

  test('2. every player receives four cards before trump selection', () => {
    const h = startHand(1, 0);
    assert.equal(h.phase, 'trump_selection');
    assert.deepEqual(h.hands.map((x) => x.length), [4, 4, 4, 4]);
    assert.equal(h.stock.length, 16);
  });

  test('3. the player to the dealer’s right chooses trumps (and nobody else can)', () => {
    for (const dealer of [0, 1, 2, 3] as Seat[]) {
      const h = startHand(1, dealer);
      const selector = ((dealer + 1) % 4) as Seat;
      assert.equal(h.trumpSelector, selector);
      assert.equal(h.turn, selector);
      for (const other of [0, 1, 2, 3] as Seat[]) {
        if (other !== selector) expectRule(() => chooseTrump(h, other, 'S'), 'NOT_YOUR_TURN');
      }
      chooseTrump(h, selector, 'H');
      assert.equal(h.trump, 'H');
      expectRule(() => chooseTrump(h, selector, 'S'), 'WRONG_PHASE');
    }
  });

  test('trump may be any suit, even one the chooser does not hold', () => {
    const h = startHand(1, 3);
    const missing = (['S', 'H', 'D', 'C'] as Suit[]).find((s) => !h.hands[0].some((x) => x.suit === s));
    chooseTrump(h, 0, missing ?? 'C');
    assert.equal(h.phase, 'playing');
  });

  test('4 & 5. four more cards each after trump; everybody ends with eight; 32 cards distributed once', () => {
    const h = startHand(1, 2);
    const firstFour = h.hands.map((x) => x.map((y) => y.id));
    chooseTrump(h, 3, 'D');
    assert.deepEqual(h.hands.map((x) => x.length), [8, 8, 8, 8]);
    for (let s = 0; s < 4; s++) for (const id of firstFour[s]) assert.ok(h.hands[s].some((x) => x.id === id));
    const all = h.hands.flat().map((x) => x.id);
    assert.equal(new Set(all).size, 32);
    assert.equal(h.stock.length, 0);
  });
});

describe('playing', () => {
  test('6. turns proceed counter-clockwise starting with the trump selector', () => {
    const h = startHand(1, 1); // selector = seat 2
    chooseTrump(h, 2, 'S');
    assert.equal(h.turn, 2);
    const order: Seat[] = [];
    for (let i = 0; i < 4; i++) {
      const seat = h.turn as Seat;
      order.push(seat);
      playCard(h, seat, legalCardsFor(h, seat)[0].id);
    }
    assert.deepEqual(order, [2, 3, 0, 1]);
  });

  test('7. a player cannot play out of turn', () => {
    const h = fixedHand([['AS'], ['KS'], ['QS'], ['JS']], 'H', 0);
    expectRule(() => playCard(h, 1, 'KS'), 'NOT_YOUR_TURN');
    expectRule(() => playCard(h, 3, 'JS'), 'NOT_YOUR_TURN');
  });

  test('a player cannot play a card they do not own', () => {
    const h = fixedHand([['AS'], ['KS'], ['QS'], ['JS']], 'H', 0);
    expectRule(() => playCard(h, 0, 'KS'), 'CARD_NOT_IN_HAND');
    expectRule(() => playCard(h, 0, 'ZZ' as CardId), 'INVALID_INPUT');
  });

  test('8. a player must follow suit when possible', () => {
    const h = fixedHand(
      [['9H', 'AS'], ['KH', '7S'], ['QD', 'QC'], ['JH', '8H']],
      'S',
      0,
    );
    playCard(h, 0, '9H');
    expectRule(() => playCard(h, 1, '7S'), 'MUST_FOLLOW_SUIT');
    assert.deepEqual(legalCardsFor(h, 1).map((x) => x.id), ['KH']);
    playCard(h, 1, 'KH');
  });

  test('9. a void player may play any suit, including trump', () => {
    const h = fixedHand([['9H'], ['7S'], ['QD'], ['JC']], 'S', 0);
    playCard(h, 0, '9H');
    assert.deepEqual(legalCardsFor(h, 1).map((x) => x.id), ['7S']);
    playCard(h, 1, '7S');
    playCard(h, 2, 'QD');
    playCard(h, 3, 'JC');
    assert.equal(h.trickWinner, 1);
  });

  test('10. highest card of the led suit wins when no trump is played (rule example 1)', () => {
    assert.equal(trickWinner(trick('AH', 'KH', '7H', '10H'), 'S').card.id, 'AH');
    // off-suit high cards cannot win
    assert.equal(trickWinner(trick('9D', 'AC', 'AH', '7D'), 'S').card.id, '9D');
  });

  test('11. highest trump wins when trumps are played (rule examples 2 and 3)', () => {
    assert.equal(trickWinner(trick('AH', '7S', 'KH', '8H'), 'S').card.id, '7S');
    assert.equal(trickWinner(trick('AH', '7S', 'KS', '10H'), 'S').card.id, 'KS');
    assert.equal(trickWinner(trick('7S', 'AH', '8S', 'KS'), 'S').card.id, 'KS');
  });

  test('12. the trick winner leads the next trick', () => {
    const h = fixedHand(
      [['9H', '7C'], ['AH', '8C'], ['7H', '9C'], ['8H', '10C']],
      'S',
      0,
    );
    playCard(h, 0, '9H');
    playCard(h, 1, 'AH');
    playCard(h, 2, '7H');
    playCard(h, 3, '8H');
    assert.equal(h.phase, 'trick_review');
    expectRule(() => playCard(h, 1, '8C'), 'WRONG_PHASE');
    collectTrick(h);
    assert.equal(h.turn, 1);
    assert.equal(h.leader, 1);
    assert.equal(h.tricks.B, 1);
  });

  test('a player cannot play a second card in the same trick', () => {
    const h = fixedHand([['9H', '8H'], ['AH', 'KH'], ['7H', 'QH'], ['10H', 'JH']], 'S', 0);
    playCard(h, 0, '9H');
    expectRule(() => playCard(h, 0, '8H'), 'ALREADY_PLAYED');
  });

  test('13. exactly eight tricks complete a hand and every hand is emptied', () => {
    for (let round = 0; round < 25; round++) {
      const h = startHand(1, (round % 4) as Seat);
      chooseTrump(h, h.trumpSelector, (['S', 'H', 'D', 'C'] as Suit[])[round % 4]);
      let collected = 0;
      while (h.phase !== 'hand_complete') {
        if (h.phase === 'trick_review') {
          collectTrick(h);
          collected++;
          if (collected < 8) assert.equal(h.phase, 'playing');
          continue;
        }
        const seat = h.turn as Seat;
        const legal = legalCardsFor(h, seat);
        playCard(h, seat, legal[Math.floor(Math.random() * legal.length)].id);
      }
      assert.equal(collected, 8);
      assert.equal(h.tricks.A + h.tricks.B, 8);
      assert.ok(h.hands.every((x) => x.length === 0));
    }
  });

  test('legalCards helper: leader may play anything', () => {
    const hand = [makeCard('A', 'S'), makeCard('7', 'H')];
    assert.equal(legalCards(hand, []).length, 2);
  });
});

describe('scoring', () => {
  const base = { pendingBonus: 0, announcedVariation: false, announcedBy: null } as const;

  test('14. trump team winning 5–7 tricks scores one token', () => {
    for (const a of [5, 6, 7]) {
      const r = scoreHand({ ...base, trumpTeam: 'A', tricks: { A: a, B: 8 - a } });
      assert.equal(r.winner, 'A');
      assert.equal(r.totalTokens, 1);
      assert.equal(r.kapothi, false);
    }
  });

  test('15. defending team winning 5–7 tricks scores two tokens', () => {
    for (const b of [5, 6, 7]) {
      const r = scoreHand({ ...base, trumpTeam: 'A', tricks: { A: 8 - b, B: b } });
      assert.equal(r.winner, 'B');
      assert.equal(r.totalTokens, 2);
    }
  });

  test('16. an eight-trick sweep (Kapothi) scores three tokens, for either team', () => {
    const r1 = scoreHand({ ...base, trumpTeam: 'A', tricks: { A: 8, B: 0 } });
    assert.deepEqual([r1.winner, r1.totalTokens, r1.kapothi], ['A', 3, true]);
    const r2 = scoreHand({ ...base, trumpTeam: 'A', tricks: { A: 0, B: 8 } });
    assert.deepEqual([r2.winner, r2.totalTokens, r2.kapothi], ['B', 3, true]);
  });

  test('17. a 4–4 draw scores nothing and adds a pending bonus', () => {
    const r = scoreHand({ ...base, trumpTeam: 'B', tricks: { A: 4, B: 4 } });
    assert.equal(r.draw, true);
    assert.equal(r.winner, null);
    assert.equal(r.totalTokens, 0);
    assert.equal(r.pendingBonusAfter, 1);
  });

  test('18. the pending bonus is awarded after one or several draws, then reset', () => {
    let pending = 0;
    pending = scoreHand({ ...base, trumpTeam: 'A', tricks: { A: 4, B: 4 } }).pendingBonusAfter;
    const one = scoreHand({ ...base, pendingBonus: pending, trumpTeam: 'A', tricks: { A: 6, B: 2 } });
    assert.deepEqual([one.baseTokens, one.bonusTokens, one.totalTokens, one.pendingBonusAfter], [1, 1, 2, 0]);

    pending = 0;
    for (let i = 0; i < 3; i++) pending = scoreHand({ ...base, pendingBonus: pending, trumpTeam: 'B', tricks: { A: 4, B: 4 } }).pendingBonusAfter;
    assert.equal(pending, 3);
    const three = scoreHand({ ...base, pendingBonus: pending, trumpTeam: 'B', tricks: { A: 5, B: 3 } });
    assert.deepEqual([three.winner, three.totalTokens, three.pendingBonusAfter], ['A', 5, 0]);
    const kap = scoreHand({ ...base, pendingBonus: 2, trumpTeam: 'B', tricks: { A: 0, B: 8 } });
    assert.equal(kap.totalTokens, 5);
  });

  test('scoring rejects a hand that is not exactly 8 tricks', () => {
    assert.throws(() => scoreHand({ ...base, trumpTeam: 'A', tricks: { A: 4, B: 3 } }));
  });

  test('announced Kapothi variation: success 3 (+bonus), failure gives opponents 4, unannounced sweep is a normal win', () => {
    const v = { pendingBonus: 1, announcedVariation: true } as const;
    const ok = scoreHand({ ...v, announcedBy: 'A', trumpTeam: 'A', tricks: { A: 8, B: 0 } });
    assert.deepEqual([ok.winner, ok.totalTokens, ok.kapothi], ['A', 4, true]);
    const fail = scoreHand({ ...v, announcedBy: 'A', trumpTeam: 'A', tricks: { A: 7, B: 1 } });
    assert.deepEqual([fail.winner, fail.baseTokens, fail.totalTokens, fail.announcedFailed], ['B', 4, 5, true]);
    const silent = scoreHand({ ...v, announcedBy: null, trumpTeam: 'B', tricks: { A: 8, B: 0 } });
    assert.deepEqual([silent.winner, silent.baseTokens, silent.kapothi], ['A', 2, false]);
  });

  test('Kapothi can only be announced after the first six tricks by the sweeping team', () => {
    const h = fixedHand(
      [
        ['AS', 'KS', 'QS', 'JS', '10S', '9S', '8S', '7S'],
        ['AH', 'KH', 'QH', 'JH', '10H', '9H', '8H', '7H'],
        ['AD', 'KD', 'QD', 'JD', '10D', '9D', '8D', '7D'],
        ['AC', 'KC', 'QC', 'JC', '10C', '9C', '8C', '7C'],
      ],
      'S',
      0,
    );
    expectRule(() => announceKapothi(h, 0), 'CANNOT_ANNOUNCE');
    for (let t = 0; t < 6; t++) {
      for (let i = 0; i < 4; i++) playCard(h, h.turn as Seat, legalCardsFor(h, h.turn as Seat)[0].id);
      collectTrick(h);
    }
    assert.equal(h.tricks.A, 6);
    expectRule(() => announceKapothi(h, 1), 'CANNOT_ANNOUNCE');
    assert.equal(announceKapothi(h, 2), 'A');
    playOut(h);
    assert.equal(h.tricks.A, 8);
  });
});
