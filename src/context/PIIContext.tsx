import { createContext, useContext, useState } from 'react';

export interface UserStamp {
  zNumber: string;
  firstName: string;
  lastName: string;
}

export interface PIIPalletData {
  pid: number;
  dpci: { dept: number; class: number; item: number };
  upc: string;
  vcp: number;
  ssp: number;
  currentCartons: number;
  currentSSPs: number;
  currentPallets: number;
  status: string;
  location: { aisle: number; bin: number; level: number } | null;
  receivedBy: UserStamp;
  receivedAt: string;
  putBy: UserStamp | null;
  putAt: string | null;
  lastPulledBy: UserStamp | null;
  lastPulledAt: string | null;
  poNumber: string | null;
  apptNumber: string | null;
  expirationDate: string | null;
  requiresExpirationDate: boolean;
}

interface PIIContextValue {
  /** The most recently loaded pallet, or null if none has been loaded this session yet.
   *  Only ever the read-only, last-saved record — in-progress Edit Mode changes are never
   *  persisted here (see PII#05: discarded on navigation away, same as before this fix). */
  pallet: PIIPalletData | null;
  setPallet: (p: PIIPalletData | null) => void;
}

const PIIContext = createContext<PIIContextValue | null>(null);

/**
 * Session-level store for PII's "currently loaded pallet" (issue PII#05 — mirrors
 * StagingContext's own pattern) — mounted once inside the authenticated route tree (see
 * App.tsx) so navigating away from PII and back restores the last-loaded pallet instead of
 * resetting to the empty Ready state. Scoped to PII only for now (LII/ISI need the
 * identical pattern later, per direct product decision, but aren't generalized into a
 * shared context until their own versions actually pick this up). State clears naturally on
 * logout, same as StagingProvider, since ProtectedRoute unmounts this provider along with
 * the rest of the authenticated tree when the session token is cleared.
 */
export function PIIProvider({ children }: { children: React.ReactNode }) {
  const [pallet, setPallet] = useState<PIIPalletData | null>(null);
  return (
    <PIIContext.Provider value={{ pallet, setPallet }}>
      {children}
    </PIIContext.Provider>
  );
}

/** Hook that returns the current PII context: the last-loaded pallet. Must be called inside a PIIProvider; throws if used outside. */
export function usePII(): PIIContextValue {
  const ctx = useContext(PIIContext);
  if (!ctx) throw new Error('usePII must be used inside PIIProvider');
  return ctx;
}
