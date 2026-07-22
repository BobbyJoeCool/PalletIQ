import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HoldPanel } from '../components/shared/HoldPanel';
import { LocationEntryFields } from '../components/shared/LocationEntryFields';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { LiveId } from '../components/ui/LiveId';
import { useAuth } from '../context/AuthContext';
import { useDemoSlot } from '../context/FooterDemoContext';
import { useMessageBar } from '../context/MessageBarContext';
import { type MNPScannedPallet, useMNP } from '../context/MNPContext';
import { useNumpad } from '../context/NumpadContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { useNumpadField } from '../lib/useNumpadField';
import { fmtLocation } from '../lib/fmt';
import { hasMinRole, type Role } from '@shared/index';

// ── Types ────────────────────────────────────────────────────────────────────

// ScannedPallet's shape now lives in MNPContext.tsx (App-Wide screen-persistence,
// v1.7.0) as `MNPScannedPallet`, imported above rather than redeclared.

interface HistoryEntry {
  key: number;
  palletId: number;
  location?: string;
  level?: number;
  outcome: 'SCANNED' | 'PUT' | 'MOVE' | 'CONSOLIDATED' | 'CANCELED';
  occupied?: boolean;
  staged?: boolean;
  timestamp: Date;
}

interface NormalConfirmResult {
  location: string;
  level: number;
  wasMove: boolean;
  clearedLocation: string | null;
  destinationWasOccupied: boolean;
  destinationWasStaged: boolean;
}

interface ConsolidateConfirmResult {
  consolidated: true;
  targetPalletId: number;
  sourcePalletId: number;
  location: string;
}

type ConfirmResult = NormalConfirmResult | ConsolidateConfirmResult;

/** Blocking gate raised by POST /api/puts/manual/confirm before a put actually commits —
 *  see puts.ts's manualConfirm docstring for the exact server-side sequencing. */
type GateState =
  | { kind: 'contraction' }
  | { kind: 'occupied'; occupantPalletId: number | null; occupantDpci: string | null; wasStaged: boolean }
  | { kind: 'combine'; occupantPalletId: number | null; occupantDpci: string | null };

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Single labeled data row in the pallet detail panel. */
function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-[#1A1A1A]">
      <span className="w-[180px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">
        {label}
      </span>
      <div className="font-data text-[22px] text-white">{children}</div>
    </div>
  );
}

/**
 * Input display field driven by NumpadContext.
 *
 * @param label - Label shown above the input box
 * @param value - Current value (from useNumpadField)
 * @param onFocus - Called on tap; should register the field's submit handler with the numpad
 * @param active - Shows blinking cursor when true
 * @param disabled - Prevents interaction (used for pallet field once pallet is scanned)
 */
function FieldDisplay({
  label,
  value,
  onFocus,
  active = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onFocus: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider">
        {label}
      </span>
      <button
        type="button"
        onClick={onFocus}
        disabled={disabled}
        className={`flex items-center h-[72px] px-5 rounded-[12px] bg-[#0D0D0D] border-2 disabled:opacity-40 transition-colors ${active && !disabled ? 'border-[#CC0000]' : 'border-[#3A3A3A] hover:border-[#555]'}`}
      >
        <span className="font-data text-[32px] font-medium text-white tracking-[0.04em]">
          {value || <span className="text-[#444]">—</span>}
        </span>
        {active && !disabled && (
          <span className="inline-block w-[3px] h-[38px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />
        )}
      </button>
    </div>
  );
}

