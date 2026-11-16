import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const MAX_NICKNAME_LENGTH = 16;

/**
 * Clean a nickname: remove control characters and HTML-ish brackets,
 * collapse whitespace, limit the length. Sinhala and emoji are allowed.
 * Returns null if nothing usable is left.
 */
export function sanitizeNickname(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let s = input.normalize('NFC');
  // strip control chars (keep ZWJ U+200D, used in Sinhala conjuncts)
  s = s.replace(/[\u0000-\u001F\u007F-\u009F​‌‎‏‪-‮⁦-⁩]/g, '');
  s = s.replace(/[<>&"'`\\]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  const chars = Array.from(s);
  if (chars.length > MAX_NICKNAME_LENGTH) s = chars.slice(0, MAX_NICKNAME_LENGTH).join('').trim();
  return s.length >= 1 ? s : null;
}

/** Unambiguous characters for room codes (no 0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function normalizeRoomCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== ROOM_CODE_LENGTH) return null;
  return code;
}

export function generateId(bytes = 9): string {
  return randomBytes(bytes).toString('base64url');
}

/** Secret reconnection token, given to the browser once. Only its hash is stored. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenMatches(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Simple fixed-window rate limiter keyed by e.g. IP address or socket id. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private limit: number,
    private windowMs: number,
    private now: () => number = Date.now,
  ) {}

  /** Returns true if the action is allowed. */
  take(key: string): boolean {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }

  prune() {
    const t = this.now();
    for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
  }
}
