import { createContext, useContext, useState } from 'react';

interface SARContextValue {
  /** The most recently selected aisle row (drives the "Go to Directed Put"/"Go to Stage
   *  Aisle" buttons), or null if none is selected. Deliberately the *only* thing
   *  persisted here — SAR's actual report rows always re-fetch fresh on every mount (see
   *  SARPage.tsx's own effect) and deliberately aren't cached: this is a live report of
   *  current staging state, so showing stale cached rows after navigating back would be
   *  actively worse than the normal loading flash, unlike LII/PII/ISI/IID/WLH's own
   *  "resume the last lookup" pattern. */
  selected: number | null;
  setSelected: (aisle: number | null) => void;
}

const SARContext = createContext<SARContextValue | null>(null);

/**
 * Session-level store for SAR's "currently selected aisle" (App-Wide screen-persistence
 * item, v1.7.0) — mounted once inside the authenticated route tree (see App.tsx) so
 * navigating away from SAR and back keeps the same aisle selected instead of resetting
 * the Directed Put/Stage Aisle cross-navigation buttons to disabled. State clears
 * naturally on logout, since ProtectedRoute unmounts this provider along with the rest
 * of the authenticated tree when the session token is cleared.
 */
export function SARProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <SARContext.Provider value={{ selected, setSelected }}>
      {children}
    </SARContext.Provider>
  );
}

/** Hook that returns the current SAR context: the selected aisle. Must be called inside a SARProvider; throws if used outside. */
export function useSAR(): SARContextValue {
  const ctx = useContext(SARContext);
  if (!ctx) throw new Error('useSAR must be used inside SARProvider');
  return ctx;
}
