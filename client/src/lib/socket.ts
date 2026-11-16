import { io, type Socket } from 'socket.io-client';
import type { AckResponse, ClientToServerEvents, ServerToClientEvents } from '../../../shared/types';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * One shared Socket.IO connection.
 * By default the game server is the same address as the website
 * (in development Vite forwards /socket.io to localhost:3001).
 */
const serverUrl: string | undefined = import.meta.env.VITE_SERVER_URL || undefined;

export const socket: GameSocket = serverUrl
  ? io(serverUrl, { autoConnect: true, transports: ['websocket', 'polling'] })
  : io({ autoConnect: true, transports: ['websocket', 'polling'] });

type PayloadOf<E extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[E]>[0];
type DataOf<E extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[E]>[1] extends (r: infer R) => void
    ? R extends { ok: true; data: infer D }
      ? D
      : never
    : never;

/** Emit an event and wait for the server's acknowledgement. */
export function request<E extends keyof ClientToServerEvents>(
  event: E,
  payload: PayloadOf<E>,
  timeoutMs = 8000,
): Promise<AckResponse<DataOf<E>>> {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket.timeout(timeoutMs) as any).emit(event, payload, (err: unknown, res: AckResponse<DataOf<E>>) => {
      if (err) resolve({ ok: false, error: { code: 'SERVER_ERROR', message: 'TIMEOUT' } });
      else resolve(res);
    });
  });
}
