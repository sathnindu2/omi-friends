/**
 * Tests the Socket.IO handler layer (validation, acknowledgements, rate limits)
 * with a tiny in-memory stand-in for the Socket.IO server.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { registerHandlers } from '../sockets/registerHandlers';
import type { AckResponse, SessionInfo } from '../../../shared/types';
import { setup } from './helpers';

type Handler = (payload: unknown, ack?: (r: AckResponse<unknown>) => void) => void;

class FakeSocket {
  handlers = new Map<string, Handler>();
  emitted: { event: string; payload: unknown }[] = [];
  handshake = { headers: {} as Record<string, string>, address: '10.0.0.1' };
  constructor(public id: string) {}
  on(event: string, fn: Handler) {
    this.handlers.set(event, fn);
  }
  emit(event: string, payload: unknown) {
    this.emitted.push({ event, payload });
  }
  call<T = unknown>(event: string, payload: unknown): AckResponse<T> {
    let res: AckResponse<T> | undefined;
    this.handlers.get(event)!(payload, (r) => (res = r as AckResponse<T>));
    assert.ok(res, `no ack for ${event}`);
    return res;
  }
}

function fakeIo() {
  let onConnection: (s: FakeSocket) => void = () => {};
  return {
    on(_event: 'connection', fn: (s: FakeSocket) => void) {
      onConnection = fn;
    },
    connect(id: string) {
      const s = new FakeSocket(id);
      onConnection(s);
      return s;
    },
  };
}

describe('socket handlers', () => {
  test('valid requests are acknowledged with data; invalid payloads are rejected', () => {
    const { rooms } = setup();
    const io = fakeIo();
    const reg = registerHandlers(io as never, rooms, false);
    const a = io.connect('a');
    const created = a.call<SessionInfo>('create_room', { nickname: 'Damsith', avatar: 'elephant' });
    assert.equal(created.ok, true);
    assert.ok(created.ok && created.data.roomCode.length === 6);

    const bad = a.call('play_card', { cardId: 12345 });
    assert.deepEqual(bad.ok ? null : bad.error.code, 'INVALID_INPUT');
    const bad2 = a.call('select_seat', { seat: 7 });
    assert.deepEqual(bad2.ok ? null : bad2.error.code, 'INVALID_INPUT');
    assert.ok(a.emitted.some((e) => e.event === 'game_error'));

    const b = io.connect('b');
    const notFound = b.call('join_room', { code: 'QQQQQQ', nickname: 'X', avatar: 'x' });
    assert.equal(notFound.ok ? null : notFound.error.code, 'ROOM_NOT_FOUND');
    const notInRoom = b.call('play_card', { cardId: 'AS' });
    assert.equal(notInRoom.ok ? null : notInRoom.error.code, 'NOT_IN_ROOM');
    reg.stop();
  });

  test('room creation is rate limited per IP address', () => {
    const { rooms } = setup();
    const io = fakeIo();
    const reg = registerHandlers(io as never, rooms, false, { createLimit: 3 });
    const results = [];
    for (let i = 0; i < 5; i++) {
      const s = io.connect(`c${i}`);
      results.push(s.call('create_room', { nickname: `P${i}`, avatar: 'tea' }).ok);
    }
    assert.deepEqual(results, [true, true, true, false, false]);
    reg.stop();
  });

  test('a flood of messages from one socket is throttled', () => {
    const { rooms } = setup();
    const io = fakeIo();
    const reg = registerHandlers(io as never, rooms, false, { eventLimit: 5 });
    const s = io.connect('flood');
    const codes = [];
    for (let i = 0; i < 8; i++) {
      const r = s.call('player_ready', { ready: true });
      codes.push(r.ok ? 'ok' : r.error.code);
    }
    assert.deepEqual(codes.slice(5), ['RATE_LIMITED', 'RATE_LIMITED', 'RATE_LIMITED']);
    reg.stop();
  });
});
