import { createContext, useContext, useState } from 'react';

interface WLHContextValue {
  /** The most recently resolved Single-mode location id (canonical 8-digit
   *  Aisle+Bin+Level), or null if none has been resolved this session yet. Deliberately
   *  just the id, not a cached details object — `HoldPanel` re-fetches the location's own
   *  live status/hold/contraction from this id on mount, so a stale cached object never
   *  has the chance to show outdated hold state after navigating back. */
  locationId: string | null;
  setLocationId: (id: string | null) => void;
}

const WLHContext = createContext<WLHContextValue | null>(null);

/**
 * Session-level store for WLH's "currently resolved Single-mode location" (App-Wide
 * screen-persistence item, v1.7.0 — mirrors LIIContext's/PIIContext's/ISIContext's own
 * per-screen pattern) — mounted once inside the authenticated route tree (see App.tsx)
 * so navigating away from WLH and back restores the last-resolved location instead of
 * resetting to the empty Ready state. Range mode's own preview/breakdown state and the
 * session hold log stay screen-local (not persisted) — those are working state for the
 * current visit, not "the thing you were looking at," the same distinction LII/PII/ISI
 * already draw between their own loaded result and in-progress entry fields. State
 * clears naturally on logout, since ProtectedRoute unmounts this provider along with the
 * rest of the authenticated tree when the session token is cleared.
 */
export function WLHProvider({ children }: { children: React.ReactNode }) {
  const [locationId, setLocationId] = useState<string | null>(null);
  return (
    <WLHContext.Provider value={{ locationId, setLocationId }}>
      {children}
    </WLHContext.Provider>
  );
}

/** Hook that returns the current WLH context: the last-resolved Single-mode location id. Must be called inside a WLHProvider; throws if used outside. */
export function useWLH(): WLHContextValue {
  const ctx = useContext(WLHContext);
  if (!ctx) throw new Error('useWLH must be used inside WLHProvider');
  return ctx;
}
