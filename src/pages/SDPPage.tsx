import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HoldPanel } from '../components/shared/HoldPanel';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { LiveId } from '../components/ui/LiveId';
import { useAuth } from '../context/AuthContext';
import { useDemoSlot } from '../context/FooterDemoContext';
import { useMessageBar } from '../context/MessageBarContext';
import { useNavLock } from '../context/NavLockContext';
import { useNumpad } from '../context/NumpadContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { useNumpadField } from '../lib/useNumpadField';
import { fmtLocation } from '../lib/fmt';

const SIZES = ['XS', 'HS', 'S', 'M', 'L'];

// ── Types ────────────────────────────────────────────────────────────────────

interface DirectedResult {
  reservationId: number;
  directedLocation: string;
  pallet: {
    id: number;
    dpci: string;
    descShort: string;
    quantity: { pallets: number; cartons: number; ssps: number };
    currentLocation: string | null;
  };
  alreadyStored: boolean;
}

interface HistoryEntry {
  reservationId: number;
  palletId: number;
  directedLocation: string;
  outcome: 'ASSIGNED' | 'PUT' | 'MOVE' | 'RELEASED' | 'BLOCKED';
  finalLocation?: string;
  timestamp: Date;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Single labeled data row in the directed-put data panel. */
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
 * Input display field driven by NumpadContext. Supports a `locked` state (in addition to
 * `disabled`) which prevents focus while the screen is in the directed/active-reservation state.
 *
 * @param label - Field label shown above the display box
 * @param value - Current field value (from useNumpadField)
 * @param onFocus - Called when the field is tapped; should call field.focus(handler)
 * @param active - True when this field currently holds the numpad handler
 * @param disabled - True when the field should be greyed out (e.g., aisle not yet entered)
 * @param locked - True when the screen is locked to an active reservation; prevents focus
 */
function FieldDisplay({
  label,
  value,
  onFocus,
  active = false,
  disabled = false,
  locked = false,
}: {
  label: string;
  value: string;
  onFocus: () => void;
  active?: boolean;
  disabled?: boolean;
  locked?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider">
        {label}
      </span>
      <button
        type="button"
        onClick={onFocus}
        disabled={disabled || locked}
        className={`flex items-center h-[72px] px-5 rounded-[12px] bg-[#0D0D0D] border-2 disabled:opacity-40 transition-colors ${active && !disabled && !locked ? 'border-[#CC0000]' : 'border-[#3A3A3A] hover:border-[#555]'}`}
      >
        <span className="font-data text-[32px] font-medium text-white tracking-[0.04em]">
          {value || <span className="text-[#444]">—</span>}
        </span>
        {active && !disabled && !locked && (
          <span className="inline-block w-[3px] h-[38px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />
        )}
      </button>
    </div>
  );
}

/**
 * Escape-hatch action button in the directed state. Used for Unassign and Blocked Put.
 * Three color variants: primary (blue), danger (red/dark), warning (amber/dark).
 */
function ActionBtn({
  label,
  variant,
  onClick,
  disabled = false,
}: {
  label: string;
  variant: 'primary' | 'danger' | 'warning';
  onClick: () => void;
  disabled?: boolean;
}) {
  const styles: Record<string, string> = {
    primary: 'bg-[#003366] hover:bg-[#004488] text-white',
    danger:  'bg-[#660000] hover:bg-[#770000] text-white',
    warning: 'bg-[#554400] hover:bg-[#665500] text-white',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-[72px] px-6 rounded-[12px] font-ui text-[20px] font-semibold transition-colors disabled:opacity-40 ${styles[variant]}`}
    >
      {label}
    </button>
  );
}

/** Colored footer demo button; `color` selects a background from a small fixed palette. */
function DemoBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  const colors: Record<string, string> = {
    green: 'bg-[#006600] hover:bg-[#007700] text-white',
    red:   'bg-[#660000] hover:bg-[#770000] text-white',
    blue:  'bg-[#003366] hover:bg-[#004488] text-white',
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

// ── SDP Screen ───────────────────────────────────────────────────────────────

type ScreenState = 'entry' | 'directed';

/**
 * System Directed Put (SDP) screen.
 * Two-state flow: entry → directed.
 *
 * entry: Worker enters an Aisle, then scans a Pallet ID. IM+ users can also set
 *   Size / Storage Code / Zone overrides and toggle Consolidating mode (each can be
 *   "locked" to persist across puts). Scanning a pallet calls POST /api/puts/directed,
 *   which runs eligibility checks, resolves the target zone and location, creates a
 *   5-minute Reservation row, and returns the directed location. Transitions to directed.
 *
 * directed: Screen is locked. Worker scans the directed location to confirm
 *   (POST /api/puts/{id}/confirm). Two escapes:
 *   - Unassign (POST /api/puts/{id}/unassign): releases reservation, returns to entry.
 *   - Blocked Put (POST /api/puts/{id}/block): places Hold Both on the current location,
 *     finds the next location, creates a new reservation, re-directs within the same state.
 *   Reservation expiry (server-side 5-min timer) is detected when any action returns NOT_FOUND.
 *
 * A right-column history log tracks all reservation outcomes (ASSIGNED/PUT/MOVE/RELEASED/BLOCKED).
 */
export function SDPPage() {
  const { token, user } = useAuth();
  const { setMessage } = useMessageBar();
  const { deliverScan, hidePanel } = useNumpad();
  const isIM = ['IM', 'LEAD', 'MANAGER', 'ADMIN'].includes(user?.role ?? '');

  const [screenState, setScreenState] = useState<ScreenState>('entry');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [confirmBlock, setConfirmBlock] = useState(false);
  // Quick-hold panel (WLH.md) for the currently directed location.
  const [holdOpen, setHoldOpen] = useState(false);

  // Screen-locked: while a reservation is active, Back/Home/Jump/Logout are disabled
  // shell-wide so the worker must resolve (complete or unassign) before leaving.
  useNavLock(screenState === 'directed');

  // Entry-state field values.
  const [zoneOverride, setZoneOverride]     = useState<number | null>(null);
  const [consolidating, setConsolidating]   = useState(false);
  const [sizeLocked, setSizeLocked]         = useState(false);
  const [storageLocked, setStorageLocked]   = useState(false);
  const [zoneLocked, setZoneLocked]         = useState(false);

  // Directed state.
  const [directed, setDirected] = useState<DirectedResult | null>(null);

  // Refs to check from async callbacks.
  const screenStateRef = useRef(screenState);
  const loadingRef     = useRef(loading);
  const directedRef    = useRef(directed);
  screenStateRef.current = screenState;
  loadingRef.current     = loading;
  directedRef.current    = directed;

  const aisleField    = useNumpadField('numpad', 3);
  const palletField   = useNumpadField();
  const confirmField  = useNumpadField();
  const sizeField     = useNumpadField('keyboard');
  const storageField  = useNumpadField('keyboard', 2);
  const zoneField     = useNumpadField('numpad', 1);

  // handlePalletScan can run from a closure captured well before the aisle was typed —
  // the aisle-confirm → focusPalletField chain registers it once, immediately after the
  // aisle field is first focused (empty), and that registration is never refreshed by
  // typing. Reading aisleField.value directly there would silently see "" forever, so
  // every pallet scan resulting from the normal aisle-then-scan flow needs this ref instead.
  const aisleValueRef = useRef(aisleField.value);
  aisleValueRef.current = aisleField.value;

  // Same stale-closure hazard as aisleValueRef above: handlePalletScan is registered with
  // palletField once per entry into 'entry' state and not re-registered when consolidating
  // toggles, so reading `consolidating` directly there would always see its value from
  // whenever the screen last reset (typically false) — read the ref instead.
  const consolidatingRef = useRef(consolidating);
  consolidatingRef.current = consolidating;

  // Controls which field gets focus when returning to entry state.
  const postResetFocusRef = useRef<'aisle' | 'pallet'>('aisle');

  // Reservation polling interval ref (for timeout detection).
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Focus management ────────────────────────────────────────────────────────

  /** Registers the Aisle field's numpad handler, wired to handleAisleConfirm on confirm. */
  const focusAisleField = useCallback(() => {
    aisleField.focus(handleAisleConfirm);
  }, [aisleField]);

  /** Registers the Pallet ID field's numpad handler, wired to handlePalletScan on confirm. */
  const focusPalletField = useCallback(() => {
    palletField.focus(handlePalletScan);
  }, [palletField]);

  /** Registers the Confirm Location field's numpad handler, wired to handleLocationConfirm on confirm. */
  const focusConfirmField = useCallback(() => {
    confirmField.focus(handleLocationConfirm);
  }, [confirmField]);

  /** Registers the IM+ Size override field's keyboard handler; just dismisses the panel on confirm. */
  const focusSizeField = useCallback(() => {
    sizeField.focus(() => hidePanel());
  }, [sizeField, hidePanel]);

  /** Quick-pick: sets Size directly to a tapped standard value and ends focus — the field stays typeable via focusSizeField for anything non-standard. */
  const selectSize = useCallback((v: string) => {
    sizeField.set(v);
    hidePanel();
  }, [sizeField, hidePanel]);

  /** Registers the IM+ Storage Code override field's keyboard handler; dismisses the panel and advances to Pallet ID on confirm. */
  const focusStorageField = useCallback(() => {
    storageField.focus(() => {
      hidePanel();
      setTimeout(() => focusPalletField(), 50);
    });
  }, [storageField, hidePanel, focusPalletField]);

  /** Registers the IM+ Zone override field's numpad handler; parses the digit and dismisses the panel on confirm. */
  const focusZoneField = useCallback(() => {
    zoneField.focus((v) => {
      const n = parseInt(v.trim(), 10);
      setZoneOverride(isNaN(n) ? null : n);
      hidePanel();
    });
  }, [zoneField, hidePanel]);

  useEffect(() => {
    if (screenState === 'entry') {
      const target = postResetFocusRef.current;
      const id = setTimeout(() => {
        if (target === 'pallet') focusPalletField();
        else focusAisleField();
      }, 50);
      return () => clearTimeout(id);
    }
  }, [screenState]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (screenState === 'directed') {
      const id = setTimeout(() => focusConfirmField(), 50);
      return () => clearTimeout(id);
    }
  }, [screenState, focusConfirmField]);

  // ── Polling (reservation timeout detection) ─────────────────────────────────

  /**
   * Starts a 15-second polling interval to detect reservation timeout client-side.
   * In the current demo build this is a stub — actual expiry is detected reactively
   * when the next confirm/unassign/block call returns NOT_FOUND.
   */
  function startPolling(reservationId: number) {
    stopPolling();
    pollIntervalRef.current = setInterval(async () => {
      try {
        // A simple way to detect timeout: try fetching reservation status via confirm with a dummy location.
        // Instead, we just ping the directed location status — if it's no longer RESERVED, the reservation expired.
        // For simplicity, we poll with a lightweight check on the reservationId.
        // The timer function deletes the Reservation row; we can check by attempting an action.
        // Best approach for demo: check every 15s if the reservation still exists via a dedicated lightweight endpoint.
        // Since we don't have one, we'll skip polling in the demo and rely on next-action detection.
      } catch {
        // If the reservation expired, the next action (confirm/unassign/block) will return 404.
      }
      void reservationId; // suppress unused variable warning
    }, 15_000);
  }

  /** Clears the polling interval if one is running. Called on confirmed put, unassign, block, or unmount. */
  function stopPolling() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }

  useEffect(() => { return () => stopPolling(); }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────

  /** Submit handler for the Aisle field. Moves focus to the Pallet ID field on confirm. */
  function handleAisleConfirm(value: string) {
    const v = value.trim();
    if (!v) return;
    // Aisle confirmed — move focus to pallet field.
    const id = setTimeout(() => focusPalletField(), 50);
    return () => clearTimeout(id);
  }

  /**
   * Submit handler for the Pallet ID field. Calls POST /api/puts/directed with the aisle,
   * pallet ID, and any IM+ overrides. On success, sets directed state and transitions to
   * the directed screen state. Shows a warning if the pallet is already stored (move scenario).
   */
  async function handlePalletScan(value: string) {
    const v = value.trim();
    if (!v || loadingRef.current || screenStateRef.current !== 'entry') return;
    if (!aisleValueRef.current.trim()) return;

    setLoading(true);
    try {
      const aisle = parseInt(aisleValueRef.current.trim(), 10);
      if (isNaN(aisle)) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

      const palletId = parseInt(v, 10);
      if (isNaN(palletId)) throw Object.assign(new Error('PALLET_NOT_FOUND'), { status: 404 });

      const sizeVal    = sizeField.value.trim().toUpperCase();
      const storageVal = storageField.value.trim().toUpperCase();

      const result = await apiFetch<DirectedResult>('/api/puts/directed', token!, {
        method: 'POST',
        body: JSON.stringify({
          aisle,
          palletId,
          ...(sizeVal    && { size: sizeVal }),
          ...(storageVal && { storageCode: storageVal }),
          ...(zoneOverride != null && { zone: zoneOverride }),
          consolidating: consolidatingRef.current,
        }),
      });

      setDirected(result);
      setScreenState('directed');
      startPolling(result.reservationId);
      setHistory(h => [{
        reservationId: result.reservationId,
        palletId: result.pallet.id,
        directedLocation: result.directedLocation,
        outcome: 'ASSIGNED',
        timestamp: new Date(),
      }, ...h]);

      if (result.alreadyStored && result.pallet.currentLocation) {
        if (consolidatingRef.current) {
          playAlert('info');
          setMessage({ type: 'info', text: `Pallet ${result.pallet.id} currently stored in ${fmtLocation(result.pallet.currentLocation)} — directing as move` });
        } else {
          playAlert('warning');
          setMessage({ type: 'warning', text: `Pallet ${result.pallet.id} currently stored in ${fmtLocation(result.pallet.currentLocation)} — directing as move` });
        }
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      playAlert('error');
      palletField.clear();
      if (code === 'PALLET_NOT_FOUND') {
        setMessage({ type: 'error', text: 'Pallet not found' });
      } else if (code === 'NO_CARTONS') {
        setMessage({ type: 'error', text: `Pallet ${value} has no stored cartons — cannot put` });
      } else if (code === 'NO_LOCATIONS') {
        setMessage({ type: 'error', text: `No eligible locations available in aisle ${aisleValueRef.current}` });
      } else {
        setMessage({ type: 'error', text: 'Put failed — please try again' });
      }
    } finally {
      setLoading(false);
    }
  }

  /**
   * Submit handler for the Confirm Location field. Calls POST /api/puts/{id}/confirm with
   * the scanned location. On LOCATION_MISMATCH, re-focuses for retry. On NOT_FOUND, the
   * reservation has expired — resets to entry with full field clear. On success, updates
   * the history entry outcome and shows a completion message.
   */
  async function handleLocationConfirm(value: string) {
    const v = value.trim();
    if (!v || loadingRef.current) return;
    const d = directedRef.current;
    if (!d) return;

    setLoading(true);
    try {
      const result = await apiFetch<{ location: string; wasMove: boolean; clearedLocation: string | null }>(
        `/api/puts/${d.reservationId}/confirm`,
        token!,
        { method: 'POST', body: JSON.stringify({ scannedLocation: v }) },
      );
      stopPolling();
      playAlert('info');
      setHistory(h => h.map(e =>
        e.reservationId === d.reservationId
          ? { ...e, outcome: result.wasMove ? 'MOVE' as const : 'PUT' as const, finalLocation: result.location }
          : e
      ));
      const msg = result.wasMove && result.clearedLocation
        ? `Move complete — ${fmtLocation(result.clearedLocation)} → ${fmtLocation(result.location)}`
        : `Put complete — ${fmtLocation(result.location)}`;
      setMessage({ type: 'success', text: msg });
      resetToEntry();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      playAlert('error');
      confirmField.clear();
      confirmField.focus(handleLocationConfirm);
      if (code === 'LOCATION_MISMATCH') {
        setMessage({ type: 'error', text: `Wrong location — directed to ${d.directedLocation}` });
      } else if (code === 'NOT_FOUND') {
        // Reservation expired.
        playAlert('warning');
        setMessage({ type: 'warning', text: `Reservation expired — location ${d.directedLocation} released` });
        stopPolling();
        resetToEntry(true);
      } else {
        setMessage({ type: 'error', text: 'Confirm failed — please try again' });
      }
    } finally {
      setLoading(false);
    }
  }

  /**
   * Escape-hatch: voluntarily releases the current reservation without placing the pallet.
   * Calls POST /api/puts/{id}/unassign, which clears the location to EMPTY and deletes the
   * Reservation row atomically. Returns to entry state; pallet and confirm fields are cleared,
   * non-locked overrides are also cleared so the next put can start fresh.
   */
  async function handleUnassign() {
    const d = directedRef.current;
    if (!d || loadingRef.current) return;
    setLoading(true);
    try {
      await apiFetch(`/api/puts/${d.reservationId}/unassign`, token!, { method: 'POST' });
      stopPolling();
      playAlert('info');
      setHistory(h => h.map(e =>
        e.reservationId === d.reservationId ? { ...e, outcome: 'RELEASED' as const } : e
      ));
      setMessage({ type: 'info', text: `Reservation cleared — ${d.directedLocation} released` });
      resetToEntry();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'NOT_FOUND') {
        playAlert('warning');
        setMessage({ type: 'warning', text: `Reservation expired — location ${d.directedLocation} released` });
        stopPolling();
        resetToEntry(true);
      } else {
        setMessage({ type: 'error', text: 'Unassign failed — please try again' });
      }
    } finally {
      setLoading(false);
    }
  }

  /**
   * Blocked Put: reports the directed location as unusable. Calls POST /api/puts/{id}/block,
   * which places Hold Both on the current location, finds the next eligible location in the aisle,
   * creates a new reservation, and returns the new directed location. The screen stays in directed
   * state but re-directs to the new location. If no further locations are available (NO_LOCATIONS),
   * resets to entry with a full clear.
   */
  async function handleBlock() {
    const d = directedRef.current;
    if (!d || loadingRef.current) return;
    setLoading(true);
    try {
      const result = await apiFetch<{ blockedLocation: string; newReservationId: number; newDirectedLocation: string }>(
        `/api/puts/${d.reservationId}/block`,
        token!,
        { method: 'POST' },
      );
      playAlert('info');
      setMessage({ type: 'warning', text: `Hold Both placed on ${result.blockedLocation} — now directed to ${result.newDirectedLocation}` });
      setDirected({ ...d, reservationId: result.newReservationId, directedLocation: result.newDirectedLocation });
      setHistory(h => [
        { reservationId: result.newReservationId, palletId: d.pallet.id, directedLocation: result.newDirectedLocation, outcome: 'ASSIGNED' as const, timestamp: new Date() },
        ...h.map(e => e.reservationId === d.reservationId ? { ...e, outcome: 'BLOCKED' as const } : e),
      ]);
      startPolling(result.newReservationId);
      confirmField.clear();
      confirmField.focus(handleLocationConfirm);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'NO_LOCATIONS') {
        playAlert('error');
        setMessage({ type: 'error', text: `Hold Both placed — no further locations available in aisle ${aisleField.value}` });
        stopPolling();
        resetToEntry(true);
      } else if (code === 'NOT_FOUND') {
        playAlert('warning');
        setMessage({ type: 'warning', text: `Reservation expired — location ${d.directedLocation} released` });
        stopPolling();
        resetToEntry(true);
      } else {
        setMessage({ type: 'error', text: 'Block failed — please try again' });
      }
    } finally {
      setLoading(false);
    }
  }

  /**
   * Resets back to the entry state after a put, unassign, or block-with-no-locations.
   * `full=false` (normal put/unassign): clears only pallet and confirm fields; locked overrides
   *   are preserved; focus returns to the pallet field for the next pallet scan.
   * `full=true` (reservation expiry or no-locations): clears all fields including aisle and
   *   overrides; focus returns to the aisle field.
   */
  function resetToEntry(full = false) {
    setDirected(null);
    setScreenState('entry');
    palletField.clear();
    confirmField.clear();
    if (full) {
      postResetFocusRef.current = 'aisle';
      aisleField.clear();
      sizeField.clear();
      storageField.clear();
      zoneField.clear();
      setZoneOverride(null);
    } else {
      postResetFocusRef.current = 'pallet';
      if (!sizeLocked)    sizeField.clear();
      if (!storageLocked) storageField.clear();
      if (!zoneLocked)    { zoneField.clear(); setZoneOverride(null); }
    }
  }

  // ── Demo buttons ────────────────────────────────────────────────────────────

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
  const demoBadPid = useCallback(() => deliverScan('INVALID-PID-000'), [deliverScan]);

  /** Delivers the currently directed location, simulating a correct confirm scan. */
  const demoConfirmOk = useCallback(() => {
    if (directedRef.current) deliverScan(directedRef.current.directedLocation);
  }, []);

  /** Delivers a location that won't match the directed location, simulating a mismatch. */
  const demoConfirmBad = useCallback(() => deliverScan('999999'), [deliverScan]);

  // Memoized so the JSX reference is stable across renders that don't change screen
  // state — useDemoSlot's re-sync effect keys off this reference, and an unmemoized
  // JSX literal would recreate it (and re-fire the effect) on every render, looping
  // forever via the FooterDemoContext state update it triggers.
  const demoSlot = useMemo(() => (
    screenState === 'entry' ? (
      <>
        <DemoBtn label="✓ Put"  color="green" onClick={demoPut} />
        <DemoBtn label="✓ Move" color="blue"  onClick={demoMove} />
        <DemoBtn label="✗ PID"  color="red"   onClick={demoBadPid} />
      </>
    ) : (
      <>
        <DemoBtn label="✓ Location" color="green" onClick={demoConfirmOk} />
        <DemoBtn label="✗ Location" color="red"   onClick={demoConfirmBad} />
      </>
    )
  ), [screenState, demoPut, demoMove, demoBadPid, demoConfirmOk, demoConfirmBad]);

  useDemoSlot(demoSlot);

  // ── Render ───────────────────────────────────────────────────────────────────

  const locked = screenState === 'directed';

  return (
    <div className="absolute inset-0 flex select-none">
      {/* Left column */}
      <div className="flex-1 flex flex-col p-6 gap-4 overflow-hidden">
        {/* Aisle + overrides */}
        <div className="flex gap-4">
          <div className="w-[200px]">
            <FieldDisplay
              label="Aisle"
              value={aisleField.value}
              onFocus={focusAisleField}
              active={aisleField.isActive}
              locked={locked}
            />
          </div>
          {isIM && (
            <>
              <div className="w-[160px] flex flex-col gap-1">
                <FieldDisplay
                  label="Size"
                  value={sizeField.value}
                  onFocus={focusSizeField}
                  active={sizeField.isActive}
                  locked={locked}
                />
                <div className="flex gap-1">
                  {SIZES.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => selectSize(s)}
                      disabled={locked}
                      className="flex-1 h-[26px] rounded-[6px] border border-[#3A3A3A] font-ui text-[11px] font-medium text-[#9A9A9A] hover:border-[#555] hover:text-white disabled:opacity-40 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setSizeLocked(l => !l)}
                  disabled={locked}
                  className={`h-[26px] px-3 rounded-[6px] font-ui text-[12px] font-medium self-start transition-colors disabled:opacity-40 ${sizeLocked ? 'bg-[#003366] text-white' : 'border border-[#3A3A3A] text-[#666] hover:border-[#555] hover:text-[#9A9A9A]'}`}
                >
                  {sizeLocked ? 'Locked' : 'Lock'}
                </button>
              </div>
              <div className="w-[180px] flex flex-col gap-1">
                <FieldDisplay
                  label="Storage"
                  value={storageField.value}
                  onFocus={focusStorageField}
                  active={storageField.isActive}
                  locked={locked}
                />
                <button
                  type="button"
                  onClick={() => setStorageLocked(l => !l)}
                  disabled={locked}
                  className={`h-[26px] px-3 rounded-[6px] font-ui text-[12px] font-medium self-start transition-colors disabled:opacity-40 ${storageLocked ? 'bg-[#003366] text-white' : 'border border-[#3A3A3A] text-[#666] hover:border-[#555] hover:text-[#9A9A9A]'}`}
                >
                  {storageLocked ? 'Locked' : 'Lock'}
                </button>
              </div>
              <div className="w-[140px] flex flex-col gap-1">
                <FieldDisplay
                  label="Zone"
                  value={zoneField.value}
                  onFocus={focusZoneField}
                  active={zoneField.isActive}
                  locked={locked}
                />
                <button
                  type="button"
                  onClick={() => setZoneLocked(l => !l)}
                  disabled={locked}
                  className={`h-[26px] px-3 rounded-[6px] font-ui text-[12px] font-medium self-start transition-colors disabled:opacity-40 ${zoneLocked ? 'bg-[#003366] text-white' : 'border border-[#3A3A3A] text-[#666] hover:border-[#555] hover:text-[#9A9A9A]'}`}
                >
                  {zoneLocked ? 'Locked' : 'Lock'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Consolidating toggle (IM+ only) + directed-to readout */}
        {(isIM || (screenState === 'directed' && directed)) && (
          <div className="flex items-center gap-4">
            {isIM && (
              <button
                type="button"
                onClick={() => setConsolidating(c => !c)}
                disabled={locked}
                className={`h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium transition-colors disabled:opacity-40 ${consolidating ? 'bg-[#CC0000] text-white' : 'border border-[#3A3A3A] text-[#9A9A9A] hover:border-[#555]'}`}
              >
                Consolidating
              </button>
            )}
            {screenState === 'directed' && directed && (
              <span className="flex items-center gap-3">
                <span className="font-ui text-[20px] font-semibold text-[#FF1A1A] uppercase tracking-wider">
                  Put in
                </span>
                <LiveId
                  type="location"
                  id={directed.directedLocation}
                  className="!text-[32px] !font-bold !text-[#FF1A1A]"
                />
              </span>
            )}
          </div>
        )}

        {/* Pallet scan field */}
        <FieldDisplay
          label="Scan Pallet ID"
          value={palletField.value}
          onFocus={focusPalletField}
          active={palletField.isActive}
          disabled={!aisleField.value.trim()}
          locked={locked}
        />

        {/* Directed state — data + confirm */}
        {screenState === 'directed' && directed && (
          <>
            {/* Screen-locked banner */}
            <div className="flex items-center gap-3 px-4 py-2 rounded-[10px] bg-[#CC0000]/10 border border-[#CC0000]/30">
              <span className="font-ui text-[15px] font-semibold text-[#CC0000] flex-1">Screen locked — active reservation</span>
              <button
                type="button"
                onClick={() => setHoldOpen(true)}
                className="h-[32px] px-3 rounded-[8px] font-ui text-[13px] font-medium border border-[#3A3A3A] text-[#9A9A9A] hover:border-[#555] hover:text-white transition-colors"
              >
                Hold
              </button>
            </div>

            <div className="flex flex-col mt-1">
              <DataRow label="Item">{directed.pallet.descShort}</DataRow>
              <div className="flex items-center gap-2 py-2 border-b border-[#1A1A1A]">
                <span className="w-[180px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">
                  DPCI
                </span>
                <div className="font-data text-[22px] text-white flex-1">{directed.pallet.dpci}</div>
                <span className="font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">
                  Qty
                </span>
                <div className="font-data text-[22px] text-white">
                  {directed.pallet.quantity.pallets}P / {directed.pallet.quantity.cartons}C / {directed.pallet.quantity.ssps}S
                </div>
              </div>
              {directed.pallet.currentLocation && (
                <DataRow label="Move from">
                  <LiveId type="location" id={directed.pallet.currentLocation} />
                </DataRow>
              )}
            </div>

            <FieldDisplay
              label="Scan Location to Confirm"
              value={confirmField.value}
              onFocus={focusConfirmField}
              active={confirmField.isActive}
            />

            <div className="flex gap-3 mt-2">
              <ActionBtn label="Unassign"    variant="warning" onClick={handleUnassign} disabled={loading} />
              <ActionBtn label="Blocked Put" variant="danger"  onClick={() => setConfirmBlock(true)} disabled={loading} />
            </div>
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
                entry.outcome === 'PUT'      ? 'text-[#009900]' :
                entry.outcome === 'MOVE'     ? 'text-[#0066CC]' :
                entry.outcome === 'ASSIGNED' ? 'text-[#AA8800]' :
                entry.outcome === 'RELEASED' ? 'text-[#555555]' :
                                               'text-[#CC4400]'; // BLOCKED
              const displayLoc = entry.finalLocation ?? entry.directedLocation;
              return (
                <div key={entry.reservationId} className="px-5 py-3 border-b border-[#111] flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <LiveId type="pallet" id={String(entry.palletId)} />
                    <span className={`font-ui text-[12px] font-semibold ${outcomeColor}`}>
                      {entry.outcome}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <LiveId type="location" id={displayLoc} />
                    <span className="font-data text-[12px] text-[#555]">
                      {entry.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {confirmBlock && directed && (
        <ConfirmDialog
          title="Place Hold Both?"
          message={`This places a Hold Both on ${fmtLocation(directed.directedLocation)} and redirects you to the next available location.`}
          confirmLabel="Hold Both"
          variant="danger"
          onConfirm={() => { setConfirmBlock(false); handleBlock(); }}
          onCancel={() => setConfirmBlock(false)}
        />
      )}

      {holdOpen && directed && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
          <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-[20px] p-6 max-h-full overflow-y-auto">
            <HoldPanel locationId={directed.directedLocation} onDone={() => setHoldOpen(false)} showClose />
          </div>
        </div>
      )}
    </div>
  );
}
