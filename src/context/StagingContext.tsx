import { createContext, useCallback, useContext, useState } from 'react';

export interface StackState {
  aisle: string;
  storageCode: string;
  size: string;
  quantity: string;
  locations: string[];
  shortfall: number;
}

export interface StagingLogEntry {
  id: number;
  text: string;
  warning: boolean;
  timestamp: Date;
}

/** Returns a fresh, fully-cleared StackState — used to initialize and reset the front stack. */
function emptyStack(): StackState {
  return { aisle: '', storageCode: '', size: '', quantity: '', locations: [], shortfall: 0 };
}

interface StagingContextValue {
  /** The single stageable position on the triple (issue #77 — "only the front stack can be
   *  staged" collapsed the old three-independent-lanes model down to one). */
  front: StackState;
  updateFront: (patch: Partial<StackState>) => void;
  /** Resets the front stack to empty pallet slots after staging — Aisle, StorageCode, and
   *  Size persist (per STG.md's Stack Independence section) so the next stage into the same
   *  aisle/type only needs a new Quantity. */
  resetFrontAfterStage: () => void;
  master: { aisle: string; storageCode: string; size: string };
  setMaster: (patch: Partial<{ aisle: string; storageCode: string; size: string }>) => void;
  log: StagingLogEntry[];
  addLogEntry: (text: string, warning?: boolean) => void;
  logExpanded: boolean;
  setLogExpanded: (v: boolean) => void;
  /** Bumped whenever a stage/restage/hold action actually commits, or the manual Refresh
   *  button (issue #76) is pressed — the live info panel (Feature 2) and the front stack's
   *  own location suggestion both depend on this to refresh, independent of the fork
   *  graphic's own in-progress candidate-location lookups, which must never trigger a
   *  refresh (see Feature 2 spec's "Independence from the fork graphic" section). */
  dataVersion: number;
  bumpDataVersion: () => void;
}

const StagingContext = createContext<StagingContextValue | null>(null);

let logIdCounter = 0;

/**
 * Session-level store for STG's fork state — the front stack (Aisle, StorageCode, Size,
 * Quantity, assigned destination locations) plus the master control bar and the staging
 * log. Mounted once inside the authenticated route tree (see App.tsx) so navigating away
 * from STG and back restores whatever was left on the forks, per DevNotes/Screen-Specs/
 * STG.md's Session Persistence section. State clears naturally on logout because
 * ProtectedRoute unmounts this provider along with the rest of the authenticated tree
 * when the session token is cleared.
 */
export function StagingProvider({ children }: { children: React.ReactNode }) {
  const [front, setFront] = useState<StackState>(emptyStack());
  const [master, setMasterState] = useState({ aisle: '', storageCode: '', size: '' });
  const [log, setLog] = useState<StagingLogEntry[]>([]);
  const [logExpanded, setLogExpanded] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  /** Merges a partial patch into the front stack's state. */
  const updateFront = useCallback((patch: Partial<StackState>) => {
    setFront((prev) => ({ ...prev, ...patch }));
  }, []);

  /** Resets the front stack to empty pallet slots after a successful stage, keeping Aisle/StorageCode/Size. */
  const resetFrontAfterStage = useCallback(() => {
    setFront((prev) => ({ ...emptyStack(), aisle: prev.aisle, storageCode: prev.storageCode, size: prev.size }));
  }, []);

  /** Merges a partial patch into the master control bar's state. */
  const setMaster = useCallback((patch: Partial<{ aisle: string; storageCode: string; size: string }>) => {
    setMasterState((prev) => ({ ...prev, ...patch }));
  }, []);

  /** Prepends a new entry to the staging log. */
  const addLogEntry = useCallback((text: string, warning = false) => {
    setLog((prev) => [{ id: ++logIdCounter, text, warning, timestamp: new Date() }, ...prev]);
  }, []);

  /** Signals that a stage/restage/hold action committed, or a manual refresh was requested. */
  const bumpDataVersion = useCallback(() => {
    setDataVersion((v) => v + 1);
  }, []);

  return (
    <StagingContext.Provider
      value={{
        front, updateFront, resetFrontAfterStage, master, setMaster,
        log, addLogEntry, logExpanded, setLogExpanded, dataVersion, bumpDataVersion,
      }}
    >
      {children}
    </StagingContext.Provider>
  );
}

/**
 * Hook that returns the current staging context: the front stack, master control, and log.
 * Must be called inside a StagingProvider; throws if used outside.
 */
export function useStaging(): StagingContextValue {
  const ctx = useContext(StagingContext);
  if (!ctx) throw new Error('useStaging must be used inside StagingProvider');
  return ctx;
}
