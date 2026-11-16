import type { RoomTimings } from '../config';
import { RoomManager, type Scheduler, type Transport } from '../rooms/RoomManager';
import type { RoomSnapshot, ServerToClientEvents, SessionInfo } from '../../../shared/types';

export interface Sent {
  socketId: string;
  event: keyof ServerToClientEvents;
  payload: unknown;
}

export class FakeTransport implements Transport {
  sent: Sent[] = [];
  disconnected: string[] = [];
  emit<E extends keyof ServerToClientEvents>(socketId: string, event: E, ...args: Parameters<ServerToClientEvents[E]>) {
    this.sent.push({ socketId, event, payload: args[0] });
  }
  disconnect(socketId: string) {
    this.disconnected.push(socketId);
  }
  /** latest snapshot delivered to a socket */
  lastSnapshot(socketId: string): RoomSnapshot {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const s = this.sent[i];
      if (s.socketId === socketId && s.event === 'room_updated') return s.payload as RoomSnapshot;
    }
    throw new Error(`no snapshot for ${socketId}`);
  }
  eventsFor(socketId: string, event: keyof ServerToClientEvents) {
    return this.sent.filter((s) => s.socketId === socketId && s.event === event).map((s) => s.payload);
  }
}

/** Deterministic, manually advanced clock. */
export class ManualScheduler implements Scheduler {
  time = 1_000_000;
  private tasks: { at: number; fn: () => void; id: number }[] = [];
  private nextId = 1;
  now() {
    return this.time;
  }
  schedule(fn: () => void, ms: number) {
    const id = this.nextId++;
    this.tasks.push({ at: this.time + ms, fn, id });
    return () => {
      this.tasks = this.tasks.filter((t) => t.id !== id);
    };
  }
  advance(ms: number) {
    const target = this.time + ms;
    for (;;) {
      this.tasks.sort((a, b) => a.at - b.at || a.id - b.id);
      const t = this.tasks[0];
      if (!t || t.at > target) break;
      this.tasks.shift();
      this.time = t.at;
      t.fn();
    }
    this.time = target;
  }
  get pending() {
    return this.tasks.length;
  }
}

export const TEST_TIMINGS: RoomTimings = {
  reconnectTimeoutMs: 60_000,
  lobbyReconnectTimeoutMs: 30_000,
  hostTransferMs: 10_000,
  trickReviewMs: 1000,
  handResultMs: 5000,
  roomIdleTimeoutMs: 600_000,
  roomMaxAgeMs: 24 * 3600_000,
};

export function setup(timings: Partial<RoomTimings> = {}) {
  const transport = new FakeTransport();
  const clock = new ManualScheduler();
  const rooms = new RoomManager(transport, { ...TEST_TIMINGS, ...timings }, clock);
  return { transport, clock, rooms };
}

/** Create a room with four connected, ready players on sockets s0..s3. */
export function fullRoom(timings: Partial<RoomTimings> = {}, settings?: { targetTokens?: 5 | 10; announcedKapothi?: boolean }) {
  const env = setup(timings);
  const { rooms } = env;
  const sessions: SessionInfo[] = [];
  sessions.push(rooms.createRoom('s0', { nickname: 'Damsith', avatar: 'elephant', settings }));
  const code = sessions[0].roomCode;
  for (const [i, name] of ['Kasun', 'Nimali', 'Ruwan'].entries()) {
    sessions.push(rooms.joinRoom(`s${i + 1}`, { code, nickname: name, avatar: 'peacock' }));
  }
  for (let i = 0; i < 4; i++) rooms.setReady(`s${i}`, true);
  return { ...env, code, sessions, sockets: ['s0', 's1', 's2', 's3'] };
}

/** socket id currently sitting at a seat (sN sits at seat N unless moved) */
export function socketOfSeat(seat: number) {
  return `s${seat}`;
}
