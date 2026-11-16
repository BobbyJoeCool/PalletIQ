import type { DesktopUser } from './api';

/**
 * Persistence for the desktop session (token + user) in the renderer's `localStorage`.
 * Unlike the floor app's kiosk rule (never restore a session in production), a desktop
 * session is meant to survive closing and reopening the app, so it is restored whenever
 * the stored token has not expired yet. Keys are namespaced apart from the floor app's.
 */

const TOKEN_KEY = 'palletiq_desktop_token';
const USER_KEY = 'palletiq_desktop_user';

export interface StoredSession {
  token: string;
  user: DesktopUser;
}

/**
 * Reads the expiry time out of a JWT's payload without verifying it — verification is
 * the API's job; this only decides when the UI should stop presenting a session.
 *
 * @param token - a JWT string
 * @returns expiry as epoch milliseconds, or null if the token is malformed or has no `exp`
 */
export function tokenExpiryMs(token: string): number | null {
  try {
    const payloadSegment = token.split('.')[1];
    // JWT segments are base64url; atob needs standard base64.
    const payload: unknown = JSON.parse(
      atob(payloadSegment.replace(/-/g, '+').replace(/_/g, '/'))
    );
    const exp = (payload as { exp?: unknown } | null)?.exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Removes any persisted desktop session. */
export function clearStoredSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/**
 * Persists a session so it can be restored on the next launch.
 *
 * @param session - the token and user from a successful login
 */
export function writeStoredSession(session: StoredSession): void {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

/**
 * Loads the persisted session if it is still usable, and purges it from storage if it
 * is not (missing half, unparseable, or an expired/expiry-less token) — the name says
 * "prune" because this read can delete.
 *
 * @returns the stored session, or null if there is none worth restoring
 */
export function loadStoredSessionPruningExpired(): StoredSession | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const rawUser = localStorage.getItem(USER_KEY);
  if (!token || !rawUser) {
    clearStoredSession();
    return null;
  }

  const expiry = tokenExpiryMs(token);
  if (expiry === null || expiry <= Date.now()) {
    clearStoredSession();
    return null;
  }

  try {
    return { token, user: JSON.parse(rawUser) as DesktopUser };
  } catch {
    clearStoredSession();
    return null;
  }
}
