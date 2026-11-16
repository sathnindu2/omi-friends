/** Server configuration, read from environment variables (see .env.example). */

try {
  // Node 20.12+ can read a .env file without any extra package.
  process.loadEnvFile?.();
} catch {
  /* no .env file – that's fine */
}

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

export interface RoomTimings {
  /** in-game reconnect window before others may abandon */
  reconnectTimeoutMs: number;
  /** lobby: disconnected players lose their seat after this */
  lobbyReconnectTimeoutMs: number;
  /** host permissions move to another player after the host is gone this long */
  hostTransferMs: number;
  /** how long a finished trick stays on the table */
  trickReviewMs: number;
  /** how long the hand-result screen shows before the next deal */
  handResultMs: number;
  /** delete rooms with nobody connected after this long */
  roomIdleTimeoutMs: number;
  /** hard limit on room lifetime */
  roomMaxAgeMs: number;
}

export const config = {
  port: num('PORT', 3001),
  isProduction: process.env.NODE_ENV === 'production',
  clientOrigins: (process.env.CLIENT_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true',
  timings: {
    reconnectTimeoutMs: num('RECONNECT_TIMEOUT_MS', 3 * 60_000),
    lobbyReconnectTimeoutMs: num('LOBBY_RECONNECT_TIMEOUT_MS', 2 * 60_000),
    hostTransferMs: num('HOST_TRANSFER_MS', 15_000),
    trickReviewMs: num('TRICK_REVIEW_MS', 1600),
    handResultMs: num('HAND_RESULT_MS', 9000),
    roomIdleTimeoutMs: num('ROOM_IDLE_TIMEOUT_MS', 30 * 60_000),
    roomMaxAgeMs: num('ROOM_MAX_AGE_MS', 24 * 60 * 60_000),
  } satisfies RoomTimings,
};
