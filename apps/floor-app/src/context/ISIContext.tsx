import { createContext, useContext, useState } from 'react';

export interface ISILocationEntry {
  locationId: string;
  palletId: number;
  storageCode: string;
  size: string;
  currentPallets: number;
  currentCartons: number;
  currentSSPs: number;
  vcp: number;
  ssp: number;
}

export interface ISISearchState {
  /** 'dpci' or 'upc' — which entry field the search was run from, so remounting restores the right box(es). */
  mode: 'dpci' | 'upc';
  /** The raw value used for the search — a dash-joined DPCI or a UPC string. */
  query: string;
  descShort: string;
  locations: ISILocationEntry[];
  selected: number | null;
}

interface ISIContextValue {
  /** The most recent search result, or null if none has been run this session yet. */
  search: ISISearchState | null;
  setSearch: (s: ISISearchState | null) => void;
}

const ISIContext = createContext<ISIContextValue | null>(null);

/**
 * Session-level store for ISI's "current search result" (ISI fix-list item 01 — mirrors
 * PIIContext's own pattern) — mounted once inside the authenticated route tree (see
 * App.tsx) so navigating away from ISI and back restores the last search instead of
 * resetting to an empty entry screen. Scoped to ISI only, same deliberate per-screen
 * choice as PIIContext (see that file's docstring) rather than a shared context. State
 * clears naturally on logout, since ProtectedRoute unmounts this provider along with the
 * rest of the authenticated tree when the session token is cleared.
 */
export function ISIProvider({ children }: { children: React.ReactNode }) {
  const [search, setSearch] = useState<ISISearchState | null>(null);
  return (
    <ISIContext.Provider value={{ search, setSearch }}>
      {children}
    </ISIContext.Provider>
  );
}

/** Hook that returns the current ISI context: the last search result. Must be called inside an ISIProvider; throws if used outside. */
export function useISI(): ISIContextValue {
  const ctx = useContext(ISIContext);
  if (!ctx) throw new Error('useISI must be used inside ISIProvider');
  return ctx;
}
