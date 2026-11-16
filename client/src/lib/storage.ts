/**
 * Small wrappers around localStorage. Only personal preferences and the
 * player's own reconnection token are stored – never game state.
 */
import type { SessionInfo } from '../../../shared/types';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

export interface Profile {
  nickname: string;
  avatar: string;
}

export const storage = {
  getProfile: () => read<Profile>('omi.profile', { nickname: '', avatar: 'elephant' }),
  setProfile: (p: Profile) => write('omi.profile', p),

  getSession: (code: string) => read<SessionInfo | null>(`omi.session.${code.toUpperCase()}`, null),
  setSession: (s: SessionInfo) => {
    write(`omi.session.${s.roomCode}`, s);
    write('omi.lastRoom', s.roomCode);
  },
  clearSession: (code: string) => {
    write(`omi.session.${code.toUpperCase()}`, null);
    if (read<string | null>('omi.lastRoom', null) === code) write('omi.lastRoom', null);
  },
  getLastRoom: () => read<string | null>('omi.lastRoom', null),

  read,
  write,
};