/** Colored footer demo button; `color` selects a background from a small fixed palette. */
function DemoBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  const colors: Record<string, string> = {
    green: 'bg-[#006600] hover:bg-[#007700] text-white',
    red:   'bg-[#660000] hover:bg-[#770000] text-white',
    blue:  'bg-[#003366] hover:bg-[#004488] text-white',
    amber: 'bg-[#554400] hover:bg-[#665500] text-white',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium select-none transition-colors ${colors[color] ?? colors.green}`}
    >
      {label}
    </button>
  );
}

// ── Level selection modal ──────────────────────────────────────────────────────

/**
 * Full-screen modal for the worker to enter the rack level where the pallet was physically placed.
 * Appears after the destination location is resolved. Accepts up to 2 digits; does not call any
 * API — level is passed up to MNPPage via onSelect for inclusion in the confirm call.
 *
 * @param onSelect - Called with the chosen level number on Enter tap
 * @param initialLevel - Pre-fills the input when the destination's level is already known — a
 *   full 8-digit barcode scan/override in the 3-box destination entry, or the Empty/Occupied demo
 *   buttons (which fetch a real location and therefore already know its exact level). Still
 *   requires an explicit Enter tap to confirm; a manually-typed Aisle+Bin has no known level and
 *   leaves this unset.
 */
function LevelModal({
  onSelect,
  initialLevel,
}: {
  onSelect: (level: number) => void;
  initialLevel?: number | null;
}) {
  const [input, setInput] = useState(initialLevel != null ? String(initialLevel) : '');

  /** Appends a digit to the level input, capped at 2 digits. */
  function pressDigit(d: string) {
    setInput(v => (v.length >= 2 ? v : v + d));
  }

  /** Removes the last digit from the level input. */
  function backspace() {
    setInput(v => v.slice(0, -1));
  }

  /** Validates the entered level is a positive number and reports it via onSelect. */
  function confirm() {
    const level = parseInt(input, 10);
    if (!input || isNaN(level) || level <= 0) return;
    onSelect(level);
    setInput('');
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-[20px] p-8 w-[520px] shadow-2xl">
        <h2 className="font-ui text-[26px] font-semibold text-white text-center mb-6">
          What level was the pallet placed at?
        </h2>

        <div className="flex items-center justify-center h-[64px] mb-5 rounded-[12px] bg-[#0D0D0D] border-2 border-[#3A3A3A]">
          <span className="font-data text-[36px] font-medium text-white tracking-[0.1em]">
            {input || <span className="text-[#444]">—</span>}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {keys.map(d => (
            <button
              key={d}
              type="button"
              onClick={() => pressDigit(d)}
              className="h-[80px] rounded-[14px] bg-[#1F1F1F] border border-[#2C2C2C] text-white font-data text-[34px] font-medium hover:border-[#555] transition-colors active:scale-95"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={backspace}
            className="h-[80px] rounded-[14px] bg-[#1F1F1F] border border-[#2C2C2C] text-white font-ui text-[20px] font-medium hover:border-[#555] transition-colors active:scale-95"
          >
            ⌫
          </button>
          <button
            type="button"
            onClick={() => pressDigit('0')}
            className="h-[80px] rounded-[14px] bg-[#1F1F1F] border border-[#2C2C2C] text-white font-data text-[34px] font-medium hover:border-[#555] transition-colors active:scale-95"
          >
            0
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!input}
            className="h-[80px] rounded-[14px] bg-[#006600] border border-[#2C2C2C] text-white font-ui text-[22px] font-semibold hover:bg-[#007700] disabled:opacity-40 disabled:hover:bg-[#006600] transition-colors active:scale-95"
          >
            Enter
          </button>
        </div>

        <p className="font-ui text-[14px] text-[#555] text-center mt-5">
          Enter the level where the pallet was placed
        </p>
      </div>
    </div>
  );
}

// ── Occupied-location / combine popups ─────────────────────────────────────────

/**
 * Blocking popup for a DPCI-mismatched STORED destination, or a STAGED one — offers
 * Proceed / Place Hold Both (Empty Location) & Cancel / Cancel. All three are open to
 * every role. Proceeding leaves the previous occupant's own Pallet record untouched.
 */
function OccupiedLocationDialog({
  occupantPalletId,
  occupantDpci,
  wasStaged,
  onProceed,
  onHoldAndCancel,
  onCancel,
}: {
  occupantPalletId: number | null;
  occupantDpci: string | null;
  wasStaged: boolean;
  onProceed: () => void;
  onHoldAndCancel: () => void;
  onCancel: () => void;
}) {
  const message = wasStaged
    ? 'This location is staged for another pallet. Proceed anyway, flag it as empty, or cancel?'
    : `Pallet ${occupantPalletId ?? '—'} (DPCI ${occupantDpci ?? '—'}) is already stored here. Proceed anyway, flag it as empty, or cancel?`;

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-[20px] p-8 w-[520px] shadow-2xl">
        <h2 className="font-ui text-[24px] font-semibold text-white text-center mb-3">
          Location Already Occupied
        </h2>
        <p className="font-ui text-[17px] text-[#9A9A9A] text-center mb-7">
          {message}
        </p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onProceed}
            className="h-[60px] rounded-[12px] font-ui text-[18px] font-semibold text-white bg-[#003366] hover:bg-[#004488] transition-colors"
          >
            Proceed Anyway
          </button>
          <button
            type="button"
            onClick={onHoldAndCancel}
            className="h-[60px] rounded-[12px] font-ui text-[18px] font-semibold text-white bg-[#554400] hover:bg-[#665500] transition-colors"
          >
            Place Hold Both (Empty Location)
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-[52px] rounded-[12px] border border-[#3A3A3A] font-ui text-[17px] font-medium text-white hover:bg-[#1A1A1A] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Blocking popup for a DPCI-matching STORED occupant — offers to combine the two
 * pallets' quantities, or cancel back to destination entry. Combine is IM+ only; a
 * Worker sees only Cancel plus a note that an IM+ is needed, per product decision (no
 * "proceed without combining" option when the DPCI already matches).
 */
function CombineDialog({
  occupantPalletId,
  canCombine,
  onCombine,
  onCancel,
}: {
  occupantPalletId: number | null;
  canCombine: boolean;
  onCombine: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-[20px] p-8 w-[480px] shadow-2xl">
        <h2 className="font-ui text-[24px] font-semibold text-white text-center mb-3">
          Same Item Already Stored Here
        </h2>
        <p className="font-ui text-[17px] text-[#9A9A9A] text-center mb-7">
          Pallet {occupantPalletId ?? '—'} is already stored here with the same DPCI. Combine this pallet's quantity into it?
        </p>
        {!canCombine && (
          <p className="font-ui text-[14px] text-[#AA6600] text-center mb-5">
            Combining requires an Inventory Manager or above.
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 h-[64px] rounded-[12px] border border-[#3A3A3A] font-ui text-[19px] font-medium text-white hover:bg-[#1A1A1A] active:bg-[#262626] transition-colors"
          >
            Cancel
          </button>
          {canCombine && (
            <button
              type="button"
              onClick={onCombine}
              className="flex-1 h-[64px] rounded-[12px] font-ui text-[19px] font-semibold text-white bg-[#003366] hover:bg-[#004488] transition-colors"
            >
              Combine Pallets
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MNP Screen ────────────────────────────────────────────────────────────────

type ScreenState = 'ready' | 'pallet_scanned' | 'level_modal';

/**
 * Manual Put (MNP) screen.
 * Three-state flow: ready → pallet_scanned → level_modal.
 *
 * ready: Worker scans a Pallet ID. Calls POST /api/puts/manual/scan, which logs MNP_SCAN
 *   unconditionally (even if ineligible) and returns pallet details plus an eligibility flag.
 *   Ineligibility is non-blocking — the worker sees a warning but can continue. Transitions
 *   to pallet_scanned. If the pallet has a currentLocation, an info message notes it's a move.
 *
 * pallet_scanned: Worker enters a destination via the shared 3-box Aisle/Bin/Level entry
 *   (LocationEntryFields, levelOptional) — Aisle+Bin alone is enough to advance; Level is
 *   confirmed separately next. GET /api/locations/:id validates the Aisle+Bin exists. If
 *   valid, transitions to level_modal (pre-filled if a full barcode scan already supplied a
 *   level). If not found, clears the destination boxes and shows an error.
 *
 * level_modal: LevelModal collects the rack level the pallet was physically placed at.
 *   On confirm, POST /api/puts/manual/confirm runs a sequence of gates before it actually
 *   commits (see puts.ts's manualConfirm docstring): a contraction check, then an
 *   occupied/staged check that can offer to combine two same-DPCI pallets. Each gate can
 *   raise a blocking popup requiring the worker to resolve it before the put proceeds.
 *   Declining any popup returns to pallet_scanned with the pallet ID still scanned and the
 *   destination boxes cleared, per product decision. On success, returns to ready.
 *
 * A right-column history log tracks all scanned pallets with final placement or "in progress".
 * Demo buttons change with screen state (pallet scan / location scan).
 */
export function MNPPage() {
  const { token, user } = useAuth();
  const { setMessage, clearMessage } = useMessageBar();
  const { deliverScan } = useNumpad();

  const [screenState, setScreenState] = useState<ScreenState>('ready');
  // Session-level persistence (App-Wide screen-persistence item, v1.7.0) — see
  // MNPContext.tsx's own doc comment; mirrors LII/PII/ISI's identical pattern.
  const { scannedPallet, setScannedPallet } = useMNP();
  // Quick-hold panel (WLH.md) for the scanned pallet's current location, if it has one.
  const [holdOpen, setHoldOpen] = useState(false);
  const [pendingLocation, setPendingLocation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  // Pre-fill for LevelModal when the destination's level is already known — null when only
  // Aisle+Bin were manually entered, which has no known level.
  const [levelHint, setLevelHint] = useState<number | null>(null);
  // Bumped to force LocationEntryFields to remount (clearing its three boxes and
  // re-autofocusing Aisle) after a rejected/canceled destination — same pattern as PIP's
  // resetLocationField.
  const [locationEntryKey, setLocationEntryKey] = useState(0);
  // Non-null while a manualConfirm gate (contraction / occupied / combine) is blocking —
  // see puts.ts's manualConfirm docstring for the exact server-side sequencing this mirrors.
  const [pendingGate, setPendingGate] = useState<GateState | null>(null);

  // Refs for async callbacks.
  const screenStateRef    = useRef(screenState);
  const loadingRef        = useRef(loading);
  const scannedPalletRef  = useRef(scannedPallet);
  const pendingLocationRef = useRef(pendingLocation);
  // Mirrors `token` on every render so the unmount-cleanup cancel call (see the effect
  // below) can read the last-known-valid token — by the time that cleanup runs (either a
  // normal in-app navigation, or the redirect an idle-timeout logout triggers), MNPPage
  // itself never re-renders with a null token first (AuthContext's logout() swaps the
  // route before this component gets another render), so this ref still holds the real
  // token at cleanup time even though `useAuth().token` may already be null by then.
  const tokenRef = useRef(token);
  screenStateRef.current    = screenState;
  loadingRef.current        = loading;
  scannedPalletRef.current  = scannedPallet;
  pendingLocationRef.current = pendingLocation;
  tokenRef.current          = token;

  const pendingEntryKeyRef = useRef<number | null>(null);
  // The level chosen in LevelModal for the confirm attempt currently in flight — needed on
  // gate resubmission since handleLevelSelect's `level` parameter doesn't otherwise survive
  // across the contraction/occupied/combine popup round-trips.
  const pendingLevelRef = useRef<number | null>(null);
  // True once the IM+ contraction popup has been accepted for the confirm attempt currently
  // in flight — carried forward on subsequent resubmissions (e.g. into the occupied/combine
  // gate) so the worker isn't asked twice. Reset at the start of every fresh handleLevelSelect.
  const acknowledgeContractionRef = useRef(false);
  // Set immediately before deliverScan() by the Empty/Occupied/Contracted/Consolidate demo
  // buttons — /api/demo/location returns a 6-digit Aisle+Bin id (a physical location
  // barcode only ever encodes that much) plus the exact level separately, so this is how
  // handleDestinationResolved pre-fills LevelModal for a demo-triggered 6-digit resolution.
  // Consumed once and cleared regardless of outcome, so it never leaks into a later real scan.
  const demoLevelHintRef = useRef<number | null>(null);

  const role = (user?.role ?? 'WORKER') as Role;

  const palletField = useNumpadField();

  // ── Focus management ─────────────────────────────────────────────────────────

  /** Registers the Pallet ID field's numpad handler, wired to handlePalletScan on confirm. */
  const focusPalletField = useCallback(() => {
    palletField.focus(handlePalletScan);
  }, [palletField]);

  useEffect(() => {
    if (screenState === 'ready') {
      const id = setTimeout(() => focusPalletField(), 50);
      return () => clearTimeout(id);
    }
  }, [screenState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ─────────────────────────────────────────────────────────────────

  /**
   * Submit handler for the Pallet ID field. Calls POST /api/puts/manual/scan.
   * The MNP_SCAN activity log entry is always written server-side, regardless of eligibility.
   * On success, stores pallet data, sets a pendingEntryKey for later history update, and
   * transitions to pallet_scanned. Error paths: PALLET_NOT_FOUND or NO_CARTONS.
   */
  async function handlePalletScan(value: string) {
    const v = value.trim();
    if (!v || loadingRef.current || screenStateRef.current !== 'ready') return;

    const palletId = parseInt(v, 10);
    setLoading(true);
    try {
      const result = await apiFetch<{ pallet: MNPScannedPallet; eligible: boolean }>(
        '/api/puts/manual/scan',
        token!,
        { method: 'POST', body: JSON.stringify({ palletId: isNaN(palletId) ? v : palletId }) },
      );
      const entryKey = Date.now();
      pendingEntryKeyRef.current = entryKey;
      setHistory(h => [{ key: entryKey, palletId: result.pallet.id, outcome: 'SCANNED', timestamp: new Date() }, ...h]);
      setScannedPallet(result.pallet);
      setScreenState('pallet_scanned');
      if (result.pallet.currentLocation) {
        playAlert('info');
        setMessage({ type: 'info', text: `Pallet ${result.pallet.id} currently stored in ${fmtLocation(result.pallet.currentLocation)} — proceeding as move` });
      } else {
        // Clears any stale error from a prior failed scan (issue #95) — the
        // currentLocation branch above already overwrites it with its own info message.
        clearMessage();
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      playAlert('error');
      palletField.clear();
      if (code === 'PALLET_NOT_FOUND') {
        setMessage({ type: 'error', text: 'Pallet not found' });
      } else if (code === 'NO_CARTONS') {
        setMessage({ type: 'error', text: `Pallet ${v} has no stored cartons — cannot put` });
      } else {
        setMessage({ type: 'error', text: 'Scan failed — please try again' });
      }
    } finally {
      setLoading(false);
    }
  }

  /**
   * Clears the destination's three boxes via a remount and re-focuses Aisle — used after a
   * rejected destination (Location not found) and after any gate popup's Cancel/decline.
   */
  const resetLocationField = useCallback(() => {
    setLocationEntryKey(k => k + 1);
  }, []);

  /**
   * onResolved handler for the destination's 3-box entry. `locationId` is a 6-digit
   * Aisle+Bin (worker typed only those two, or scanned a 6-digit location barcode —
   * levelOptional) or an 8-digit full location (a full barcode scan, which already
   * encodes the level). Calls GET /api/locations/:id to validate existence before showing
   * the level modal — this endpoint already accepts either length (see locations.ts's
   * getLocation).
   */
  async function handleDestinationResolved(locationId: string) {
    if (loadingRef.current) return;

    setLoading(true);
    try {
      await apiFetch(`/api/locations/${encodeURIComponent(locationId)}`, token!);
      setPendingLocation(locationId);
      setLevelHint(locationId.length === 8 ? parseInt(locationId.slice(6, 8), 10) : demoLevelHintRef.current);
      setScreenState('level_modal');
      clearMessage();
    } catch {
      playAlert('error');
      resetLocationField();
      setMessage({ type: 'error', text: 'Location not found' });
    } finally {
      demoLevelHintRef.current = null;
      setLoading(false);
    }
  }

  /**
   * Called by LevelModal when the worker confirms a level. Stashes the level for any later
   * gate resubmission and starts a fresh confirm attempt.
   *
   * @param level - The rack level number selected by the worker in LevelModal
   */
  async function handleLevelSelect(level: number) {
    pendingLevelRef.current = level;
    acknowledgeContractionRef.current = false;
    await submitConfirm(level);
  }

  /**
   * Calls POST /api/puts/manual/confirm with the stored pallet ID, pending destination, and
   * chosen level, plus any gate-resolution flags accumulated so far. Branches on success
   * between a normal put/move and a consolidate result. On a gate error (CONTRACTED,
   * CONTRACTION_CONFIRM_REQUIRED, DESTINATION_OCCUPIED) opens the matching popup instead of
   * failing outright — see puts.ts's manualConfirm docstring for the exact gate sequencing.
   */
  async function submitConfirm(
    level: number,
    extra?: { acknowledgeContraction?: boolean; resolution?: 'proceed' | 'consolidate' },
  ) {
    const pallet = scannedPalletRef.current;
    const loc    = pendingLocationRef.current;
    if (!pallet || !loc) return;

    setLoading(true);
    try {
      const result = await apiFetch<ConfirmResult>(
        '/api/puts/manual/confirm',
        token!,
        {
          method: 'POST',
          body: JSON.stringify({
            palletId: pallet.id,
            destinationLocation: loc,
            level,
            ...(extra?.acknowledgeContraction && { acknowledgeContraction: true }),
            ...(extra?.resolution && { resolution: extra.resolution }),
          }),
        },
      );

      setPendingGate(null);
      const key = pendingEntryKeyRef.current ?? 0;

      if ('consolidated' in result) {
        setHistory(h => h.map(e =>
          e.key === key
            ? { ...e, outcome: 'CONSOLIDATED' as const, location: result.location, level }
            : e
        ));
        playAlert('info');
        setMessage({ type: 'success', text: `Pallet ${result.sourcePalletId} combined into Pallet ${result.targetPalletId}` });
        resetToReady();
        return;
      }

      setHistory(h => h.map(e =>
        e.key === key
          ? { ...e, outcome: result.wasMove ? 'MOVE' as const : 'PUT' as const, location: result.location, level: result.level, occupied: result.destinationWasOccupied, staged: result.destinationWasStaged }
          : e
      ));

      const base = result.wasMove && result.clearedLocation
        ? `Move complete — ${fmtLocation(result.clearedLocation)} → ${fmtLocation(result.location)} Level ${result.level}`
        : `Put complete — ${fmtLocation(result.location)} Level ${result.level}`;

      if (result.destinationWasOccupied) {
        playAlert('warning');
        setMessage({ type: 'warning', text: `${base} (was occupied)` });
      } else if (result.destinationWasStaged) {
        playAlert('warning');
        setMessage({ type: 'warning', text: `${base} (was staged)` });
      } else {
        playAlert('info');
        setMessage({ type: 'success', text: base });
      }

      resetToReady();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';

      if (code === 'CONTRACTED') {
        playAlert('error');
        setMessage({ type: 'error', text: 'This location is on contraction — put not allowed' });
        cancelToDestinationEntry();
        return;
      }
      if (code === 'CONTRACTION_CONFIRM_REQUIRED') {
        setPendingGate({ kind: 'contraction' });
        return;
      }
      if (code === 'DESTINATION_OCCUPIED') {
        const data = (err as { data?: {
          occupantPalletId: number | null; occupantDpci: string | null;
          matchesDpci: boolean; wasStaged: boolean;
        } }).data;
        setPendingGate(
          data?.matchesDpci
            ? { kind: 'combine', occupantPalletId: data.occupantPalletId, occupantDpci: data.occupantDpci }
            : { kind: 'occupied', occupantPalletId: data?.occupantPalletId ?? null, occupantDpci: data?.occupantDpci ?? null, wasStaged: data?.wasStaged ?? false },
        );
        return;
      }

      playAlert('error');
      setMessage({ type: 'error', text: code === 'NOT_FOUND' ? 'Location not found' : 'Confirm failed — please try again' });
      cancelToDestinationEntry();
    } finally {
      setLoading(false);
    }
  }

  /** Worker accepted the contraction popup — resubmits with acknowledgeContraction: true. */
  function handleContractionConfirm() {
    if (pendingLevelRef.current == null) return;
    acknowledgeContractionRef.current = true;
    submitConfirm(pendingLevelRef.current, { acknowledgeContraction: true });
  }

  /** Worker chose Proceed Anyway on the occupied/staged popup. */
  function handleOccupiedProceed() {
    if (pendingLevelRef.current == null) return;
    submitConfirm(pendingLevelRef.current, {
      acknowledgeContraction: acknowledgeContractionRef.current,
      resolution: 'proceed',
    });
  }

  /** Worker chose Combine Pallets on the DPCI-match popup (IM+ only, enforced server-side too). */
  function handleCombineConfirm() {
    if (pendingLevelRef.current == null) return;
    submitConfirm(pendingLevelRef.current, {
      acknowledgeContraction: acknowledgeContractionRef.current,
      resolution: 'consolidate',
    });
  }

  /**
   * Worker chose "Place Hold Both (Empty Location)" on the occupied/staged popup. Places
   * the hold directly via the same endpoint HoldPanel/RejectHoldDialog already use, then
   * cancels the put — the destination is left on hold rather than completed.
   */
  async function handlePlaceHoldAndCancel() {
    const loc = pendingLocationRef.current;
    const level = pendingLevelRef.current;
    if (!loc || level == null || loadingRef.current) return;

    const fullLocationId = loc.length === 8 ? loc : loc.slice(0, 6) + String(level).padStart(2, '0');

    setLoading(true);
    try {
      await apiFetch(`/api/locations/${fullLocationId}/hold`, token!, {
        method: 'PATCH',
        body: JSON.stringify({ holdType: 'HOLD_BOTH', reasonCode: 'W04' }),
      });
      playAlert('warning');
      setMessage({ type: 'warning', text: `Hold Both placed on ${fmtLocation(fullLocationId)} — put canceled` });
      cancelToDestinationEntry();
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'Failed to place hold — please try again' });
    } finally {
      setLoading(false);
    }
  }

  /**
   * Shared decline/cancel path for every gate popup — returns to pallet_scanned with the
   * pallet ID still scanned and the destination boxes cleared, per product decision.
   */
  function cancelToDestinationEntry() {
    setPendingGate(null);
    acknowledgeContractionRef.current = false;
    pendingLevelRef.current = null;
    setScreenState('pallet_scanned');
    resetLocationField();
  }

  /**
   * Best-effort log of an abandoned MNP scan — a pallet was scanned but the put was never
   * confirmed, either because the worker hit Clear, navigated away from MNP entirely, or
   * an idle timeout forced a logout mid-scan. Fires POST /api/puts/manual/cancel (not
   * awaited — nothing further to do here if it fails, and the unmount path can't await
   * anyway). MNP has no server-side reservation row the way SDP's Reserved-location flow
   * does, so there's nothing for a background job to discover and expire; this is the
   * client-triggered substitute. `mountedUpdate` is false from the unmount cleanup below
   * (the component is being destroyed — no local state left to usefully update) and true
   * from the Clear button (still mounted — updates the history entry so it reads Canceled
   * instead of sitting at "in progress" for the rest of the session).
   */
  function cancelScan(mountedUpdate: boolean) {
    const pallet = scannedPalletRef.current;
    if (!pallet || screenStateRef.current === 'ready' || !tokenRef.current) return;

    const stage: 'pallet_scanned' | 'level_modal' = screenStateRef.current === 'level_modal' ? 'level_modal' : 'pallet_scanned';
    const destinationLocation = pendingLocationRef.current ?? undefined;

    apiFetch('/api/puts/manual/cancel', tokenRef.current, {
      method: 'POST',
      body: JSON.stringify({ palletId: pallet.id, stage, destinationLocation }),
    }).catch(() => { /* best-effort — nothing more to do if this fails */ });

    if (mountedUpdate) {
      const key = pendingEntryKeyRef.current;
      if (key != null) {
        setHistory(h => h.map(e => (e.key === key ? { ...e, outcome: 'CANCELED' as const } : e)));
      }
    }
  }

  // Logs an abandoned scan when MNP unmounts while a pallet is scanned but not yet
  // confirmed — covers both a normal in-app navigation away from MNP and the redirect an
  // idle-timeout-triggered logout causes (AuthContext.tsx's idle timer calls logout()
  // directly with no prior warning, so this is the only hook available for that case —
  // see cancelScan's doc comment on why tokenRef is what makes this safe to fire here).
  // Empty deps: this must run only on true unmount, not on every screenState change.
  useEffect(() => {
    return () => {
      cancelScan(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Clears all per-put state (scanned pallet, pending location, history key) and returns to ready. */
  function resetToReady() {
    setScannedPallet(null);
    setPendingLocation(null);
    setLevelHint(null);
    setPendingGate(null);
    pendingEntryKeyRef.current = null;
    pendingLevelRef.current = null;
    acknowledgeContractionRef.current = false;
    setScreenState('ready');
    palletField.clear();
  }

  // ── Demo buttons ──────────────────────────────────────────────────────────────

  /** Fetches a real unlocated pallet id and delivers it as a simulated Pallet ID scan. */
  const demoPut = useCallback(async () => {
    try {
      const { palletId } = await apiFetch<{ palletId: number }>('/api/demo/pallet?status=unlocated', token!);
      deliverScan(String(palletId));
    } catch (err) {
      setMessage({ type: 'error', text: `Demo put: ${err instanceof Error ? err.message : 'unavailable'}` });
    }
  }, [token, deliverScan, setMessage]);

  /** Fetches a real already-stored pallet id and delivers it as a simulated Pallet ID scan, simulating a move. */
  const demoMove = useCallback(async () => {
    try {
      const { palletId } = await apiFetch<{ palletId: number }>('/api/demo/pallet?status=stored', token!);
      deliverScan(String(palletId));
    } catch (err) {
      setMessage({ type: 'error', text: `Demo move: ${err instanceof Error ? err.message : 'unavailable'}` });
    }
  }, [token, deliverScan, setMessage]);

  /** Delivers a Pallet ID that doesn't exist, simulating a not-found scan. */
  const demoBadPid = useCallback(() => deliverScan('999999999'), [deliverScan]);

  /**
   * Fetches a real empty location id and delivers it as a simulated destination scan.
   * `/api/demo/location` returns a 6-digit Aisle+Bin id (a physical location barcode only
   * ever encodes that much — see LocationEntryFields' levelOptional doc comment) plus the
   * exact level separately; deliverScan injects the 6-digit id (now correctly resolved as
   * a scanned Aisle+Bin override — see the LocationEntryFields fix this pairs with), and
   * demoLevelHintRef stashes the level so handleDestinationResolved can pre-fill LevelModal.
   */
  const demoEmptyLoc = useCallback(async () => {
    try {
      const { locationId, level } = await apiFetch<{ locationId: string; level: number }>('/api/demo/location?status=empty', token!);
      demoLevelHintRef.current = level;
      deliverScan(locationId);
    } catch (err) {
      setMessage({ type: 'error', text: `Demo location: ${err instanceof Error ? err.message : 'unavailable'}` });
    }
  }, [token, deliverScan, setMessage]);

  /** Fetches a real already-occupied location id and delivers it as a simulated destination scan, same as demoEmptyLoc. */
  const demoOccupiedLoc = useCallback(async () => {
    try {
      const { locationId, level } = await apiFetch<{ locationId: string; level: number }>('/api/demo/location?status=occupied', token!);
      demoLevelHintRef.current = level;
      deliverScan(locationId);
    } catch (err) {
      setMessage({ type: 'error', text: `Demo location: ${err instanceof Error ? err.message : 'unavailable'}` });
    }
  }, [token, deliverScan, setMessage]);

  /** Fetches a real Contraction-flagged location id and delivers it as a simulated destination scan — exercises the new contraction gate. */
  const demoContractedLoc = useCallback(async () => {
    try {
      const { locationId, level } = await apiFetch<{ locationId: string; level: number }>('/api/demo/location?status=contracted', token!);
      demoLevelHintRef.current = level;
      deliverScan(locationId);
    } catch (err) {
      setMessage({ type: 'error', text: `Demo location: ${err instanceof Error ? err.message : 'unavailable'}` });
    }
  }, [token, deliverScan, setMessage]);

  /**
   * Fetches a location whose stored occupant has the same DPCI as the currently-scanned
   * pallet, and delivers it as a simulated destination scan — exercises the combine popup.
   * Needs the scanned pallet's own id, so it's a no-op (button hidden) until one is scanned.
   */
  const demoConsolidateLoc = useCallback(async () => {
    if (!scannedPallet) return;
    try {
      const { locationId, level } = await apiFetch<{ locationId: string; level: number }>(
        `/api/demo/location?status=consolidate&palletId=${scannedPallet.id}`, token!,
      );
      demoLevelHintRef.current = level;
      deliverScan(locationId);
    } catch (err) {
      setMessage({ type: 'error', text: `Demo location: ${err instanceof Error ? err.message : 'unavailable'}` });
    }
  }, [token, deliverScan, setMessage, scannedPallet]);

  // Memoized so the JSX reference is stable across renders that don't change screen
  // state — useDemoSlot's re-sync effect keys off this reference, and an unmemoized
  // JSX literal would recreate it (and re-fire the effect) on every render, looping
  // forever via the FooterDemoContext state update it triggers.
  const demoSlot = useMemo(() => (
    screenState === 'ready' ? (
      <>
        <DemoBtn label="✓ Put"  color="green" onClick={demoPut} />
        <DemoBtn label="✓ Move" color="blue"  onClick={demoMove} />
        <DemoBtn label="✗ PID"  color="red"   onClick={demoBadPid} />
      </>
    ) : screenState === 'pallet_scanned' ? (
      <>
        <DemoBtn label="✓ Empty"      color="green" onClick={demoEmptyLoc} />
        <DemoBtn label="~ Occupied"   color="amber" onClick={demoOccupiedLoc} />
        <DemoBtn label="⛔ Contraction" color="red"   onClick={demoContractedLoc} />
        <DemoBtn label="⇄ Consolidate" color="blue"  onClick={demoConsolidateLoc} />
      </>
    ) : null
  ), [screenState, demoPut, demoMove, demoBadPid, demoEmptyLoc, demoOccupiedLoc, demoContractedLoc, demoConsolidateLoc]);

  useDemoSlot(demoSlot);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 flex select-none">
      {/* Left column */}
      <div className="flex-1 flex flex-col p-6 gap-4 overflow-y-auto">
        <FieldDisplay
          label="Scan Pallet ID"
          value={palletField.value}
          onFocus={focusPalletField}
          active={palletField.isActive}
          disabled={screenState !== 'ready'}
        />

        {screenState !== 'ready' && scannedPallet && (
          <>
            <div className="flex flex-col mt-1">
              <DataRow label="Pallet ID">
                <LiveId type="pallet" id={String(scannedPallet.id)} />
              </DataRow>
              <DataRow label="Item">{scannedPallet.descShort}</DataRow>
              <DataRow label="DPCI"><LiveId type="dpci" id={scannedPallet.dpci} /></DataRow>
              <DataRow label="Qty on pallet">
                {scannedPallet.quantity.pallets}P / {scannedPallet.quantity.cartons}C / {scannedPallet.quantity.ssps}S
              </DataRow>
              {scannedPallet.currentLocation && (
                <DataRow label="Move from">
                  <div className="flex items-center gap-3">
                    <LiveId type="location" id={scannedPallet.currentLocation} />
                    <button
                      type="button"
                      onClick={() => setHoldOpen(true)}
                      className="h-[30px] px-3 rounded-[8px] font-ui text-[13px] font-medium border border-[#3A3A3A] text-[#9A9A9A] hover:border-[#555] hover:text-white transition-colors"
                    >
                      Hold
                    </button>
                  </div>
                </DataRow>
              )}
            </div>

            {screenState === 'pallet_scanned' && (
              <>
                <div className="flex flex-col gap-1">
                  <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider">
                    Destination Location
                  </span>
                  <LocationEntryFields
                    key={locationEntryKey}
                    autoFocus
                    levelOptional
                    onResolved={handleDestinationResolved}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => { cancelScan(true); resetToReady(); }}
                  className="self-start h-[48px] px-5 rounded-[10px] border border-[#3A3A3A] text-[#9A9A9A] font-ui text-[16px] hover:border-[#555] hover:text-[#CFCFCF] transition-colors"
                >
                  Clear
                </button>
              </>
            )}
          </>
        )}

        {loading && (
          <div className="font-ui text-[16px] text-[#9A9A9A] animate-pulse">Working…</div>
        )}
      </div>

      {/* Right column — history log */}
      <div className="w-[456px] flex flex-col border-l border-[#1C1C1C] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1C1C1C]">
          <span className="font-ui text-[14px] font-semibold text-[#9A9A9A] uppercase tracking-wider">
            Put History
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {history.length === 0 ? (
            <p className="px-5 py-4 font-ui text-[15px] text-[#555]">No puts this session</p>
          ) : (
            history.map((entry) => {
              const outcomeColor =
                entry.outcome === 'SCANNED'      ? 'text-[#AA8800]' :
                entry.outcome === 'MOVE'         ? 'text-[#0066CC]' :
                entry.outcome === 'CONSOLIDATED' ? 'text-[#9933CC]' :
                entry.outcome === 'CANCELED'     ? 'text-[#666666]' :
                                                    'text-[#009900]';
              return (
                <div key={entry.key} className="px-5 py-3 border-b border-[#111] flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <LiveId type="pallet" id={String(entry.palletId)} />
                    <div className="flex items-center gap-2">
                      {entry.occupied && (
                        <span className="font-ui text-[11px] text-[#AA6600] font-semibold">WAS OCCUPIED</span>
                      )}
                      {entry.staged && (
                        <span className="font-ui text-[11px] text-[#AA6600] font-semibold">WAS STAGED</span>
                      )}
                      <span className={`font-ui text-[12px] font-semibold ${outcomeColor}`}>
                        {entry.outcome}
                      </span>
                    </div>
                  </div>
                  {entry.location ? (
                    <div className="flex items-center justify-between">
                      <span className="font-data text-[17px] text-[#CFCFCF]">
                        <LiveId type="location" id={entry.location} /> Lvl {entry.level}
                      </span>
                      <span className="font-data text-[12px] text-[#555]">
                        {entry.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="font-ui text-[13px] text-[#555] italic">
                        {entry.outcome === 'CANCELED' ? 'canceled — no destination entered' : 'in progress…'}
                      </span>
                      <span className="font-data text-[12px] text-[#555]">
                        {entry.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Level selection modal — State 3 (hidden once a confirm gate is pending) */}
      {screenState === 'level_modal' && !pendingGate && (
        <LevelModal onSelect={handleLevelSelect} initialLevel={levelHint} />
      )}

      {pendingGate?.kind === 'contraction' && (
        <ConfirmDialog
          title="Location On Contraction"
          message="This location is on contraction, do you want to complete the put?"
          confirmLabel="Complete Put"
          cancelLabel="Cancel"
          onConfirm={handleContractionConfirm}
          onCancel={cancelToDestinationEntry}
        />
      )}

      {pendingGate?.kind === 'occupied' && (
        <OccupiedLocationDialog
          occupantPalletId={pendingGate.occupantPalletId}
          occupantDpci={pendingGate.occupantDpci}
          wasStaged={pendingGate.wasStaged}
          onProceed={handleOccupiedProceed}
          onHoldAndCancel={handlePlaceHoldAndCancel}
          onCancel={cancelToDestinationEntry}
        />
      )}

      {pendingGate?.kind === 'combine' && (
        <CombineDialog
          occupantPalletId={pendingGate.occupantPalletId}
          canCombine={hasMinRole(role, 'IM')}
          onCombine={handleCombineConfirm}
          onCancel={cancelToDestinationEntry}
        />
      )}

      {holdOpen && scannedPallet?.currentLocation && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
          <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-[20px] p-6 max-h-full overflow-y-auto">
            <HoldPanel locationId={scannedPallet.currentLocation} onDone={() => setHoldOpen(false)} showClose />
          </div>
        </div>
      )}
    </div>
  );
}
