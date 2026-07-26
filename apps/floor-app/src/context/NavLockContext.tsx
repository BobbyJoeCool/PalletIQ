import { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface NavLockContextValue {
  locked: boolean;
  setLocked: (locked: boolean) => void;
}

const NavLockContext = createContext<NavLockContextValue | null>(null);

/**
 * Provides shell-wide navigation-lock state. While locked is true, the app shell
 * disables Back, Home, Jump, and Logout so a worker can't leave a screen mid-transaction
 * (e.g. an active SDP reservation) without resolving it first.
 */
export function NavLockProvider({ children }: { children: React.ReactNode }) {
  const [locked, setLockedState] = useState(false);

  /** Updates the shell-wide navigation lock flag. */
  const setLocked = useCallback((v: boolean) => setLockedState(v), []);

  return (
    <NavLockContext.Provider value={{ locked, setLocked }}>
      {children}
    </NavLockContext.Provider>
  );
}

/**
 * Hook that returns `{ locked, setLocked }` from the nearest NavLockProvider.
 * Must be called inside a NavLockProvider; throws if used outside.
 */
export function useNavLockContext(): NavLockContextValue {
  const ctx = useContext(NavLockContext);
  if (!ctx) throw new Error('useNavLockContext must be used inside NavLockProvider');
  return ctx;
}

/**
 * Convenience hook for screens to register their navigation-lock state. Syncs `locked`
 * to the shell whenever it changes, and always releases the lock on unmount so navigating
 * away some other way (e.g. a programmatic reset) never leaves the shell stuck locked.
 *
 * @param locked - True while this screen should block Back/Home/Jump/Logout
 */
export function useNavLock(locked: boolean) {
  const { setLocked } = useNavLockContext();

  useEffect(() => {
    setLocked(locked);
  }, [locked, setLocked]);

  useEffect(() => {
    return () => setLocked(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
