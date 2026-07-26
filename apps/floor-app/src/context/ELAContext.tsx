import { createContext, useContext, useState } from 'react';

interface ELAContextValue {
  storageCode: string;
  setStorageCode: (v: string) => void;
  size: string;
  setSize: (v: string) => void;
  /** The most recently selected result row (drives the "View Zone Map"/"Stage Aisle"
   *  buttons), or null if none is selected. */
  selected: number | null;
  setSelected: (aisle: number | null) => void;
  /** Aisle Range filter (GitHub #124) — restricts results to aisles within
   *  [aisleStart, aisleEnd] inclusive. Either end alone is a valid open-ended range. */
  aisleStart: string;
  setAisleStart: (v: string) => void;
  aisleEnd: string;
  setAisleEnd: (v: string) => void;
  /** Workstation restrict-to filter (GitHub #124) — single workstation id; when set,
   *  narrows results to just that workstation's aisles. Independent of the
   *  exclude-bubble Workstation filter below (both can be active at once). */
  workstation: string;
  setWorkstation: (v: string) => void;
  /** Workstation exclude filter (GitHub #125) — the filter-button's own on/off state,
   *  independent of which workstations are marked for exclusion below (turning this off
   *  disables the exclusion without losing the marked set). */
  workstationFilterActive: boolean;
  setWorkstationFilterActive: (v: boolean) => void;
  /** Workstation ids currently marked "excluded" in the filter's popup (red bubbles) —
   *  only actually applied to the search when `workstationFilterActive` is also true. */
  excludedWorkstations: string[];
  setExcludedWorkstations: (v: string[]) => void;
}

const ELAContext = createContext<ELAContextValue | null>(null);

/**
 * Session-level store for ELA's filter inputs and selection (App-Wide screen-persistence
 * item, v1.7.0) — mounted once inside the authenticated route tree (see App.tsx) so
 * navigating away from ELA and back restores the last-run Storage Code/Size filter and
 * selected aisle instead of resetting to a blank query. Deliberately persists the filter
 * *inputs*, not a cached results array — `ELAPage`'s own query effect already re-fetches
 * fresh rows whenever `storageCode` has a value, so restoring the filter naturally
 * restores current, non-stale results rather than risking a cached-and-outdated
 * empty-location count. State clears naturally on logout, since ProtectedRoute unmounts
 * this provider along with the rest of the authenticated tree when the session token is
 * cleared.
 */
export function ELAProvider({ children }: { children: React.ReactNode }) {
  const [storageCode, setStorageCode] = useState('');
  const [size, setSize] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [aisleStart, setAisleStart] = useState('');
  const [aisleEnd, setAisleEnd] = useState('');
  const [workstation, setWorkstation] = useState('');
  const [workstationFilterActive, setWorkstationFilterActive] = useState(false);
  const [excludedWorkstations, setExcludedWorkstations] = useState<string[]>([]);
  return (
    <ELAContext.Provider
      value={{
        storageCode, setStorageCode, size, setSize, selected, setSelected,
        aisleStart, setAisleStart, aisleEnd, setAisleEnd,
        workstation, setWorkstation,
        workstationFilterActive, setWorkstationFilterActive,
        excludedWorkstations, setExcludedWorkstations,
      }}
    >
      {children}
    </ELAContext.Provider>
  );
}

/** Hook that returns the current ELA context: filter inputs plus the selected row. Must be called inside an ELAProvider; throws if used outside. */
export function useELA(): ELAContextValue {
  const ctx = useContext(ELAContext);
  if (!ctx) throw new Error('useELA must be used inside ELAProvider');
  return ctx;
}
