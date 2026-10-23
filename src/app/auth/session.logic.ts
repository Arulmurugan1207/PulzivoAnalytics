// Pure session helpers (no Angular deps) so they run under `node --test`.

/** Refresh the token once it is older than this (sliding ~1-year session). */
export const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
/** Always refresh when fewer than this many ms remain (covers legacy 24h tokens). */
export const REFRESH_WHEN_REMAINING_MS = 30 * 24 * 60 * 60 * 1000;

export const SESSION_STORAGE_KEYS = [
  'authToken', 'userData', 'user_api_keys', 'apiKeyTracking', 'rememberedEmail', 'token',
  'currentUser', 'userEmail',
];

export function decodeJwtPayload(token: string | null | undefined): Record<string, any> | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (b64.length % 4)) % 4;
    if (pad) b64 += '='.repeat(pad);
    const p = JSON.parse(atob(b64));
    return p && typeof p === 'object' ? p : null;
  } catch {
    return null;
  }
}

export function decodeJwtExpiryMs(token: string): number | null {
  const p = decodeJwtPayload(token);
  return p && typeof p['exp'] === 'number' ? p['exp'] * 1000 : null;
}

export function isJwtExpired(token: string, now = Date.now()): boolean {
  const exp = decodeJwtExpiryMs(token);
  return exp !== null && now >= exp;
}

/** True when a stored token exists, parses, and hasn't hit its exp. */
export function hasValidToken(token: string | null | undefined, now = Date.now()): boolean {
  if (!token || !decodeJwtPayload(token)) return false;
  return !isJwtExpired(token, now);
}

export function shouldRefreshToken(token: string | null | undefined, now = Date.now()): boolean {
  if (!hasValidToken(token, now)) return false;
  const p = decodeJwtPayload(token)!;
  const iatMs = typeof p['iat'] === 'number' ? p['iat'] * 1000 : 0;
  const expMs = typeof p['exp'] === 'number' ? p['exp'] * 1000 : Infinity;
  return now - iatMs >= REFRESH_AFTER_MS || expMs - now <= REFRESH_WHEN_REMAINING_MS;
}

/**
 * Only a real "your token is invalid" 401 from our API should log the user out.
 * Network errors (status 0), 5xx, 403, 429, analytics API-key 401s, and
 * credential failures on sign-in/sign-up must NOT.
 */
export function isInvalidTokenError(status: number, body: any, url: string, sentToken: boolean): boolean {
  if (status !== 401 || !sentToken) return false;
  if (/\/users\/(signin|signup|forgot-password|reset-password)/.test(url)) return false;
  return !!body && typeof body === 'object' && body.code === 'TOKEN_INVALID';
}

/** Only allow same-origin, in-app return URLs. */
export function safeReturnUrl(raw: unknown, fallback = '/dashboard'): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return fallback;
  }
  const path = raw.split('?')[0].split('#')[0];
  if (/^\/(login|signin|signup|register)\/?$/.test(path)) return fallback;
  return raw;
}

export function clearStoredSession(storage: Pick<Storage, 'removeItem'>): void {
  for (const k of SESSION_STORAGE_KEYS) storage.removeItem(k);
}
