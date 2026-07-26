import { createContext, useContext, useState } from 'react';

export interface PARItemLookup { dpci: string; descShort: string; requiresExpirationDate: boolean; storageCode: string }

interface PARContextValue {
  /** The most recently resolved DPCI/UPC lookup, or null if none has been loaded this
   *  session yet. */
  item: PARItemLookup | null;
  setItem: (i: PARItemLookup | null) => void;
}

const PARContext = createContext<PARContextValue | null>(null);

/**
 * Session-level store for PAR's "currently resolved item" (App-Wide screen-persistence
 * item, v1.7.0 — mirrors LIIContext's/PIIContext's/ISIContext's own per-screen pattern)
 * — mounted once inside the authenticated route tree (see App.tsx) so navigating away
 * from PAR and back restores the resolved DPCI/UPC item (Description,
 * requiresExpirationDate) instead of resetting to the empty Ready state. Deliberately
 * scoped to just the resolved item, not PAR's whole multi-step create form (DPCI/UPC
 * chain boxes, VCP/SSP, Cartons/SSPs, Expiration Date, Location) — the same "resolved
 * result persists, in-progress entry fields don't" split every other persisted screen
 * already draws (LII/PII/ISI/IID/WLH/PIP/SDP/MNP none of them persist their own
 * in-progress typed-but-uncommitted fields either), not a special exception for PAR.
 * `clearForm()` on a successful create still resets this to `null` like every other
 * PAR field. State clears naturally on logout, since ProtectedRoute unmounts this
 * provider along with the rest of the authenticated tree when the session token is
 * cleared.
 */
export function PARProvider({ children }: { children: React.ReactNode }) {
  const [item, setItem] = useState<PARItemLookup | null>(null);
  return (
    <PARContext.Provider value={{ item, setItem }}>
      {children}
    </PARContext.Provider>
  );
}

/** Hook that returns the current PAR context: the last-resolved item. Must be called inside a PARProvider; throws if used outside. */
export function usePAR(): PARContextValue {
  const ctx = useContext(PARContext);
  if (!ctx) throw new Error('usePAR must be used inside PARProvider');
  return ctx;
}
