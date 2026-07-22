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

/** Returns a fresh, fully-cleared StackState — used to initialize and pad the stack queue. */
function emptyStack(): StackState {
  return { aisle: '', storageCode: '', size: '', quantity: '', locations: [], shortfall: 0 };
}

/** A stack with no Aisle/StorageCode/Size/Quantity entered — the "not yet in use" state that compaction filters out. */
function isEmptyStack(s: StackState): boolean {
  return !s.aisle && !s.storageCode && !s.size && !s.quantity;
}

/**
 * Compacts a 3-slot stack queue so every non-empty entry is pulled toward the front
 * (index 0), preserving relative order, with empty slots trailing at the back (index 2) —
 * issue #81. This is what makes "if the middle slot is empty, the back slot should still
 * move all the way up to the front" fall out for free: there's no persisted identity for
 * "slot 2" that could sit empty while "slot 3" (further back) holds data, since compaction
 * always re-derives the array from whichever entries are actually filled.
 */
function compactStacks(stacks: StackState[]): [StackState, StackState, StackState] {
  const filled = stacks.filter((s) => !isEmptyStack(s));
  const padded = [...filled, ...Array.from({ length: 3 - filled.length }, emptyStack)];
  return padded as [StackState, StackState, StackState];
}

interface StagingContextValue {
  /** The fork's 3-slot stack queue (issue #81 — three independent stacks ride the forks at
   *  once, but only index 0, the front/"end of the forks" position, ever computes
   *  destination locations or can be staged; indexes 1/2 are pure data entry for what's
   *  queued up behind it). Index 0 always renders at the visual position closest to the
   *  Locations panel (rightmost) per the wireframe in issue #81; index 2 renders leftmost,
   *  closest to the mast/operator. */
  stacks: [StackState, StackState, StackState];
  updateStack: (index: 0 | 1 | 2, patch: Partial<StackState>) => void;
  /** Clears the front stack (index 0) after a successful stage, then compacts the queue —
   *  whatever was queued behind it (index 1 or 2) slides all the way up to the front. If
   *  nothing was queued (the whole queue is now empty), the new front slot inherits the
   *  just-staged stack's Aisle/StorageCode/Size for convenience, so restaging into the same
   *  aisle/type only needs a new Quantity — matching the old single-front-stack behavior. */
  resetStackAfterStage: () => void;
  master: { aisle: string; storageCode: string; size: string };
  setMaster: (patch: Partial<{ aisle: string; storageCode: string; size: string }>) => void;
  log: StagingLogEntry[];
  addLogEntry: (text: string, warning?: boolean) => void;
  logExpanded: boolean;
  setLogExpanded: (v: boolean) => void;
  /** Bumped whenever a stage/restage/hold action actually commits, or the manual Refresh
   *  button (issue #76) is pressed — the live info panel (Feature 2) and the front stack
   *  slot's own location suggestion both depend on this to refresh, independent of the
   *  fork graphic's own in-progress candidate-location lookups, which must never trigger a
   *  refresh (see Feature 2 spec's "Independence from the fork graphic" section). */
  dataVersion: number;
  bumpDataVersion: () => void;
}

const StagingContext = createContext<StagingContextValue | null>(null);

let logIdCounter = 0;

/**
 * Session-level store for STG's fork state — the 3-slot stack queue (Aisle, StorageCode,
 * Size, Quantity, and, for the front slot only, assigned destination locations) plus the
 * master control bar and the staging log. Mounted once inside the authenticated route tree
 * (see App.tsx) so navigating away from STG and back restores whatever was left on the
 * forks, per DevNotes/Screen-Specs/STG.md's Session Persistence section. State clears
 * naturally on logout because ProtectedRoute unmounts this provider along with the rest of
 * the authenticated tree when the session token is cleared.
 */
export function StagingProvider({ children }: { children: React.ReactNode }) {
  const [stacks, setStacks] = useState<[StackState, StackState, StackState]>([emptyStack(), emptyStack(), emptyStack()]);
  const [master, setMasterState] = useState({ aisle: '', storageCode: '', size: '' });
  const [log, setLog] = useState<StagingLogEntry[]>([]);
  const [logExpanded, setLogExpanded] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  /** Merges a partial patch into one stack slot's state — no compaction here, so mid-entry edits never shift a slot the worker is actively typing into. */
  const updateStack = useCallback((index: 0 | 1 | 2, patch: Partial<StackState>) => {
    setStacks((prev) => {
      const next = [...prev] as [StackState, StackState, StackState];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }, []);

  /** Clears the front stack after a successful stage and compacts the queue forward (see
   *  compactStacks above). Direct instruction: whichever of Aisle/StorageCode/Size was
   *  *identical across all three stacks* before staging carries forward into whatever new
   *  empty slot opens up as a result — independently per field (e.g. all three the same
   *  Storage Code but different Sizes persists only the Storage Code, not the Size).
   *  Distinct from the pre-existing "queue goes fully empty" case just below, which persists
   *  the staged stack's *own* values regardless of whether the other two even had anything
   *  to compare against — that only ever fires when both other stacks were already unused,
   *  never overlapping with this per-field carry-forward. */
  const resetStackAfterStage = useCallback(() => {
    setStacks((prev) => {
      const staged = prev[0];
      const sharedField = (field: 'aisle' | 'storageCode' | 'size') =>
        prev[0][field] !== '' && prev[0][field] === prev[1][field] && prev[1][field] === prev[2][field]
          ? prev[0][field]
          : null;
      const sharedAisle = sharedField('aisle');
      const sharedStorageCode = sharedField('storageCode');
      const sharedSize = sharedField('size');

      const compacted = compactStacks([emptyStack(), prev[1], prev[2]]);
      if (isEmptyStack(compacted[0])) {
        compacted[0] = { ...compacted[0], aisle: staged.aisle, storageCode: staged.storageCode, size: staged.size };
      } else if (sharedAisle != null || sharedStorageCode != null || sharedSize != null) {
        for (let i = 0; i < 3; i++) {
          if (!isEmptyStack(compacted[i])) continue;
          compacted[i] = {
            ...compacted[i],
            ...(sharedAisle != null && { aisle: sharedAisle }),
            ...(sharedStorageCode != null && { storageCode: sharedStorageCode }),
            ...(sharedSize != null && { size: sharedSize }),
          };
        }
      }
      return compacted;
    });
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
        stacks, updateStack, resetStackAfterStage, master, setMaster,
        log, addLogEntry, logExpanded, setLogExpanded, dataVersion, bumpDataVersion,
      }}
    >
      {children}
    </StagingContext.Provider>
  );
}

/**
 * Hook that returns the current staging context: the 3-slot stack queue, master control,
 * and log. Must be called inside a StagingProvider; throws if used outside.
 */
export function useStaging(): StagingContextValue {
  const ctx = useContext(StagingContext);
  if (!ctx) throw new Error('useStaging must be used inside StagingProvider');
  return ctx;
}
