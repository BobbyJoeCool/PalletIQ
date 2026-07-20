import { createContext, useContext, useState } from 'react';

export interface LIIPalletData {
  id: number;
  dpci: string;
  cartons: number;
  pallets: number;
  ssps: number;
  status: string;
  descShort: string;
}

export interface LIILocationData {
  aisle: number;
  bin: number;
  level: number;
  zone: number;
  storageCode: string;
  size: string;
  status: string;
  holdCategory: string | null;
  contraction: boolean;
  /** Every occupant pallet, ordered by pid ascending — empty array if unoccupied.
   *  LII issue #87: a location can legitimately hold more than one pallet since MNP's
   *  v1.6.3 "Proceed Anyway" path. */
  pallets: LIIPalletData[];
}

export interface LIILoadedLocation {
  /** Canonical 8-digit Aisle+Bin+Level id, reconstructed from the API response. */
  locationId: string;
  data: LIILocationData;
}

interface LIIContextValue {
  /** The most recently loaded location, or null if none has been loaded this session yet. */
  location: LIILoadedLocation | null;
  setLocation: (l: LIILoadedLocation | null) => void;
}

const LIIContext = createContext<LIIContextValue | null>(null);

/**
 * Session-level store for LII's "currently loaded location" (LII fix-list item 01 —
 * mirrors PIIContext's/ISIContext's own per-screen pattern) — mounted once inside the
 * authenticated route tree (see App.tsx) so navigating away from LII and back restores the
 * last-loaded location instead of resetting to the empty Ready state. State clears
 * naturally on logout, since ProtectedRoute unmounts this provider along with the rest of
 * the authenticated tree when the session token is cleared.
 */
export function LIIProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<LIILoadedLocation | null>(null);
  return (
    <LIIContext.Provider value={{ location, setLocation }}>
      {children}
    </LIIContext.Provider>
  );
}

/** Hook that returns the current LII context: the last-loaded location. Must be called inside an LIIProvider; throws if used outside. */
export function useLII(): LIIContextValue {
  const ctx = useContext(LIIContext);
  if (!ctx) throw new Error('useLII must be used inside LIIProvider');
  return ctx;
}
