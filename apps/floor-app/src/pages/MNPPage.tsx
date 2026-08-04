import { useCallback, useEffect, useRef, useState } from 'react';
import { DataRow } from '../components/shared/DataRow';
import { HoldPanel } from '../components/shared/HoldPanel';
import { PalletIdField, type PalletIdFieldHandle } from '../components/shared/PalletIdField';
import { SessionHistoryPanel } from '../components/shared/SessionHistoryPanel';
import { LocationEntryFields } from '../components/shared/LocationEntryFields';
import { LockedHoldConfirmDialog } from '../components/shared/LockedHoldConfirmDialog';
import { StorageCodeBadge } from '../components/shared/StorageCodeBadge';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { LiveId } from '../components/ui/LiveId';
import { ModalOverlay } from '../components/ui/ModalOverlay';
import { DigitGrid, NumericReadout } from '../components/ui/NumericKeypad';
import { useAuth } from '../context/AuthContext';
import { useMessageBar } from '../context/MessageBarContext';
import { type MNPScannedPallet, useMNP } from '../context/MNPContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { useDigitInput } from '../lib/useDigitInput';
import { fmtLocation } from '../lib/fmt';
import { splitReasonCode } from '../lib/reasonCode';
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
  | { kind: 'hold'; holdCategory: 'HOLD_IN' | 'HOLD_BOTH' }
  | { kind: 'occupied'; occupantPalletId: number | null; occupantDpci: string | null; wasStaged: boolean }
  | { kind: 'combine'; occupantPalletId: number | null; occupantDpci: string | null };

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
  const { input, pressDigit, backspace, reset } = useDigitInput(initialLevel != null ? String(initialLevel) : '');

  /** Validates the entered level is a positive number and reports it via onSelect. */
  function confirm() {
    const level = parseInt(input, 10);
    if (!input || isNaN(level) || level <= 0) return;
    onSelect(level);
    reset();
  }

  return (
    <ModalOverlay width="w-[520px]">
      <h2 className="font-ui text-[26px] font-semibold text-white text-center mb-6">
        What level was the pallet placed at?
      </h2>

      <NumericReadout value={input} />

      <DigitGrid
        onDigit={pressDigit}
        onBackspace={backspace}
        keySize="large"
        lastCell={
          <button
            type="button"
            onClick={confirm}
            disabled={!input}
            className="h-[80px] rounded-[14px] bg-[#006600] border border-[#2C2C2C] text-white font-ui text-[22px] font-semibold hover:bg-[#007700] disabled:opacity-40 disabled:hover:bg-[#006600] transition-colors active:scale-95"
          >
            Enter
          </button>
        }
      />

      <p className="font-ui text-[14px] text-[#555] text-center mt-5">
        Enter the level where the pallet was placed
      </p>
    </ModalOverlay>
  );
}

// ── Occupied-location / combine popups ─────────────────────────────────────────

/** Default reason code offered for MNP's "Place Hold Both (Empty Location)" path (issue
 *  #84) — Warehouse / Empty Location. Was a hardcoded, non-editable 'W04' direct send
 *  before this issue; now a pre-filled starting value in an editable ReasonCodeField, same
 *  as every other reason-code entry point in the app. */
const DEFAULT_EMPTY_LOCATION_REASON = 'W01';

