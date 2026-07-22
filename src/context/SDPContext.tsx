import { createContext, useContext, useState } from 'react';

export interface SDPDirectedResult {
  reservationId: number;
  directedLocation: string;
  pallet: {
    id: number;
    dpci: string;
    descShort: string;
    quantity: { pallets: number; cartons: number; ssps: number };
    currentLocation: string | null;
  };
  alreadyStored: boolean;
}

interface SDPContextValue {
  /** The most recently directed pallet (with its live Reservation), or null if none has
   *  been loaded this session yet. */
  directed: SDPDirectedResult | null;
  setDirected: (d: SDPDirectedResult | null) => void;
}

const SDPContext = createContext<SDPContextValue | null>(null);

/**
 * Session-level store for SDP's "currently directed pallet" (App-Wide screen-persistence
 * item, v1.7.0 — mirrors LIIContext's/PIIContext's/ISIContext's own per-screen pattern)
 * — mounted once inside the authenticated route tree (see App.tsx) so navigating away
 * from SDP and back restores the last-directed pallet instead of resetting to the empty
 * Ready state. The underlying `Reservation` this points at still expires server-side
 * after 5 minutes regardless of whether the worker stayed on this screen (see
 * `reservationTimer.ts`'s `clearExpiredReservations`) — a persisted-but-now-expired
 * `directed` value isn't specially guarded against here, since SDPPage already has its
 * own existing expiry detection (polling the directed location's status, and a reactive
 * fallback via the 404 a confirm/unassign/block call gets back) that covers this exact
 * "resumed a now-stale reservation" case, not just the in-session one. State clears
 * naturally on logout, since ProtectedRoute unmounts this provider along with the rest
 * of the authenticated tree when the session token is cleared.
 */
export function SDPProvider({ children }: { children: React.ReactNode }) {
  const [directed, setDirected] = useState<SDPDirectedResult | null>(null);
  return (
    <SDPContext.Provider value={{ directed, setDirected }}>
      {children}
    </SDPContext.Provider>
  );
}

/** Hook that returns the current SDP context: the last-directed pallet. Must be called inside a SDPProvider; throws if used outside. */
export function useSDP(): SDPContextValue {
  const ctx = useContext(SDPContext);
  if (!ctx) throw new Error('useSDP must be used inside SDPProvider');
  return ctx;
}
