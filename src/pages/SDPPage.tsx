import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { DemoPicker } from '../components/shared/DemoPicker';
import { LocationEntryFields } from '../components/shared/LocationEntryFields';
import { SizeField } from '../components/shared/SizeField';
import { StorageCodeField } from '../components/shared/StorageCodeField';
import { ZoneField } from '../components/shared/ZoneField';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { LiveId } from '../components/ui/LiveId';
import { useAuth } from '../context/AuthContext';
import { useDemoSlot } from '../context/FooterDemoContext';
import { useMessageBar } from '../context/MessageBarContext';
import { useNavLock } from '../context/NavLockContext';
import { useNumpad } from '../context/NumpadContext';
import { type SDPDirectedResult, useSDP } from '../context/SDPContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { fmtLocation } from '../lib/fmt';
import { INVALID_WASH } from '../lib/invalidWash';
import { SIZE_NAMES } from '../lib/sizes';
import { useAisleFreightTypes } from '../lib/useAisleFreightTypes';
import { useNumpadField } from '../lib/useNumpadField';
import { useStorageCodes } from '../lib/useStorageCodes';

// ── Types ────────────────────────────────────────────────────────────────────

/** Router state shape for pre-populating the Aisle field on entry (e.g. from SAR's row-select navigation). */
interface NavState {
  aisle?: number;
}

// DirectedResult's shape now lives in SDPContext.tsx (App-Wide screen-persistence,
// v1.7.0) as `SDPDirectedResult`, imported above rather than redeclared.

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
 * @param invalid - Applies the app-wide red-wash treatment (see `src/lib/invalidWash.ts`)
 *   instead of the plain active-only border — invalid wins over active/disabled/locked.
 */
