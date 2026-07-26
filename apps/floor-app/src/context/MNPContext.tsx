import { createContext, useContext, useState } from 'react';

interface MNPQty { pallets: number; cartons: number; ssps: number }

export interface MNPScannedPallet {
  id: number;
  dpci: string;
  descShort: string;
  quantity: MNPQty;
  currentLocation: string | null;
}

interface MNPContextValue {
  /** The most recently scanned pallet, or null if none has been loaded this session yet. */
  scannedPallet: MNPScannedPallet | null;
  setScannedPallet: (p: MNPScannedPallet | null) => void;
}

const MNPContext = createContext<MNPContextValue | null>(null);

/**
 * Session-level store for MNP's "currently scanned pallet" (App-Wide screen-persistence
 * item, v1.7.0 — mirrors LIIContext's/PIIContext's/ISIContext's own per-screen pattern)
 * — mounted once inside the authenticated route tree (see App.tsx) so navigating away
 * from MNP and back restores the last-scanned pallet instead of resetting to the empty
 * Ready state. Unlike SDP, MNP has no server-side Reservation/timeout tied to a scanned
 * pallet — manual entry just resumes from wherever it was, no expiry to reconcile.
 * State clears naturally on logout, since ProtectedRoute unmounts this provider along
 * with the rest of the authenticated tree when the session token is cleared.
 */
export function MNPProvider({ children }: { children: React.ReactNode }) {
  const [scannedPallet, setScannedPallet] = useState<MNPScannedPallet | null>(null);
  return (
    <MNPContext.Provider value={{ scannedPallet, setScannedPallet }}>
      {children}
    </MNPContext.Provider>
  );
}

/** Hook that returns the current MNP context: the last-scanned pallet. Must be called inside a MNPProvider; throws if used outside. */
export function useMNP(): MNPContextValue {
  const ctx = useContext(MNPContext);
  if (!ctx) throw new Error('useMNP must be used inside MNPProvider');
  return ctx;
}
