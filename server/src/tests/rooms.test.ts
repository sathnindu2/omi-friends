import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { RuleError } from '../game/engine';
import { trickWinner } from '../../../shared/rules';
import type { RoomSnapshot, Seat, Suit } from '../../../shared/types';
import { fullRoom, setup, type FakeTransport } from './helpers';
import type { RoomManager } from '../rooms/RoomManager';

function expectRule(fn: () => unknown, code: string) {
  assert.throws(fn, (e: unknown) => e instanceof RuleError && e.code === code, `expected ${code}`);
}

/** Socket currently bound to each seat (tests may move players to new sockets). */
type SeatSockets = Record<number, string>;

function snap(t: FakeTransport, socket: string): RoomSnapshot {
  return t.lastSnapshot(socket);
}

/**
 * Drive the game forward by one action using only what each client can see
 * (its own snapshot). Returns false when the match is over.
 */
function step(rooms: RoomManager, t: FakeTransport, clock: { advance(ms: number): void }, seats: SeatSockets, pick = 'random'): boolean {
  const any = snap(t, seats[0]);
  const room = any.room;
  if (room.status === 'match_complete') return false;
  const g = room.game;
  assert.ok(g, 'game state present');
  if (g.phase === 'trick_review' || g.phase === 'hand_complete') {
    clock.advance(10_000);
    return true;
  }
  const seat = g.turn as Seat;
  const s = seats[seat];
  const mine = snap(t, s);
  if (g.phase === 'trump_selection') {
    rooms.chooseTrump(s, (['S', 'H', 'D', 'C'] as Suit[])[Math.floor(Math.random() * 4)]);
    return true;
  }
  const legal = mine.you.legalCardIds;
  assert.ok(legal.length > 0, 'player on turn has a legal card');
  const card = pick === 'random' ? legal[Math.floor(Math.random() * legal.length)] : legal[0];
  rooms.playCard(s, card);
  return true;
}

describe('rooms and lobby', () => {
  test('create room assigns host at seat 0 (Player 1) and a 6-character code', () => {
    const { rooms, transport } = setup();
    const s = rooms.createRoom('a', { nickname: '  Damsith  ', avatar: 'elephant' });
    assert.match(s.roomCode, /^[A-Z0-9]{6}$/);
    const snapA = transport.lastSnapshot('a');
    assert.equal(snapA.you.seat, 0);
    assert.equal(snapA.room.players[0].nickname, 'Damsith');
    assert.equal(snapA.room.hostId, s.playerId);
    assert.equal(snapA.room.settings.targetTokens, 10);
  });

  test('nicknames are sanitised and limited', () => {
    const { rooms, transport } = setup();
    rooms.createRoom('a', { nickname: '<script>alert(1)</script>VeryVeryLongNameHere', avatar: 'x' });
    const name = transport.lastSnapshot('a').room.players[0].nickname;
    assert.ok(!name.includes('<'));
    assert.ok(Array.from(name).length <= 16);
    expectRule(() => rooms.createRoom('b', { nickname: '   ', avatar: 'x' }), 'INVALID_NICKNAME');
  });

  test('unknown and malformed room codes give friendly errors', () => {
    const { rooms } = setup();
    expectRule(() => rooms.joinRoom('a', { code: 'ZZZZZZ', nickname: 'A', avatar: 'x' }), 'ROOM_NOT_FOUND');
    expectRule(() => rooms.joinRoom('a', { code: 'abc', nickname: 'A', avatar: 'x' }), 'INVALID_INVITE');
  });

  test('21. joining a full room is rejected', () => {
    const { rooms, code } = fullRoom();
    expectRule(() => rooms.joinRoom('s4', { code, nickname: 'Fifth', avatar: 'x' }), 'ROOM_FULL');
  });

  test('cannot join a game that has already started', () => {
    const { rooms, code } = fullRoom();
    rooms.startGame('s0');
    // free a seat by having someone leave mid-game – still not joinable
    expectRule(() => rooms.joinRoom('s9', { code, nickname: 'Late', avatar: 'x' }), 'GAME_ALREADY_STARTED');
  });

  test('only the host can start, and only when all four are connected and ready', () => {
    const { rooms } = fullRoom();
    expectRule(() => rooms.startGame('s1'), 'NOT_HOST');
    rooms.setReady('s3', false);
    expectRule(() => rooms.startGame('s0'), 'NOT_ALL_READY');
    rooms.setReady('s3', true);
    rooms.handleDisconnect('s2');
    expectRule(() => rooms.startGame('s0'), 'NOT_ALL_READY');
  });

  test('teams: seats 0 & 2 are Team A, 1 & 3 are Team B; seat selection works in the lobby', () => {
    const { rooms, transport } = setup();
    const s0 = rooms.createRoom('a', { nickname: 'A', avatar: 'x' });
    const s1 = rooms.joinRoom('b', { code: s0.roomCode, nickname: 'B', avatar: 'x' });
    const sessions = [s0, s1];
    assert.equal(transport.lastSnapshot('b').you.seat, 1);
    rooms.selectSeat('b', 2);
    assert.equal(transport.lastSnapshot('b').you.seat, 2);
    expectRule(() => rooms.selectSeat('b', 0), 'SEAT_TAKEN');
    assert.ok(sessions[1].sessionToken.length > 20);
  });

  test('host transfers when the host leaves; removing players works', () => {
    const { rooms, transport, sessions } = fullRoom();
    rooms.removePlayer('s0', sessions[3].playerId);
    assert.equal(transport.lastSnapshot('s0').room.players.length, 3);
    assert.ok(transport.eventsFor('s3', 'kicked').length === 1);
    rooms.leaveRoom('s0');
    assert.equal(transport.lastSnapshot('s1').room.hostId, sessions[1].playerId);
  });

  test('host permissions move to another player if the host stays disconnected', () => {
    const { rooms, transport, clock, sessions } = fullRoom();
    rooms.handleDisconnect('s0');
    clock.advance(10_001);
    assert.notEqual(transport.lastSnapshot('s1').room.hostId, sessions[0].playerId);
  });

  test('host can change the match target in the lobby only', () => {
    const { rooms, transport } = fullRoom();
    rooms.updateSettings('s0', { targetTokens: 5 });
    assert.equal(transport.lastSnapshot('s2').room.settings.targetTokens, 5);
    expectRule(() => rooms.updateSettings('s1', { targetTokens: 10 }), 'NOT_HOST');
    rooms.startGame('s0');
    expectRule(() => rooms.updateSettings('s0', { targetTokens: 10 }), 'GAME_ALREADY_STARTED');
  });

  test('abandoned rooms are cleaned up and then reported as expired', () => {
    const { rooms, clock, code } = fullRoom({ roomIdleTimeoutMs: 1000 });
    for (const s of ['s0', 's1', 's2', 's3']) rooms.handleDisconnect(s);
    clock.advance(2000);
    rooms.cleanup();
    assert.equal(rooms.hasRoom(code), false);
    expectRule(() => rooms.joinRoom('z', { code, nickname: 'A', avatar: 'x' }), 'ROOM_EXPIRED');
  });
});

