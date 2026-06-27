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
const IDLE_MS = 15 * 60 * 1000;
const IDLE_CHECK_MS = 30_000;

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const lastActivityRef = useRef(Date.now());

  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem(STORAGE_USER_KEY);
    return stored ? (JSON.parse(stored) as AuthUser) : null;
  });

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
    setToken(null);
    setUser(null);
    navigate('/login');
  }, [navigate]);

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    localStorage.setItem(STORAGE_KEY, newToken);
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(newUser));
    lastActivityRef.current = Date.now();
    setToken(newToken);
    setUser(newUser);
  }, []);

  useEffect(() => {
    if (!token) return;

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

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