/**
 * Blocking popup for a DPCI-mismatched STORED destination, or a STAGED one — offers
 * Proceed / Place Hold Both (Empty Location) & Cancel / Cancel. All three are open to
 * every role. Proceeding leaves the previous occupant's own Pallet record untouched.
 *
 * "Place Hold Both" opens a second step confirming the reason code (issue #84) rather than
 * submitting immediately — matches every other hold-placement entry point in the app now
 * that reason codes are a real, validated pair instead of a free string.
 *
 * Both steps render at `position="top"` (2026-08-03 follow-up) — the confirmation step's
 * `ReasonCodeField` opens the on-screen Keyboard for its prefix entry, which docks
 * full-width at the bottom of the screen; a centered modal would sit underneath it. Applied
 * to the first step too so the dialog doesn't visibly jump position when "Place Hold Both"
 * transitions into the confirmation step.
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
  onHoldAndCancel: (reasonCode: string) => void;
  onCancel: () => void;
}) {
  const [confirmingHold, setConfirmingHold] = useState(false);
  const [reasonCode, setReasonCode] = useState(DEFAULT_EMPTY_LOCATION_REASON);

  if (confirmingHold) {
    return (
      <LockedHoldConfirmDialog
        title="Place Hold Both — Empty Location"
        message="Confirm the reason before placing this hold and canceling the put."
        value={reasonCode}
        onChange={setReasonCode}
        onBack={() => setConfirmingHold(false)}
        onConfirm={() => onHoldAndCancel(reasonCode)}
        confirmDisabled={!reasonCode}
      />
    );
  }

  const message = wasStaged
    ? 'This location is staged for another pallet. Proceed anyway, flag it as empty, or cancel?'
    : `Pallet ${occupantPalletId ?? '—'} (DPCI ${occupantDpci ?? '—'}) is already stored here. Proceed anyway, flag it as empty, or cancel?`;

  return (
    <ModalOverlay width="w-[520px]" position="top">
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
          onClick={() => setConfirmingHold(true)}
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
    </ModalOverlay>
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
 *   level). If not found, the boxes wash red and keep their entered value instead of
 *   clearing (issue #190) — the worker fixes them in place rather than re-typing blind.
 *
 * level_modal: LevelModal collects the rack level the pallet was physically placed at.
 *   On confirm, POST /api/puts/manual/confirm runs a sequence of gates before it actually
 *   commits (see puts.ts's manualConfirm docstring): a contraction check, then an
 *   occupied/staged check that can offer to combine two same-DPCI pallets. Each gate can
 *   raise a blocking popup requiring the worker to resolve it before the put proceeds.
 *   Declining any popup returns to pallet_scanned with the pallet ID still scanned and the
 *   destination boxes cleared, per product decision — a deliberate choice distinct from
 *   issue #190's fix above: a declined gate is a valid location the worker chose not to use,
 *   not an invalid entry, so it stays out of scope for that fix.
 *
 * A right-column history log tracks all scanned pallets with final placement or "in progress".
 * Demo buttons change with screen state (pallet scan / location scan).
 */
