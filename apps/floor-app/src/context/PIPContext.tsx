import { createContext, useContext, useState } from 'react';

interface PIPQty { pallets: number; cartons: number; ssps: number }

export interface PIPLabelScanResult {
  label: {
    id: string;
    pullFunction: string;
    quantity: PIPQty;
    dpci: string;
    descShort: string;
  };
  pallet: { id: number; quantity: PIPQty };
  location: { id: string | null };
}

interface PIPContextValue {
  /** The most recently scanned pull label (plus its pallet/location), or null if none
   *  has been loaded this session yet. */
  labelData: PIPLabelScanResult | null;
  setLabelData: (l: PIPLabelScanResult | null) => void;
}

const PIPContext = createContext<PIPContextValue | null>(null);

/**
 * Session-level store for PIP's "currently scanned pull label" (App-Wide screen-
 * persistence item, v1.7.0 — mirrors LIIContext's/PIIContext's/ISIContext's own
 * per-screen pattern) — mounted once inside the authenticated route tree (see App.tsx)
 * so navigating away from PIP and back restores the last-scanned label instead of
 * resetting to the empty Ready state. A stale persisted label (e.g. someone else pulled
 * it in the meantime) isn't specially guarded against here — same as every other
 * persisted screen, any actual pull action still round-trips to the server and surfaces
 * a fresh error if the underlying state has moved on. State clears naturally on logout,
 * since ProtectedRoute unmounts this provider along with the rest of the authenticated
 * tree when the session token is cleared.
 */
export function PIPProvider({ children }: { children: React.ReactNode }) {
  const [labelData, setLabelData] = useState<PIPLabelScanResult | null>(null);
  return (
    <PIPContext.Provider value={{ labelData, setLabelData }}>
      {children}
    </PIPContext.Provider>
  );
}

/** Hook that returns the current PIP context: the last-scanned label. Must be called inside a PIPProvider; throws if used outside. */
export function usePIP(): PIPContextValue {
  const ctx = useContext(PIPContext);
  if (!ctx) throw new Error('usePIP must be used inside PIPProvider');
  return ctx;
}
