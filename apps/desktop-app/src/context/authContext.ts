import { createContext, useContext } from 'react';
import type { DesktopUser } from '../lib/api';

export interface AuthContextValue {
  token: string | null;
  user: DesktopUser | null;
  /** Stores a freshly issued session and makes it the current one. */
  login: (token: string, user: DesktopUser) => void;
  /** Clears the current session; the route guard then returns to the login screen. */
  logout: () => void;
}

/** Context object only — the provider component lives in AuthProvider.tsx. */
export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Hook returning the current auth context: `{ token, user, login, logout }`.
 * Must be called inside an AuthProvider; throws if used outside.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
