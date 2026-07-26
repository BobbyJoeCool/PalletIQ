import { createContext, useContext, useState } from 'react';

interface ELZContextValue {
  aisle: number | null;
  setAisle: (a: number | null) => void;
  storageCode: string;
  setStorageCode: (v: string) => void;
}

const ELZContext = createContext<ELZContextValue | null>(null);

/**
 * Session-level store for ELZ's Aisle/Storage Code filter (App-Wide screen-persistence
 * item, v1.7.0) — mounted once inside the authenticated route tree (see App.tsx) so
 * navigating away from ELZ and back restores the last-viewed aisle instead of resetting
 * to the empty Ready state. Deliberately persists the filter *inputs*, not a cached
 * `EmptyByZoneResult` — `ELZPage`'s own query effect already re-fetches fresh data
 * whenever `aisle` is set, same reasoning as `ELAContext`. Doesn't override router-state
 * prefill (`?aisle=`/nav state from ELA/STG) — that still wins on a fresh navigation into
 * ELZ with explicit state attached; this only fills the gap for a plain back-navigation
 * with no state of its own. State clears naturally on logout, since ProtectedRoute
 * unmounts this provider along with the rest of the authenticated tree when the session
 * token is cleared.
 */
export function ELZProvider({ children }: { children: React.ReactNode }) {
  const [aisle, setAisle] = useState<number | null>(null);
  const [storageCode, setStorageCode] = useState('');
  return (
    <ELZContext.Provider value={{ aisle, setAisle, storageCode, setStorageCode }}>
      {children}
    </ELZContext.Provider>
  );
}

/** Hook that returns the current ELZ context: the Aisle/Storage Code filter. Must be called inside an ELZProvider; throws if used outside. */
export function useELZ(): ELZContextValue {
  const ctx = useContext(ELZContext);
  if (!ctx) throw new Error('useELZ must be used inside ELZProvider');
  return ctx;
}
