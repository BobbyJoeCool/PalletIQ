import { createContext, useContext, useState, type Dispatch, type SetStateAction } from 'react';

export interface SDPDirectedResult {
  reservationId: number;
  /** False once Exists Elsewhere has redirected the put at least once — the underlying
   *  `Reservation` row is gone server-side at that point (released as part of the
   *  redirect), so Confirm goes through `manual/confirm` instead of `confirmPut`, and
   *  Unassign/Hold Location are no longer offered (nothing left to unassign/hold against
   *  this transaction) in favor of Cancel and, once away from `original`, Return to
   *  Original. See `SDPVerifyPutModal.tsx`'s own doc comment for the full flow. */
  hasReservation: boolean;
  /** The pallet's originally-directed location (and its own Storage Code, which a
   *  redirected-to candidate can differ from), captured the moment a redirect first moves
   *  away from it. Null until then. Lets the worker toggle back after picking an Exists
   *  Elsewhere candidate, without needing a second server round-trip — the original
   *  location was only ever released, never reassigned to anyone else in the meantime, so
   *  returning to it is a pure client-side state swap, same as picking any other candidate. */
  original: { location: string; storageCode: string } | null;
  directedLocation: string;
  /** The directed location's own Size — XS means Hand Put, everything else Rack Put (see
   *  `lib/sizes.ts`'s own XS comment) — the Verify-Put Modal (#151) branches its body on
   *  this. Unchanged by an Exists Elsewhere redirect (every candidate is guaranteed XS by
   *  its own fetch filter — see the modal). */
  directedLocationSize: string;
  /** The current target location's own Storage Code — drives the Verify-Put Modal's
   *  location badge (#151 UI follow-up). Unlike `palletStorageCode` below, this DOES
   *  change across a redirect — Exists Elsewhere's candidates aren't filtered by Storage
   *  Code, only by DPCI/Size, so a redirected-to location can legitimately carry a
   *  different Storage Code than the one originally directed to. */
  directedLocationStorageCode: string;
  /** The pallet/item's own Storage Code, as resolved by the *original* directedPut call
   *  — drives the Verify-Put Modal's DPCI badge. Frozen at that first resolution and
   *  never touched by a redirect (unlike `directedLocationStorageCode`), since it
   *  describes the pallet itself, not whichever location currently happens to be
   *  targeted. Equal to `directedLocationStorageCode` until the first redirect (Storage
   *  Code was an exact-match filter for that original search), then may diverge. */
  palletStorageCode: string;
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
  setDirected: Dispatch<SetStateAction<SDPDirectedResult | null>>;
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
 * fallback via the 404 a confirm/unassign call gets back) that covers this exact
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