function FieldDisplay({
  label,
  value,
  onFocus,
  active = false,
  disabled = false,
  locked = false,
  size = 'default',
  invalid = false,
}: {
  label: string;
  value: string;
  onFocus: () => void;
  active?: boolean;
  disabled?: boolean;
  locked?: boolean;
  /** 'large' bumps height/text size — used for SDP's Aisle field, now that it doesn't
   *  need to share space evenly with the (now dynamically-sized) override fields. */
  size?: 'default' | 'large';
  invalid?: boolean;
}) {
  const boxHeight = size === 'large' ? 'h-[88px]' : 'h-[72px]';
  const textSize  = size === 'large' ? 'text-[40px]' : 'text-[32px]';
  const barHeight = size === 'large' ? 'h-[46px]' : 'h-[38px]';
  return (
    <div className="flex flex-col gap-1">
      <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider">
        {label}
      </span>
      <button
        type="button"
        onClick={onFocus}
        disabled={disabled || locked}
        className={`flex items-center ${boxHeight} px-5 rounded-[12px] border-2 disabled:opacity-40 transition-colors ${
          invalid ? INVALID_WASH : active && !disabled && !locked ? 'border-[#CC0000] bg-[#0D0D0D]' : 'border-[#3A3A3A] bg-[#0D0D0D] hover:border-[#555]'
        }`}
      >
        <span className={`font-data ${textSize} font-medium text-white tracking-[0.04em]`}>
          {value || <span className="text-[#444]">—</span>}
        </span>
        {active && !disabled && !locked && (
          <span className={`inline-block w-[3px] ${barHeight} bg-[#CC0000] ml-2 animate-pulse rounded-sm`} />
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
  const { setMessage, clearMessage } = useMessageBar();
  const { deliverScan, isScanningRef } = useNumpad();
  const isIM = ['IM', 'LEAD', 'MANAGER', 'ADMIN'].includes(user?.role ?? '');
  const routerLocation = useLocation();
  const prefill = (routerLocation.state as NavState | null) ?? null;

  const [screenState, setScreenState] = useState<ScreenState>('entry');
  const [loading, setLoading] = useState(false);
  // Red-wash invalid state (App-Wide item 9, v1.7.0) — Pallet ID is the one field on this
  // screen whose bad value deliberately stays visible on failure (see handlePalletScan's
  // own comment); every one of its several failure codes (not-found, no-cartons, canceled,
  // pull-pending, no-eligible-locations) shares the same visible-value/refocus-Pallet-ID
  // treatment in that catch block, so one flag covers all of them. Aisle's own NOT_FOUND
  // failure clears the field atomically instead (see handleAisleConfirm), so it isn't washed
  // for the same reason PIP's PID/UPC/Location aren't.
  const [palletInvalid, setPalletInvalid] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [confirmBlock, setConfirmBlock] = useState(false);
  // Demo-only "which invalid pallet" picker (shared DemoPicker component) — see
  // pickInvalidPallet's comment.
  const [invalidPalletPickerOpen, setInvalidPalletPickerOpen] = useState(false);

  // Screen-locked: while a reservation is active, Back/Home/Jump/Logout are disabled
  // shell-wide so the worker must resolve (complete or unassign) before leaving.
  useNavLock(screenState === 'directed');

  // Entry-state field values.
  const [zoneOverride, setZoneOverride]     = useState<number | null>(null);
  const [sizeOverride, setSizeOverride]     = useState('');
  const [storageOverride, setStorageOverride] = useState('');
  const [consolidating, setConsolidating]   = useState(false);
  const [sizeLocked, setSizeLocked]         = useState(false);
  const [storageLocked, setStorageLocked]   = useState(false);
  const [zoneLocked, setZoneLocked]         = useState(false);

  // Directed state.
  // Session-level persistence (App-Wide screen-persistence item, v1.7.0) — see
  // SDPContext.tsx's own doc comment; mirrors LII/PII/ISI's identical pattern.
  const { directed, setDirected } = useSDP();

  // Refs to check from async callbacks.
  const screenStateRef = useRef(screenState);
  const loadingRef     = useRef(loading);
  const directedRef    = useRef(directed);
  screenStateRef.current = screenState;
  loadingRef.current     = loading;
  directedRef.current    = directed;

  // padOnSubmit: typing "5" and hitting OK is accepted as "005" (see LocationEntryFields).
  const aisleField    = useNumpadField('numpad', 3, true);
  const palletField   = useNumpadField();
  // Bumped to remount (and thereby clear + re-autofocus) the Confirm Location
  // LocationEntryFields panel — matches PIP's resetLocationField pattern; the component
  // has no imperative clear method of its own, only the external `value`/`''` prefill
  // prop, which this codebase's convention (see PIPPage.tsx) prefers a key-bump over for
  // a full reset since it also re-triggers the auto-focus effect for free.
  const [locationEntryKey, setLocationEntryKey] = useState(0);

  // Narrows the Storage Code/Size override dropdown-helpers (issue #80) to what's actually
  // present once an aisle is entered — Zone override never narrows (a straight 1-4
  // dropdown, per the issue) and Aisle/Bin/Pallet ID aren't candidates for this treatment
  // at all (too impractical as a list, per the issue's own scope note).
  const aisleNum = parseInt(aisleField.value, 10);
  const aisleTypes = useAisleFreightTypes(isNaN(aisleNum) ? null : aisleNum);
  const fullStorageCodes = useStorageCodes();
  const storageCodeOptions = aisleTypes && fullStorageCodes
    ? fullStorageCodes.filter((c) => aisleTypes.storageCodes.includes(c.code))
    : undefined;
  const sizeOptions = aisleTypes
    ? aisleTypes.sizesFor(storageOverride || undefined).map((s) => ({ code: s, desc: SIZE_NAMES[s] }))
    : undefined;

  // Pre-populate the Aisle field from router state (e.g. SAR's row-select navigation) on mount.
  useEffect(() => {
    if (prefill?.aisle != null) aisleField.set(String(prefill.aisle));
    // Field setters are stable across the lifetime of the hook — only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /** Storage Code override committed via the shared field's onChange — advances to Pallet ID, matching the old numpad-driven behavior. */
  const handleStorageOverrideChange = useCallback((v: string) => {
    setStorageOverride(v);
    setTimeout(() => focusPalletField(), 50);
  }, [focusPalletField]);

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

  // LocationEntryFields (the Confirm Location panel) auto-focuses itself on mount — no
  // manual focus-on-screenState effect needed the way the plain numpad fields above
  // require; it also naturally re-runs on every remount (see resetLocationField).

  // ── Polling (reservation timeout detection) ─────────────────────────────────

  /**
   * Starts a 15-second polling interval that proactively detects server-side reservation
   * expiry (the timer-triggered `clearExpiredReservations` Azure Function, which runs
   * every minute and clears anything older than 5 minutes) — rather than only surfacing
   * it reactively the next time the worker tries to confirm/unassign/block and gets a
   * NOT_FOUND back. Polls `GET /api/locations/{id}` for the directed location itself
   * (already-public, existing infrastructure — no dedicated reservation-status endpoint
   * needed) and treats a status other than `RESERVED` as expiry, since that's exactly
   * what the timer function resets it to on clearing a reservation. Reads the current
   * reservation from `directedRef` each tick rather than closing over the value passed
   * in, so it always checks whichever reservation is actually active if Blocked Put
   * re-directs to a new one without a stop/restart in between.
   */
  function startPolling(reservationId: number) {
    stopPolling();
    pollIntervalRef.current = setInterval(async () => {
      const d = directedRef.current;
      if (!d || d.reservationId !== reservationId) return;
      try {
        const loc = await apiFetch<{ status: string }>(`/api/locations/${d.directedLocation}`, token!);
        if (loc.status !== 'RESERVED') {
          stopPolling();
          playAlert('warning');
          setMessage({ type: 'warning', text: `Reservation expired — location ${d.directedLocation} released` });
          resetToEntry(true);
        }
      } catch {
        // A transient network hiccup shouldn't reset the screen — the next successful
        // poll (or the worker's own next action) will catch a real expiry.
      }
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

  /**
   * Submit handler for the Aisle field. A location-barcode scan (or anything longer than
   * 3 digits) is truncated to its leading 3 digits — the Aisle — rather than rejected,
   * since scanning a location placard instead of hand-typing the aisle number is a normal
   * path. Then validates the aisle actually exists (`GET /api/locations/empty-by-zone`,
   * the same endpoint already narrowing the Storage Code/Size dropdowns for this aisle —
   * reused here for a guaranteed-synchronous-with-this-confirm check rather than relying
   * on that reactive fetch's own timing) before moving focus to the Pallet ID field.
   */
  async function handleAisleConfirm(value: string) {
    const v = value.trim();
    if (!v) return;
    const truncated = v.slice(0, 3);
    if (truncated !== v) aisleField.set(truncated);

    const aisle = parseInt(truncated, 10);
    if (isNaN(aisle)) return;

    try {
      await apiFetch(`/api/locations/empty-by-zone?aisle=${aisle}`, token!);
      clearMessage();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'NOT_FOUND') {
        playAlert('error');
        aisleField.clear();
        aisleField.focus(handleAisleConfirm);
        setMessage({ type: 'error', text: `Aisle ${aisle} does not exist` });
        return;
      }
      // Any other failure (network hiccup, etc.) doesn't block the worker — the
      // downstream Directed Put call will surface its own error if the aisle turns out
      // to be unusable.
    }

    // Aisle confirmed — move focus to pallet field.
    setTimeout(() => focusPalletField(), 50);
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
    // Read synchronously, before any await below — isScanningRef.current is still true
    // here for a scan's trailing synthetic Enter (see NumpadContext's deliverScan), reset
    // shortly after this function's synchronous prefix returns control. Carried on the
    // Reservation to confirmPut's activity log entry — see puts.ts's directedPut docstring.
    const wasScanned = isScanningRef.current;

    setLoading(true);
    try {
      const aisle = parseInt(aisleValueRef.current.trim(), 10);
      if (isNaN(aisle)) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

      const palletId = parseInt(v, 10);
      if (isNaN(palletId)) throw Object.assign(new Error('PALLET_NOT_FOUND'), { status: 404 });

      const sizeVal    = sizeOverride;
      const storageVal = storageOverride;

      const result = await apiFetch<SDPDirectedResult>('/api/puts/directed', token!, {
        method: 'POST',
        body: JSON.stringify({
          aisle,
          palletId,
          ...(sizeVal    && { size: sizeVal }),
          ...(storageVal && { storageCode: storageVal }),
          ...(zoneOverride != null && { zone: zoneOverride }),
          consolidating: consolidatingRef.current,
          wasScanned,
        }),
      });

      setDirected(result);
      setScreenState('directed');
      setPalletInvalid(false);
      // Clears any stale error from a prior failed attempt (issue #95) — the
      // alreadyStored branch below immediately overwrites this with its own info/warning
      // message when it applies, so this is a no-op flicker in that case, not a conflict.
      clearMessage();
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
      // Value stays visible (not cleared) — the worker can adjust Aisle or a constraint
      // and just press OK again to resubmit the same Pallet ID, rather than having to
      // re-scan/re-type it. Re-focusing (not clearing) still arms a fresh start on the
      // next actual keystroke (see useNumpadField's freshFocusRef), so typing a genuinely
      // different PID still replaces rather than appends onto the stale value.
      focusPalletField();
      setPalletInvalid(true);
      if (code === 'PALLET_NOT_FOUND') {
        setMessage({ type: 'error', text: 'Pallet ID not found' });
      } else if (code === 'NO_CARTONS') {
        setMessage({ type: 'error', text: 'Invalid Pallet: No Cartons' });
      } else if (code === 'CANCELED') {
        setMessage({ type: 'error', text: 'Invalid Pallet: Canceled' });
      } else if (code === 'BLOCKED_BY_PENDING_PULL') {
        setMessage({ type: 'error', text: 'Invalid Pallet: Pull Pending' });
      } else if (code === 'NO_LOCATIONS') {
        setMessage({ type: 'error', text: `No eligible locations available in aisle ${aisleValueRef.current}` });
      } else {
        setMessage({ type: 'error', text: 'Put failed — please try again' });
      }
    } finally {
      setLoading(false);
    }
  }

  /** Clears the Confirm Location panel's three boxes via a full remount, which also
   *  re-triggers its own auto-focus effect — matches PIP's resetLocationField pattern. */
  function resetLocationField() {
    setLocationEntryKey((k) => k + 1);
  }

  /**
   * Submit handler for the Confirm Location panel (LocationEntryFields), called once a
   * full Aisle+Bin+Level value resolves — either scanned or hand-entered across all three
   * boxes; `wasScanned` comes directly from the panel's own structural scan-vs-typed
   * detection (see LocationEntryFields' docstring), not NumpadContext's isScanningRef.
   * Calls POST /api/puts/{id}/confirm with the resolved value — the backend already only
   * compares Aisle+Bin (see confirmPut's docstring), so the Level digits always along for
   * the ride here are harmless. On LOCATION_MISMATCH, clears and re-focuses for retry. On
   * NOT_FOUND, the reservation has expired — resets to entry with full field clear. On
   * success, updates the history entry outcome and shows a completion message.
   */
  async function handleLocationConfirm(value: string, wasScanned: boolean) {
    const v = value.trim();
    if (!v || loadingRef.current) return;
    const d = directedRef.current;
    if (!d) return;

    setLoading(true);
    try {
      const result = await apiFetch<{ location: string; wasMove: boolean; clearedLocation: string | null; wasStaged: boolean }>(
        `/api/puts/${d.reservationId}/confirm`,
        token!,
        { method: 'POST', body: JSON.stringify({ scannedLocation: v, wasScanned }) },
      );
      stopPolling();
      setHistory(h => h.map(e =>
        e.reservationId === d.reservationId
          ? { ...e, outcome: result.wasMove ? 'MOVE' as const : 'PUT' as const, finalLocation: result.location }
          : e
      ));
      const base = result.wasMove && result.clearedLocation
        ? `Move complete — ${fmtLocation(result.clearedLocation)} → ${fmtLocation(result.location)}`
        : `Put complete — ${fmtLocation(result.location)}`;
      // Landing on an already-STAGED location is the preferred/expected outcome (plain
      // success — 'info' is this app's established success/informational tone, see
      // audio.ts's own docstring); falling through to an EMPTY one is worth flagging with
      // the warning tone, though it keeps the message bar's blue Info color rather than
      // full amber Warning — per the SDP put hierarchy's rule 4.a, this isn't a problem
      // the worker needs to act on, just something worth a second look.
      if (result.wasStaged) {
        playAlert('info');
        setMessage({ type: 'success', text: base });
      } else {
        playAlert('warning');
        setMessage({ type: 'info', text: `${base} — location was not staged` });
      }
      resetToEntry();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      resetLocationField();
      // One tone per outcome, not 'error' unconditionally plus a second, different tone
      // layered on top for specific codes — the two used to play back-to-back on
      // NOT_FOUND, with 'error' (this app's loudest tone) drowning out the 'warning'
      // that actually matched what happened.
      if (code === 'LOCATION_MISMATCH') {
        playAlert('error');
        setMessage({ type: 'error', text: `Wrong location — directed to ${d.directedLocation}` });
      } else if (code === 'NOT_FOUND') {
        // Reservation expired.
        playAlert('warning');
        setMessage({ type: 'warning', text: `Reservation expired — location ${d.directedLocation} released` });
        stopPolling();
        resetToEntry(true);
      } else {
        playAlert('error');
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
      const result = await apiFetch<{ location: string; releasedStatus: 'STAGED' | 'EMPTY' }>(
        `/api/puts/${d.reservationId}/unassign`, token!, { method: 'POST' },
      );
      stopPolling();
      playAlert('info');
      setHistory(h => h.map(e =>
        e.reservationId === d.reservationId ? { ...e, outcome: 'RELEASED' as const } : e
      ));
      const releasedTag = result.releasedStatus === 'STAGED' ? 'Staged' : 'Empty';
      setMessage({ type: 'info', text: `Reservation cleared — ${d.directedLocation} released (${releasedTag})` });
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
      resetLocationField();
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
    setPalletInvalid(false);
    // No explicit clear for the Confirm Location panel — it's only ever rendered while
    // screenState === 'directed', so leaving that state unmounts it, which wipes its
    // internal state for free (see LocationEntryFields).
    if (full) {
      postResetFocusRef.current = 'aisle';
      aisleField.clear();
      setSizeOverride('');
      setStorageOverride('');
      setZoneOverride(null);
    } else {
      postResetFocusRef.current = 'pallet';
      if (!sizeLocked)    setSizeOverride('');
      if (!storageLocked) setStorageOverride('');
      if (!zoneLocked)    setZoneOverride(null);
    }
  }

  // ── Demo buttons ────────────────────────────────────────────────────────────

  /**
   * Fetches a real unlocated pallet id and delivers it as a simulated Pallet ID scan.
   * Constrained to the currently-entered Aisle's Storage Code (reads aisleValueRef, not
   * aisleField.value directly, to avoid a stale closure the same way handlePalletScan
   * does) — without this, a random pallet's Storage Code frequently wouldn't match the
   * aisle already typed in, correctly but unhelpfully failing the resulting demo put with
   * NO_LOCATIONS now that Directed Put enforces Storage Code matching. A no-op filter
   * (server-side) if the Aisle field is still empty.
   *
   * Also excludes any entered Size/Storage Code override from the pick — otherwise the
   * demo pallet frequently already naturally matches the override, so directing it doesn't
   * visibly demonstrate the override actually changing anything (direct instruction).
   */
  const demoPut = useCallback(async () => {
    try {
      const params = new URLSearchParams({ status: 'unlocated', aisle: aisleValueRef.current });
      if (storageOverride) params.set('excludeStorageCode', storageOverride);
      const { palletId } = await apiFetch<{ palletId: number }>(`/api/demo/pallet?${params.toString()}`, token!);
      deliverScan(String(palletId));
    } catch (err) {
      setMessage({ type: 'error', text: `Demo put: ${err instanceof Error ? err.message : 'unavailable'}` });
    }
  }, [token, deliverScan, setMessage, storageOverride]);

  /** Fetches a real already-stored pallet id and delivers it as a simulated Pallet ID scan, simulating a move. Aisle-constrained and override-excluded — see demoPut's comment (Size applies here too, unlike demoPut, since a stored pallet already has its own). */
  const demoMove = useCallback(async () => {
    try {
      const params = new URLSearchParams({ status: 'stored', aisle: aisleValueRef.current });
      if (storageOverride) params.set('excludeStorageCode', storageOverride);
      if (sizeOverride) params.set('excludeSize', sizeOverride);
      const { palletId } = await apiFetch<{ palletId: number }>(`/api/demo/pallet?${params.toString()}`, token!);
      deliverScan(String(palletId));
    } catch (err) {
      setMessage({ type: 'error', text: `Demo move: ${err instanceof Error ? err.message : 'unavailable'}` });
    }
  }, [token, deliverScan, setMessage, storageOverride, sizeOverride]);

  /**
   * Dispatches the shared DemoPicker's choice — consolidates what used to be one
   * "✗ PID" button (not-found only) behind one "⚠ Invalid Pallet" footer button plus
   * this popup, adding three previously-unreachable checkPalletEligibility paths a worker
   * can't otherwise produce by scanning normally: "Pulled" (NO_CARTONS — a fully-pulled
   * pallet has zero cartons left, same case as before, relabeled to match how a worker
   * actually thinks of it), "Canceled" (a voided/canceled receiving record), and
   * "Pull Pending" (an open, non-terminal Label already committed against the pallet).
   * Not-found must be numeric — a non-numeric value fails the API's parseInt check
   * (INVALID_INPUT, 400) before ever reaching the not-found lookup (PALLET_NOT_FOUND,
   * 404). Same bug/fix as MNP's demoBadPid (see CHANGELOG.md's Legacy findings).
   */
  const pickInvalidPallet = useCallback(async (kind: 'notFound' | 'pulled' | 'canceled' | 'pullPending') => {
    setInvalidPalletPickerOpen(false);
    if (kind === 'notFound') {
      deliverScan('999999999');
      return;
    }
    const status = { pulled: 'no-cartons', canceled: 'canceled', pullPending: 'pull-pending' }[kind];
    try {
      const { palletId } = await apiFetch<{ palletId: number }>(`/api/demo/pallet?status=${status}`, token!);
      deliverScan(String(palletId));
    } catch (err) {
      setMessage({ type: 'error', text: `Demo pallet: ${err instanceof Error ? err.message : 'unavailable'}` });
    }
  }, [token, deliverScan, setMessage]);

  /** Delivers the currently directed location, simulating a correct confirm scan. */
  const demoConfirmOk = useCallback(() => {
    if (directedRef.current) deliverScan(directedRef.current.directedLocation);
  }, []);

  /**
   * Delivers a location that won't match the directed location, simulating a mismatch.
   * Must be exactly 8 digits — Confirm Location is the 3-box LocationEntryFields panel
   * (since 1.17), which only ever recognizes an exact 3-digit value (one box, mid-entry)
   * or an exact 8-digit value (a full-barcode override, resolving immediately regardless
   * of focus) as meaningful; a 6-digit value (this button's value before the 3-box
   * rebuild, when Confirm Location was a single plain field accepting a bare Aisle+Bin
   * string directly) matches neither and is silently dropped by whichever box currently
   * has focus — the same class of bug 1.14's fix to the "✗ Location" demo button on PIP
   * already found and fixed there, just not carried over here at the time.
   */
  const demoConfirmBad = useCallback(() => deliverScan('99999999'), [deliverScan]);

  // Memoized so the JSX reference is stable across renders that don't change screen
  // state — useDemoSlot's re-sync effect keys off this reference, and an unmemoized
  // JSX literal would recreate it (and re-fire the effect) on every render, looping
  // forever via the FooterDemoContext state update it triggers.
  const demoSlot = useMemo(() => (
    screenState === 'entry' ? (
      <>
        <DemoBtn label="✓ Put"  color="green" onClick={demoPut} />
        <DemoBtn label="✓ Move" color="blue"  onClick={demoMove} />
        <DemoBtn label="⚠ Invalid Pallet" color="amber" onClick={() => setInvalidPalletPickerOpen(true)} />
      </>
    ) : (
      <>
        <DemoBtn label="✓ Location" color="green" onClick={demoConfirmOk} />
        <DemoBtn label="✗ Location" color="red"   onClick={demoConfirmBad} />
      </>
    )
  ), [screenState, demoPut, demoMove, demoConfirmOk, demoConfirmBad]);

  useDemoSlot(demoSlot);

  // ── Render ───────────────────────────────────────────────────────────────────

  const locked = screenState === 'directed';

  return (
    <div className="absolute inset-0 flex select-none">
      {/* Left column */}
      <div className="flex-1 flex flex-col p-6 gap-4 overflow-hidden">
        {/* Aisle + overrides. Aisle sits in its own fixed-width "island" (gap-10 below,
            wider than the row's usual gap-4) since it no longer needs to share space
            evenly with Size/Storage/Zone — those now stretch (flex-1 each, via width="w-full")
            to dynamically fill whatever's left up to the Put History sidebar. */}
        <div className="flex gap-10">
          <div className="w-[280px] shrink-0">
            <FieldDisplay
              label="Aisle"
              value={aisleField.value}
              onFocus={focusAisleField}
              active={aisleField.isActive}
              locked={locked}
              size="large"
            />
          </div>
          {/* Size is the one override every authenticated role can use (product decision);
              Storage Code/Zone stay IM+ only. Worker gets no lock button on Size — locking
              is an IM+ convenience for persisting an override across multiple puts, and a
              Worker's Size override is deliberately one-off (see resetToEntry: it always
              clears unless sizeLocked, which only IM+ can ever set true). Worker's Size
              choice also never appears in the "Applying Constraints" bubbles below, which
              stay IM+-gated entirely — a Worker doesn't need it echoed back at them. */}
          <div className="flex-1 flex gap-4 min-w-0">
            <div className="flex-1 max-w-[220px] flex flex-col gap-1 min-w-0">
              <SizeField value={sizeOverride} onChange={setSizeOverride} options={sizeOptions} width="w-full" disabled={locked} />
              {isIM && (
                <button
                  type="button"
                  onClick={() => setSizeLocked(l => !l)}
                  disabled={locked}
                  aria-label={sizeLocked ? 'Unlock Size' : 'Lock Size'}
                  className={`h-[52px] px-6 rounded-[10px] font-ui text-[24px] font-medium self-center transition-colors disabled:opacity-40 ${sizeLocked ? 'bg-[#CC0000] text-white' : 'border border-[#3A3A3A] text-[#666] hover:border-[#555] hover:text-[#9A9A9A]'}`}
                >
                  {sizeLocked ? '🔒' : '🔓'}
                </button>
              )}
            </div>
            {isIM && (
              <>
                <div className="flex-1 flex flex-col gap-1 min-w-0">
                  <StorageCodeField value={storageOverride} onChange={handleStorageOverrideChange} options={storageCodeOptions} label="Storage" width="w-full" disabled={locked} />
                  <button
                    type="button"
                    onClick={() => setStorageLocked(l => !l)}
                    disabled={locked}
                    aria-label={storageLocked ? 'Unlock Storage' : 'Lock Storage'}
                    className={`h-[52px] px-6 rounded-[10px] font-ui text-[24px] font-medium self-center transition-colors disabled:opacity-40 ${storageLocked ? 'bg-[#CC0000] text-white' : 'border border-[#3A3A3A] text-[#666] hover:border-[#555] hover:text-[#9A9A9A]'}`}
                  >
                    {storageLocked ? '🔒' : '🔓'}
                  </button>
                </div>
                <div className="flex-1 flex flex-col gap-1 min-w-0">
                  <ZoneField value={zoneOverride} onChange={setZoneOverride} width="w-full" disabled={locked} />
                  <button
                    type="button"
                    onClick={() => setZoneLocked(l => !l)}
                    disabled={locked}
                    aria-label={zoneLocked ? 'Unlock Zone' : 'Lock Zone'}
                    className={`h-[52px] px-6 rounded-[10px] font-ui text-[24px] font-medium self-center transition-colors disabled:opacity-40 ${zoneLocked ? 'bg-[#CC0000] text-white' : 'border border-[#3A3A3A] text-[#666] hover:border-[#555] hover:text-[#9A9A9A]'}`}
                  >
                    {zoneLocked ? '🔒' : '🔓'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Consolidating toggle (IM+ only) + Applying-overrides badge / directed-to readout.
            issue #64: the Applying summary used to be its own paragraph above this row,
            shifting the whole layout when it appeared/disappeared/got replaced by "Put in."
            Now it lives in this same row, next to Consolidating, and is mutually exclusive
            with "Put in" (screenState !== 'directed' vs. === 'directed') — the slot's
            *content* changes but nothing outside this row ever moves. */}
        {(isIM || (screenState === 'directed' && directed)) && (
          <div className="flex items-center gap-4">
            {isIM && (
              <button
                type="button"
                onClick={() => setConsolidating(c => !c)}
                disabled={locked}
                className={`h-[57px] px-6 rounded-[10px] font-ui text-[22px] font-medium transition-colors disabled:opacity-40 ${consolidating ? 'bg-[#5B9BD5] text-white' : 'border border-[#3A3A3A] text-[#9A9A9A] hover:border-[#555]'}`}
              >
                Consolidating
              </button>
            )}
            {/* Applying-overrides bubbles (issue #50) — every selected override is combined
                with AND when the system searches for a location, but nothing on screen
                confirmed that plainly, which read as "it only applies one." One bubble per
                constraint plus a leading "Applying Constraints" bubble, each independently
                clickable to clear (the leading one clears all at once) — split out from a
                single "Applying: Size M + Storage CR" summary bubble so a worker can drop
                just one constraint without retyping the others. Sized to match Consolidating,
                except the leading bubble: its label wraps to two smaller lines instead of one
                large one, so it can be narrower — with all three constraint bubbles possibly
                showing at once, keeping the leading bubble compact is what keeps the whole
                row fitting on screen without wrapping. */}
            {isIM && screenState !== 'directed' && (sizeOverride || storageOverride || zoneOverride != null) && (
              <>
                <button
                  type="button"
                  onClick={() => { setSizeOverride(''); setStorageOverride(''); setZoneOverride(null); }}
                  className="h-[57px] px-4 rounded-[10px] font-ui text-[13px] font-medium leading-tight border border-[#3A3A3A] text-[#9A9A9A] hover:border-[#555] transition-colors flex flex-col items-center justify-center"
                >
                  <span>Applying</span>
                  <span>Constraints</span>
                </button>
                {sizeOverride && (
                  <button
                    type="button"
                    onClick={() => setSizeOverride('')}
                    className="h-[57px] px-6 rounded-[10px] font-ui text-[22px] font-medium border border-[#3A3A3A] text-[#9A9A9A] hover:border-[#555] transition-colors"
                  >
                    Size {sizeOverride}
                  </button>
                )}
                {storageOverride && (
                  <button
                    type="button"
                    onClick={() => setStorageOverride('')}
                    className="h-[57px] px-6 rounded-[10px] font-ui text-[22px] font-medium border border-[#3A3A3A] text-[#9A9A9A] hover:border-[#555] transition-colors"
                  >
                    Storage {storageOverride}
                  </button>
                )}
                {zoneOverride != null && (
                  <button
                    type="button"
                    onClick={() => setZoneOverride(null)}
                    className="h-[57px] px-6 rounded-[10px] font-ui text-[22px] font-medium border border-[#3A3A3A] text-[#9A9A9A] hover:border-[#555] transition-colors"
                  >
                    Zone {zoneOverride}
                  </button>
                )}
              </>
            )}
            {screenState === 'directed' && directed && (
              <span className="flex items-center gap-3 px-4 py-1.5 rounded-[10px] bg-[#CC0000]/10 border-2 border-[#CC0000]/40">
                <span className="font-ui text-[20px] font-semibold text-[#FF1A1A] uppercase tracking-wider">
                  Put in
                </span>
                <LiveId
                  type="location"
                  id={directed.directedLocation}
                  className="!text-[64px] !font-bold !text-[#FF1A1A]"
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
          invalid={palletInvalid}
        />

        {/* Directed state — data + confirm */}
        {screenState === 'directed' && directed && (
          <>
            {/* Screen-locked banner */}
            <div className="flex items-center gap-3 px-4 py-2 rounded-[10px] bg-[#CC0000]/10 border border-[#CC0000]/30">
              <span className="font-ui text-[15px] font-semibold text-[#CC0000] flex-1">Screen locked — active reservation</span>
            </div>

            <div className="flex flex-col mt-1">
              <DataRow label="Item">{directed.pallet.descShort}</DataRow>
              <div className="flex items-center gap-2 py-2 border-b border-[#1A1A1A]">
                <span className="w-[180px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">
                  DPCI
                </span>
                <div className="flex-1"><LiveId type="dpci" id={directed.pallet.dpci} className="!text-[22px]" /></div>
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

            {/* Unassign/Blocked Put moved beside Confirm Location (rather than below it)
                so the panel has room to run "large" — items-end bottom-aligns the button
                row (no label above it) with the boxes' own bottom edge (label above them). */}
            <div className="flex items-end gap-4">
              <div className="flex flex-col gap-1">
                <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Confirm Location</span>
                <LocationEntryFields key={locationEntryKey} onResolved={handleLocationConfirm} size="large" />
              </div>
              <div className="flex gap-3">
                <ActionBtn label="Unassign"    variant="warning" onClick={handleUnassign} disabled={loading} />
                <ActionBtn label="Blocked Put" variant="danger"  onClick={() => setConfirmBlock(true)} disabled={loading} />
              </div>
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

      {invalidPalletPickerOpen && (
        <DemoPicker
          title="Simulate which invalid pallet?"
          options={[
            { key: 'notFound',    label: 'Pallet ID Not Found' },
            { key: 'pulled',      label: 'Pulled' },
            { key: 'canceled',    label: 'Canceled' },
            { key: 'pullPending', label: 'Pull Pending' },
          ]}
          onPick={pickInvalidPallet}
          onCancel={() => setInvalidPalletPickerOpen(false)}
        />
      )}
    </div>
  );
}