describe('game flow through the room manager', () => {
  test('20. the dealer rotates one seat to the right every hand; 19. match ends at the target', () => {
    for (const target of [5, 10] as const) {
      const { rooms, transport, clock } = fullRoom({}, { targetTokens: target });
      rooms.startGame('s0');
      const seats: SeatSockets = { 0: 's0', 1: 's1', 2: 's2', 3: 's3' };
      const dealers: Seat[] = [];
      let lastHand = 0;
      let guard = 0;
      while (step(rooms, transport, clock, seats)) {
        const g = snap(transport, 's0').room.game;
        if (g && g.handNumber !== lastHand) {
          dealers.push(g.dealer);
          lastHand = g.handNumber;
        }
        assert.ok(++guard < 20_000, 'match should finish');
      }
      for (let i = 1; i < dealers.length; i++) assert.equal(dealers[i], (dealers[i - 1] + 1) % 4);
      const final = snap(transport, 's0').room;
      assert.equal(final.status, 'match_complete');
      assert.ok(final.match);
      const w = final.match.winner;
      const l = w === 'A' ? 'B' : 'A';
      assert.ok(final.tokens[w] >= target);
      assert.ok(final.tokens[l] < target);
      assert.equal(final.match.handsPlayed, dealers.length);
      assert.equal(transport.eventsFor('s2', 'match_completed').length, 1);
      // no further hand is dealt after the match ends
      clock.advance(60_000);
      assert.equal(snap(transport, 's0').room.game?.handNumber, dealers.length);
    }
  });

  test('tokens in the room always equal the sum of hand results (draw bonus included)', () => {
    const { rooms, transport, clock } = fullRoom();
    rooms.startGame('s0');
    const seats: SeatSockets = { 0: 's0', 1: 's1', 2: 's2', 3: 's3' };
    while (step(rooms, transport, clock, seats));
    const results = transport.eventsFor('s0', 'hand_completed') as { winner: 'A' | 'B' | null; totalTokens: number; draw: boolean; pendingBonusAfter: number }[];
    const sum = { A: 0, B: 0 };
    let pending = 0;
    for (const r of results) {
      if (r.draw) {
        pending += 1;
        assert.equal(r.pendingBonusAfter, pending);
      } else {
        assert.ok(r.winner);
        sum[r.winner] += r.totalTokens;
        pending = 0;
      }
    }
    assert.deepEqual(snap(transport, 's0').room.tokens, sum);
  });

  test('23. no player ever receives an opponent’s (or partner’s) hidden cards', () => {
    const { rooms, transport, clock, code, sessions } = fullRoom({}, { targetTokens: 5 });
    const socketSeat: Record<string, Seat> = { s0: 0, s1: 1, s2: 2, s3: 3 };
    const originalEmit = transport.emit.bind(transport);
    let checked = 0;
    transport.emit = ((socketId: string, event: never, ...args: never[]) => {
      const hand = rooms.debugHand(code);
      if (hand && socketId in socketSeat) {
        const json = JSON.stringify(args[0]);
        const me = socketSeat[socketId];
        for (let seat = 0; seat < 4; seat++) {
          if (seat === me) continue;
          for (const card of hand.hands[seat]) {
            assert.ok(!json.includes(`"id":"${card.id}"`), `${socketId} received hidden card ${card.id} of seat ${seat} in ${event}`);
          }
        }
        checked++;
      }
      (originalEmit as (...a: unknown[]) => void)(socketId, event, ...args);
    }) as typeof transport.emit;

    rooms.startGame('s0');
    const seats: SeatSockets = { 0: 's0', 1: 's1', 2: 's2', 3: 's3' };
    // include a reconnect in the middle
    for (let i = 0; i < 40; i++) step(rooms, transport, clock, seats);
    rooms.handleDisconnect('s1');
    rooms.reconnect('s1', { code, sessionToken: sessions[1].sessionToken });
    while (step(rooms, transport, clock, seats));
    assert.ok(checked > 100);
    // the snapshot only ever contains your own hand
    const s = snap(transport, 's2');
    assert.ok(!('hands' in (s.room as object)));
  });

  test('24. duplicate card-play messages do not corrupt the game state', () => {
    const { rooms, transport } = fullRoom();
    rooms.startGame('s0');
    let g = snap(transport, 's0').room.game!;
    rooms.chooseTrump(`s${g.trumpSelector}`, 'S');
    g = snap(transport, 's0').room.game!;
    const leader = g.turn as Seat;
    const card = snap(transport, `s${leader}`).you.legalCardIds[0];
    rooms.playCard(`s${leader}`, card);
    assert.throws(() => rooms.playCard(`s${leader}`, card), RuleError);
    assert.throws(() => rooms.playCard(`s${leader}`, card), RuleError);
    const after = snap(transport, 's0');
    assert.equal(after.room.game!.currentTrick.length, 1);
    assert.equal(after.room.game!.turn, (leader + 1) % 4);
    assert.equal(after.room.players.find((p) => p.seat === leader)!.cardCount, 7);
    // duplicate trump choice is also rejected
    assert.throws(() => rooms.chooseTrump(`s${g.trumpSelector}`, 'H'), RuleError);
    assert.equal(snap(transport, 's0').room.game!.trump, 'S');
  });

  test('22. reconnection restores the same seat and hand on a new socket; old socket is kicked', () => {
    const { rooms, transport, sessions, code } = fullRoom();
    rooms.startGame('s0');
    const before = snap(transport, 's2');
    rooms.handleDisconnect('s2');
    const paused = snap(transport, 's0');
    assert.equal(paused.room.paused, true);
    assert.equal(paused.room.players.find((p) => p.seat === 2)!.connected, false);

    const info = rooms.reconnect('new-socket', { code, sessionToken: sessions[2].sessionToken });
    assert.equal(info.playerId, sessions[2].playerId);
    const after = snap(transport, 'new-socket');
    assert.equal(after.you.seat, 2);
    assert.deepEqual(after.you.hand, before.you.hand);
    assert.equal(after.room.players.length, 4);
    assert.equal(after.room.paused, false);

    // a second device with the same token replaces the first one
    rooms.reconnect('third-socket', { code, sessionToken: sessions[2].sessionToken });
    assert.deepEqual(transport.eventsFor('new-socket', 'kicked'), [{ reason: 'session_replaced' }]);
    assert.ok(transport.disconnected.includes('new-socket'));
    expectRule(() => rooms.setReady('new-socket', true), 'NOT_IN_ROOM');

    // a wrong token never gets a seat
    expectRule(() => rooms.reconnect('evil', { code, sessionToken: 'guess' }), 'SESSION_INVALID');
  });

  test('rejoining in the lobby reclaims the seat instead of becoming a fifth player', () => {
    const { rooms, transport, sessions, code } = fullRoom();
    rooms.handleDisconnect('s3');
    rooms.reconnect('s3b', { code, sessionToken: sessions[3].sessionToken });
    const s = snap(transport, 's3b');
    assert.equal(s.room.players.length, 4);
    assert.equal(s.you.seat, 3);
  });

  test('25. a disconnect during a trick pauses the game and does not change turn order or the winner', () => {
    const { rooms, transport, sessions, code } = fullRoom();
    rooms.startGame('s0');
    let g = snap(transport, 's0').room.game!;
    rooms.chooseTrump(`s${g.trumpSelector}`, 'H');
    g = snap(transport, 's0').room.game!;
    const first = g.turn as Seat;
    const second = ((first + 1) % 4) as Seat;
    const third = ((first + 2) % 4) as Seat;
    rooms.playCard(`s${first}`, snap(transport, `s${first}`).you.legalCardIds[0]);
    rooms.playCard(`s${second}`, snap(transport, `s${second}`).you.legalCardIds[0]);

    const trickBefore = snap(transport, 's0').room.game!.currentTrick;
    rooms.handleDisconnect(`s${third}`);
    const paused = snap(transport, `s${first}`);
    assert.equal(paused.room.paused, true);
    assert.equal(paused.room.game!.turn, third);
    assert.deepEqual(paused.you.legalCardIds, []);
    // nobody can act while paused
    expectRule(() => rooms.playCard(`s${first}`, paused.you.hand[0].id), 'GAME_PAUSED');

    rooms.reconnect(`r${third}`, { code, sessionToken: sessions[third].sessionToken });
    const resumed = snap(transport, `r${third}`);
    assert.equal(resumed.room.game!.turn, third);
    assert.deepEqual(resumed.room.game!.currentTrick, trickBefore);
    rooms.playCard(`r${third}`, resumed.you.legalCardIds[0]);
    const fourth = ((first + 3) % 4) as Seat;
    rooms.playCard(`s${fourth}`, snap(transport, `s${fourth}`).you.legalCardIds[0]);
    const done = snap(transport, 's0').room.game!;
    assert.equal(done.phase, 'trick_review');
    assert.equal(done.trickWinner, trickWinner(done.currentTrick, 'H').seat);
  });

  test('players may abandon only after the reconnect timeout, by agreement', () => {
    const { rooms, transport, clock } = fullRoom();
    rooms.startGame('s0');
    rooms.handleDisconnect('s3');
    expectRule(() => rooms.voteAbandon('s0'), 'WRONG_PHASE');
    clock.advance(60_001);
    rooms.voteAbandon('s0');
    rooms.voteAbandon('s1');
    assert.equal(snap(transport, 's0').room.status, 'playing');
    rooms.voteAbandon('s2');
    const s = snap(transport, 's0');
    assert.equal(s.room.status, 'lobby');
    assert.equal(s.room.players.length, 3);
  });

  test('rematch resets the score and bonus and starts a new game without rejoining', () => {
    const { rooms, transport, clock } = fullRoom({}, { targetTokens: 5 });
    rooms.startGame('s0');
    const seats: SeatSockets = { 0: 's0', 1: 's1', 2: 's2', 3: 's3' };
    while (step(rooms, transport, clock, seats));
    for (const s of ['s0', 's1', 's2']) rooms.requestRematch(s);
    assert.equal(snap(transport, 's0').room.status, 'match_complete');
    assert.equal(snap(transport, 's0').room.rematchVotes.length, 3);
    rooms.requestRematch('s3');
    const r = snap(transport, 's0').room;
    assert.equal(r.status, 'playing');
    assert.deepEqual(r.tokens, { A: 0, B: 0 });
    assert.equal(r.pendingBonus, 0);
    assert.equal(r.game!.handNumber, 1);
    assert.equal(r.game!.phase, 'trump_selection');
    assert.equal(r.players.length, 4);
  });

  test('every snapshot hand for the player on turn matches the authoritative hand', () => {
    const { rooms, transport, code } = fullRoom();
    rooms.startGame('s0');
    const hand = rooms.debugHand(code)!;
    for (let seat = 0; seat < 4; seat++) {
      assert.deepEqual(
        snap(transport, `s${seat}`).you.hand.map((c) => c.id),
        hand.hands[seat].map((c) => c.id),
      );
      assert.equal(snap(transport, `s${seat}`).you.hand.length, 4);
    }
  });
});
