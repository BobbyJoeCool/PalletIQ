import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { DesktopUser } from '../lib/api';
import {
  clearStoredSession,
  loadStoredSessionPruningExpired,
  tokenExpiryMs,
  writeStoredSession,
} from '../lib/session';
import type { StoredSession } from '../lib/session';
import { AuthContext } from './authContext';

/** Longest delay a browser timer honours (2^31 - 1 ms); a 12h token is far below it. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Provides the desktop session (token + user) and the login/logout actions to the app.
 *
 * Differences from the floor app's AuthContext, both deliberate:
 *   - The session is restored from localStorage on launch in every build, not only in
 *     development — a desktop app is expected to still be signed in when reopened.
 *   - There is no 15-minute idle logout. The session simply ends when the token's own
 *     12-hour expiry passes, which the effect below enforces with a single timer.
 *
 * Navigation is not done here: routes are guarded on `token` (see App.tsx), so clearing
 * the session is what sends the user back to the login screen.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(loadStoredSessionPruningExpired);

  const logout = useCallback(() => {
    clearStoredSession();
    setSession(null);
  }, []);

  const login = useCallback((token: string, user: DesktopUser) => {
    const next = { token, user };
    writeStoredSession(next);
    setSession(next);
  }, []);

  const token = session?.token ?? null;

  // Sign out at the moment the token expires, so the UI never presents a session the
  // API would reject on the next call.
  useEffect(() => {
    if (!token) return;
    const expiry = tokenExpiryMs(token);
    if (expiry === null) return;
    const timer = setTimeout(logout, Math.min(Math.max(expiry - Date.now(), 0), MAX_TIMEOUT_MS));
    return () => clearTimeout(timer);
  }, [token, logout]);

  const value = useMemo(
    () => ({ token, user: session?.user ?? null, login, logout }),
    [token, session, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
