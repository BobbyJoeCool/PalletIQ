import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import type { AuthUser } from '../lib/api';

const STORAGE_KEY = 'palletiq_token';
const STORAGE_USER_KEY = 'palletiq_user';
const IDLE_MS = 15 * 60 * 1000;       // 15-minute idle timeout
const IDLE_CHECK_MS = 30_000;          // check idle every 30 seconds

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Provides authentication state (token, user) and auth actions (login, logout)
 * to the entire React app tree. Handles idle-timeout detection: the session
 * auto-logs out after 15 minutes of no user activity (click, keydown, or touchstart).
 *
 * Session persistence rules:
 *   - Production: never restores a session from localStorage on page load.
 *     Every page load starts at the login screen, matching physical warehouse kiosk behavior.
 *   - Development: restores a valid non-expired token from localStorage to avoid
 *     re-logging in on every hot reload.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const lastActivityRef = useRef(Date.now());

  const [token, setToken] = useState<string | null>(() => {
    if (!import.meta.env.DEV) {
      // Production: always start at login — clear any leftover dev session.
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_USER_KEY);
      return null;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    // In dev, still reject expired JWTs so a stale token from days ago doesn't persist.
    try {
      const payload = JSON.parse(atob(stored.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_USER_KEY);
        return null;
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_USER_KEY);
      return null;
    }
    return stored;
  });
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (!import.meta.env.DEV) return null;
    const stored = localStorage.getItem(STORAGE_USER_KEY);
    return stored ? (JSON.parse(stored) as AuthUser) : null;
  });

  /**
   * Persists the session token and user record, then resets the idle timer.
   * In dev mode, writes to localStorage so the session survives hot reloads.
   */
  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
    setToken(null);
    setUser(null);
    navigate('/login');
  }, [navigate]);

  /**
   * Stores token and user in state (and localStorage in dev), and resets the idle
   * timer so a fresh login always starts a full 15-minute window.
   */
  const login = useCallback((newToken: string, newUser: AuthUser) => {
    localStorage.setItem(STORAGE_KEY, newToken);
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(newUser));
    lastActivityRef.current = Date.now();
    setToken(newToken);
    setUser(newUser);
  }, []);

  // Idle-timeout effect: attaches event listeners that bump lastActivityRef on any user input,
  // then polls every 30 s to check whether the session has been idle for > 15 minutes.
  useEffect(() => {
    if (!token) return;

    /** Records the current time as the last user-activity timestamp. */
    const bump = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('click', bump);
    window.addEventListener('keydown', bump);
    window.addEventListener('touchstart', bump);

    const timer = setInterval(() => {
      if (Date.now() - lastActivityRef.current > IDLE_MS) logout();
    }, IDLE_CHECK_MS);

    return () => {
      window.removeEventListener('click', bump);
      window.removeEventListener('keydown', bump);
      window.removeEventListener('touchstart', bump);
      clearInterval(timer);
    };
  }, [token, logout]);

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook that returns the current auth context: `{ token, user, login, logout }`.
 * Must be called inside an AuthProvider; throws if used outside.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