export function MNPPage() {
  const { token, user } = useAuth();
  const { setMessage, clearMessage } = useMessageBar();

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
  // Same pattern as acknowledgeContractionRef, for the IM+ Hold In/Both override gate (#92).
  // Hold Permanent has no equivalent — it's a hard block for every role, nothing to
  // acknowledge past.
  const acknowledgeHoldRef = useRef(false);
  const role = (user?.role ?? 'WORKER') as Role;

  const palletFieldRef = useRef<PalletIdFieldHandle>(null);
  const [palletIdValue, setPalletIdValue] = useState('');
  // Invalid-wash flags (issue #190) — set on a failed scan/resolve, cleared on success or a
  // full reset. Fields persist their entered value through an error instead of clearing (the
  // prior behavior); wash is the visual cue that replaces "it's gone, so it must be wrong."
  const [palletIdInvalid, setPalletIdInvalid] = useState(false);
  const [locationInvalid, setLocationInvalid] = useState(false);

  // ── Focus management ─────────────────────────────────────────────────────────

  /** (Re-)focuses the Pallet ID field for another attempt — e.g. after a failed scan. */
  const focusPalletField = useCallback(() => {
    palletFieldRef.current?.focus();
  }, []);

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
    setPalletIdValue(v);
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
      setPalletIdInvalid(false);
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
      // Persists the entered value and washes it red instead of clearing (issue #190) — the
      // worker can see exactly what they scanned rather than having to re-scan blind.
      // screenState never advances past 'ready' here, so there's no PIP-style (#188) trap of
      // a stale-but-still-usable prior value: the next attempt must itself succeed to proceed.
      setPalletIdInvalid(true);
      focusPalletField();
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
    setLocationInvalid(false);
  }, []);

  /**
   * onResolved handler for the destination's 3-box entry. `locationId` is a 6-digit
   * Aisle+Bin (worker typed only those two, scanned a 6-digit location barcode, or used
   * the Demo Scanner — levelOptional) or an 8-digit full location (a full barcode scan,
   * which already encodes the level). `demoLevel` is populated only for a Demo Scanner
   * 6-digit fill (see LocationEntryFields' onResolved doc comment) — the exact level of
   * the row the Demo Scanner happened to pick, used to pre-fill the Level Confirmation
   * modal the same way a worker who scanned a real 8-digit barcode gets it pre-filled.
   * Calls GET /api/locations/:id to validate existence before showing the level modal —
   * this endpoint already accepts either length (see locations.ts's getLocation).
   */
  async function handleDestinationResolved(locationId: string, _wasScanned: boolean, demoLevel?: number) {
    if (loadingRef.current) return;

    setLoading(true);
    try {
      await apiFetch(`/api/locations/${encodeURIComponent(locationId)}`, token!);
      setPendingLocation(locationId);
      setLevelHint(locationId.length === 8 ? parseInt(locationId.slice(6, 8), 10) : demoLevel ?? null);
      setLocationInvalid(false);
      setScreenState('level_modal');
      clearMessage();
    } catch {
      playAlert('error');
      // Persists the entered boxes and washes them red instead of clearing (issue #190) —
      // same rationale as handlePalletScan's catch above. screenState stays pallet_scanned,
      // so the worker must fix the boxes and get a successful resolve before advancing.
      setLocationInvalid(true);
      setMessage({ type: 'error', text: 'Location not found' });
    } finally {
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
    acknowledgeHoldRef.current = false;
    await submitConfirm(level);
  }

  /**
   * Calls POST /api/puts/manual/confirm with the stored pallet ID, pending destination, and
   * chosen level, plus any gate-resolution flags accumulated so far. Branches on success
   * between a normal put/move and a consolidate result. On a gate error (CONTRACTED,
   * DESTINATION_ON_HOLD, DESTINATION_HOLD_PERM, CONTRACTION_CONFIRM_REQUIRED,
   * HOLD_CONFIRM_REQUIRED, DESTINATION_OCCUPIED) opens the matching popup instead of
   * failing outright — see puts.ts's manualConfirm docstring for the exact gate sequencing.
   */
  async function submitConfirm(
    level: number,
    extra?: { acknowledgeContraction?: boolean; acknowledgeHold?: boolean; resolution?: 'proceed' | 'consolidate' },
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
            ...(extra?.acknowledgeHold && { acknowledgeHold: true }),
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
      if (code === 'DESTINATION_HOLD_PERM') {
        playAlert('error');
        setMessage({ type: 'error', text: 'This location is on Hold Permanent — put not allowed' });
        cancelToDestinationEntry();
        return;
      }
      if (code === 'DESTINATION_ON_HOLD') {
        playAlert('error');
        setMessage({ type: 'error', text: 'This location is on hold — put not allowed' });
        cancelToDestinationEntry();
        return;
      }
      if (code === 'HOLD_CONFIRM_REQUIRED') {
        const data = (err as { data?: { holdCategory: 'HOLD_IN' | 'HOLD_BOTH' } }).data;
        setPendingGate({ kind: 'hold', holdCategory: data?.holdCategory ?? 'HOLD_BOTH' });
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

  /** IM+ worker accepted the Hold In/Both popup — resubmits with acknowledgeHold: true. */
  function handleHoldConfirm() {
    if (pendingLevelRef.current == null) return;
    acknowledgeHoldRef.current = true;
    submitConfirm(pendingLevelRef.current, { acknowledgeHold: true });
  }

  /** Worker chose Proceed Anyway on the occupied/staged popup. */
  function handleOccupiedProceed() {
    if (pendingLevelRef.current == null) return;
    submitConfirm(pendingLevelRef.current, {
      acknowledgeContraction: acknowledgeContractionRef.current,
      acknowledgeHold: acknowledgeHoldRef.current,
      resolution: 'proceed',
    });
  }

  /** Worker chose Combine Pallets on the DPCI-match popup (IM+ only, enforced server-side too). */
  function handleCombineConfirm() {
    if (pendingLevelRef.current == null) return;
    submitConfirm(pendingLevelRef.current, {
      acknowledgeContraction: acknowledgeContractionRef.current,
      acknowledgeHold: acknowledgeHoldRef.current,
      resolution: 'consolidate',
    });
  }

  /**
   * Worker chose "Place Hold Both (Empty Location)" on the occupied/staged popup and
   * confirmed a reason code (issue #84 — previously a hardcoded, non-editable 'W04' direct
   * send; now the same pre-filled-but-editable pattern every other hold entry point uses).
   * Places the hold directly via the same endpoint HoldPanel/RejectHoldDialog already use,
   * then cancels the put — the destination is left on hold rather than completed.
   */
  async function handlePlaceHoldAndCancel(reasonCode: string) {
    const loc = pendingLocationRef.current;
    const level = pendingLevelRef.current;
    if (!loc || level == null || loadingRef.current) return;

    const fullLocationId = loc.length === 8 ? loc : loc.slice(0, 6) + String(level).padStart(2, '0');
    const { prefix: reasonPrefix, number: reasonNumber } = splitReasonCode(reasonCode);

    setLoading(true);
    try {
      await apiFetch(`/api/locations/${fullLocationId}/hold`, token!, {
        method: 'PATCH',
        body: JSON.stringify({ holdType: 'HOLD_BOTH', reasonPrefix, reasonNumber }),
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
    acknowledgeHoldRef.current = false;
    pendingLevelRef.current = null;
    setScreenState('pallet_scanned');
    resetLocationField();
  }

  /**
   * Best-effort log of an abandoned MNP scan — a pallet was scanned but the put was never
   * confirmed, either because the worker hit Cancel Put, navigated away from MNP entirely, or
   * an idle timeout forced a logout mid-scan. Fires POST /api/puts/manual/cancel (not
   * awaited — nothing further to do here if it fails, and the unmount path can't await
   * anyway). MNP has no server-side reservation row the way SDP's Reserved-location flow
   * does, so there's nothing for a background job to discover and expire; this is the
   * client-triggered substitute. `mountedUpdate` is false from the unmount cleanup below
   * (the component is being destroyed — no local state left to usefully update) and true
   * from the Cancel Put button (still mounted — updates the history entry so it reads Canceled
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
    acknowledgeHoldRef.current = false;
    setScreenState('ready');
    setPalletIdValue('');
    setPalletIdInvalid(false);
    setLocationInvalid(false);
  }

  // Demo buttons (Feature 9) — Pallet ID's own demo buttons (Put/Move/Bad PID) are owned
  // internally by PalletIdField's `demoScanner` prop (Phase 1); Location's own demo
  // buttons (Empty/Occupied/Contraction/Consolidate) are likewise now owned internally by
  // LocationEntryFields' `demoScanner` prop (Phase 2) — its `demoScannedPalletId` prop
  // (below) supplies the Consolidate option's cross-scan-type dependency, hiding that
  // option automatically until a pallet is actually scanned (this block only ever mounts
  // once one is, so it's always available here).

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 flex select-none">
      {/* Left column */}
      <div className="flex-1 flex flex-col p-6 gap-4 overflow-y-auto">
        <PalletIdField
          ref={palletFieldRef}
          label="Scan Pallet ID"
          value={palletIdValue}
          onChange={handlePalletScan}
          demoScanner
          boxClass="h-[72px] px-5 rounded-[12px]"
          valueClass="text-[32px] font-medium tracking-[0.04em]"
          caretClass="w-[3px] h-[38px]"
          disabled={screenState !== 'ready'}
          invalid={palletIdInvalid}
        />

        {screenState !== 'ready' && scannedPallet && (
          <>
            <div className="flex flex-col mt-1">
              <DataRow label="Pallet ID">
                <LiveId type="pallet" id={String(scannedPallet.id)} />
              </DataRow>
              <DataRow label="Item">{scannedPallet.descShort}</DataRow>
              <DataRow label="DPCI">
                <div className="flex items-center gap-2">
                  <LiveId type="dpci" id={scannedPallet.dpci} />
                  <StorageCodeBadge storageCode={scannedPallet.itemStorageCode} />
                </div>
              </DataRow>
              <DataRow label="Qty on pallet">
                {scannedPallet.quantity.pallets}P / {scannedPallet.quantity.cartons}C / {scannedPallet.quantity.ssps}S
              </DataRow>
              {scannedPallet.currentLocation && (
                <DataRow label="Move from">
                  <div className="flex items-center gap-3">
                    <LiveId type="location" id={scannedPallet.currentLocation} />
                    {scannedPallet.currentLocationStorageCode && scannedPallet.currentLocationSize && (
                      <StorageCodeBadge storageCode={scannedPallet.currentLocationStorageCode} size={scannedPallet.currentLocationSize} />
                    )}
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
                    demoScanner
                    demoScannedPalletId={scannedPallet.id}
                    groupInvalid={locationInvalid}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => { cancelScan(true); resetToReady(); }}
                  className="self-start h-[48px] px-5 rounded-[10px] font-ui text-[16px] font-semibold text-white bg-[#554400] hover:bg-[#665500] transition-colors"
                >
                  Cancel Put
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
      <SessionHistoryPanel
        title="Put History"
        emptyMessage="No puts this session"
        entries={history}
        keyFn={(entry) => entry.key}
        width="w-[456px]"
        renderRow={(entry) => {
          const outcomeColor =
            entry.outcome === 'SCANNED'      ? 'text-[#AA8800]' :
            entry.outcome === 'MOVE'         ? 'text-[#0066CC]' :
            entry.outcome === 'CONSOLIDATED' ? 'text-[#9933CC]' :
            entry.outcome === 'CANCELED'     ? 'text-[#666666]' :
                                                'text-[#009900]';
          return (
            <>
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
            </>
          );
        }}
      />

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

      {pendingGate?.kind === 'hold' && (
        <ConfirmDialog
          title={pendingGate.holdCategory === 'HOLD_BOTH' ? 'Location On Hold Both' : 'Location On Hold Inbound'}
          message="This location is on hold, do you want to complete the put?"
          confirmLabel="Complete Put"
          cancelLabel="Cancel"
          onConfirm={handleHoldConfirm}
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
        <ConfirmDialog
          title="Same Item Already Stored Here"
          message={`Pallet ${pendingGate.occupantPalletId ?? '—'} is already stored here with the same DPCI. Combine this pallet's quantity into it?`}
          confirmLabel="Combine Pallets"
          showConfirm={hasMinRole(role, 'IM')}
          note={!hasMinRole(role, 'IM') ? 'Combining requires an Inventory Manager or above.' : undefined}
          onConfirm={handleCombineConfirm}
          onCancel={cancelToDestinationEntry}
        />
      )}

      {holdOpen && scannedPallet?.currentLocation && (
        <ModalOverlay backdropClassName="p-8" padding="p-6" cardClassName="max-h-full overflow-y-auto" shadow={false} position="top-left">
          <HoldPanel locationId={scannedPallet.currentLocation} onDone={() => setHoldOpen(false)} showClose />
        </ModalOverlay>
      )}
    </div>
  );
}
