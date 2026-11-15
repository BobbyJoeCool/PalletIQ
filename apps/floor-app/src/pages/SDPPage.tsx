import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { NumpadFieldBox } from '../components/shared/NumpadFieldBox';
import { type CodePickerFieldHandle } from '../components/shared/CodePickerField';
import { PalletIdField, type PalletIdFieldHandle } from '../components/shared/PalletIdField';
import { SessionHistoryPanel } from '../components/shared/SessionHistoryPanel';
import { SizeField } from '../components/shared/SizeField';
import { StorageCodeField } from '../components/shared/StorageCodeField';
import { ZoneCodeBadge } from '../components/shared/ZoneCodeBadge';
import { ZoneField } from '../components/shared/ZoneField';
import { LiveId } from '../components/ui/LiveId';
import { useAuth } from '../context/AuthContext';
import { useDemoSlot } from '../context/FooterDemoContext';
import { useMessageBar } from '../context/MessageBarContext';
import { useNavLock } from '../context/NavLockContext';
import { useNumpad } from '../context/NumpadContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { fmtLocation } from '../lib/fmt';
import { type AisleBreakdownEntry, useAisleField } from '../lib/useAisleField';
import { groupBreakdownByStorageCode } from '../lib/zoneSummary';
import { SDPVerifyPutModal } from './SDPVerifyPutModal';
import { createHttpPutsClient, type ConsolidationCandidate } from '../lib/putsClient';
import { usePutSession } from '../lib/usePutSession';

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
  outcome: 'ASSIGNED' | 'PUT' | 'MOVE' | 'RELEASED' | 'HELD';
  finalLocation?: string;
  timestamp: Date;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  return (
    <NumpadFieldBox
      label={label}
      value={value}
      onFocus={onFocus}
      active={active}
      disabled={disabled || locked}
      invalid={invalid}
      boxClass={size === 'large' ? 'h-[88px] px-5 rounded-[12px]' : 'h-[72px] px-5 rounded-[12px]'}
      valueClass={size === 'large' ? 'text-[40px] font-medium tracking-[0.04em]' : 'text-[32px] font-medium tracking-[0.04em]'}
      caretClass={size === 'large' ? 'w-[3px] h-[46px]' : 'w-[3px] h-[38px]'}
    />
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
 * directed: `SDPVerifyPutModal` (GitHub #151) opens as a screen-blocking popup — Rack body
 *   for everything but XS locations, Hand body (Carton Quantity beside Location, "Exists
 *   elsewhere" redirect) for XS. Worker scans the directed location to confirm
 *   (POST /api/puts/{id}/confirm). The put session (`lib/usePutSession.ts`, #215) owns
 *   every puts call and rule; this page only maps its outcomes to tones/messages/history:
 *   - Exists Elsewhere (Hand Put): redirects the put to a same-DPCI occupied XS location;
 *     the reservation stays live, and confirm completes it server-side as a consolidation.
 *   - Unassign: releases the reservation (also while redirected), returns to entry.
 *   - Hold Location: Hold Both on the reserved location — the hold clears the reservation
 *     server-side. Stops once placed, no auto-continue.
 *   Reservation expiry (server-side 5-min timer) is detected when any action returns NOT_FOUND.
 *
 * A right-column history log tracks all reservation outcomes (ASSIGNED/PUT/MOVE/RELEASED/HELD).
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
  const [palletIdValue, setPalletIdValue] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);

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
  // The put session (#215) owns the put-verify flow and every puts call; this page maps
  // its outcomes onto tones, messages and history.
  const putsClient = useMemo(() => createHttpPutsClient(token!), [token]);
  const session = usePutSession(putsClient);
  const directed = session.view;
  // Latest session for the reservation-expiry poll's interval callback.
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; });

  // Refs to check from async callbacks.
  const screenStateRef = useRef(screenState);
  const loadingRef     = useRef(loading);
  const directedRef    = useRef(directed);
  screenStateRef.current = screenState;
  loadingRef.current     = loading;
  directedRef.current    = directed;

  const palletFieldRef = useRef<PalletIdFieldHandle>(null);
  const sizeFieldRef = useRef<CodePickerFieldHandle>(null);
  const storageFieldRef = useRef<CodePickerFieldHandle>(null);
  const zoneFieldRef = useRef<CodePickerFieldHandle>(null);
  // Aisle entry field (issue #161) — existence check now owned internally (previously
  // this screen's own `handleAisleConfirm`, reusing `GET /api/locations/empty-by-zone`
  // purely for its NOT_FOUND side effect, discarding the actual zone-map payload; switched
  // to the purpose-built `aisle-exists` endpoint, confirmed to check the identical
  // condition server-side — see useAisleField's own doc). On success, advances to Pallet
  // ID; on failure, clears and re-focuses for retry (this screen's own pre-existing
  // behavior — Aisle is never washed here, matching PIP/PID's "clear rather than wash"
  // convention, see the comment further down at handlePalletScan's own error path).
  const aisleFields = useAisleField({
    fetch: useCallback((aisle) => apiFetch<{ exists: boolean; breakdown: AisleBreakdownEntry[] }>(`/api/locations/aisle-exists?aisle=${aisle}`, token!), [token]),
    onResolved: useCallback(() => {
      clearMessage();
      setTimeout(() => palletFieldRef.current?.focus(), 50);
    }, [clearMessage]),
    onNotFound: useCallback((aisle) => {
      playAlert('error');
      aisleFields.focusField();
      setMessage({ type: 'error', text: `Aisle ${aisle} does not exist` });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setMessage]),
  });
  // Bumped to remount (and thereby clear + re-autofocus) the Confirm Location
  // LocationEntryFields panel — matches PIP's resetLocationField pattern; the component
  // has no imperative clear method of its own, only the external `value`/`''` prefill
  // prop, which this codebase's convention (see PIPPage.tsx) prefers a key-bump over for
  // a full reset since it also re-triggers the auto-focus effect for free.
  const [locationEntryKey, setLocationEntryKey] = useState(0);
  // Mirrors LocationEntryFields' own aggregate active state (#85) — its auto-focus effect
  // registers a key handler 50ms after mount, same delay every other field here uses. The
  // "✓ Location"/"✗ Location" demo buttons used to render as soon as screenState left
  // 'entry', so a fast tap (or an automated test) could fire deliverScan before that
  // handler existed, silently dropping the value instead of landing in Confirm Location —
  // gating the buttons on this (matching PIP's identical `locationActive`/`onActiveChange`
  // fix for the same race) closes the window instead of racing it.
  const [locationActive, setLocationActive] = useState(false);

  // StorageCodeField/SizeField now own their own aisle-narrowing internally (Feature 10)
  // — passing `aisle` below is all that's needed. Zone override never narrows (a straight
  // 1-4 dropdown, per issue #80) and Aisle/Bin/Pallet ID aren't candidates for this
  // treatment at all (too impractical as a list, per the issue's own scope note).
  const aisleNum = parseInt(aisleFields.field.value, 10);
  const overrideAisle = isNaN(aisleNum) ? null : aisleNum;

  // Pre-populate the Aisle field from router state (e.g. SAR's row-select navigation) on mount.
  useEffect(() => {
    if (prefill?.aisle != null) aisleFields.field.set(String(prefill.aisle));
    // Field setters are stable across the lifetime of the hook — only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // handlePalletScan can run from a closure captured well before the aisle was typed —
  // the aisle-confirm → focusPalletField chain registers it once, immediately after the
  // aisle field is first focused (empty), and that registration is never refreshed by
  // typing. Reading aisleFields.field.value directly there would silently see "" forever,
  // so every pallet scan resulting from the normal aisle-then-scan flow needs this ref instead.
  const aisleValueRef = useRef(aisleFields.field.value);
  aisleValueRef.current = aisleFields.field.value;

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

  /** (Re-)focuses the Pallet ID field for another attempt — e.g. after a failed scan. */
  const focusPalletField = useCallback(() => {
    palletFieldRef.current?.focus();
  }, []);


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
        else aisleFields.focusField();
      }, 50);
      return () => clearTimeout(id);
    }
  }, [screenState]); // eslint-disable-line react-hooks/exhaustive-deps

  // LocationEntryFields (the Confirm Location panel) auto-focuses itself on mount — no
  // manual focus-on-screenState effect needed the way the plain numpad fields above
  // require; it also naturally re-runs on every remount (see resetLocationField).

  // ── Polling (reservation timeout detection) ─────────────────────────────────

  /**
   * Polls for server-side reservation expiry (the timer-triggered
   * `clearExpiredReservations` Azure Function clears reservations past their
   * statusExpiry) — rather than only surfacing it reactively the next time
   * the worker tries to confirm/unassign/block and gets a NOT_FOUND back.
   * Interval matches the reservation's own lifetime: 5 minutes for a normal
   * put, 15 minutes for a consolidation. Polls `GET /api/locations/{id}` and
   * treats a status other than `RESERVED` as expiry. Reads the current
   * reservation from `directedRef` each tick rather than closing over the
   * value passed in.
   */
  function startPolling(reservationId: number, isConsolidating: boolean) {
    stopPolling();
    const interval = isConsolidating ? 15 * 60_000 : 5 * 60_000;
    pollIntervalRef.current = setInterval(async () => {
      const d = directedRef.current;
      if (!d || d.reservationId !== reservationId) return;
      try {
        // Watches the *reserved* location — a redirect target is STORED by design.
        if (await sessionRef.current.isExpired()) {
          stopPolling();
          playAlert('warning');
          setMessage({ type: 'warning', text: `Reservation expired — location ${d.reservedLocation} released` });
          resetToEntry(true);
        }
      } catch {
        // A transient network hiccup shouldn't reset the screen — the next successful
        // poll (or the worker's own next action) will catch a real expiry.
      }
    }, interval);
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
   * Submit handler for the Pallet ID field. Calls POST /api/puts/directed with the aisle,
   * pallet ID, and any IM+ overrides. On success, sets directed state and transitions to
   * the directed screen state. Shows a warning if the pallet is already stored (move scenario).
   */
  async function handlePalletScan(value: string) {
    const v = value.trim();
    setPalletIdValue(v);
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

      const outcome = await session.direct({
        aisle,
        palletId,
        ...(sizeOverride    && { size: sizeOverride }),
        ...(storageOverride && { storageCode: storageOverride }),
        ...(zoneOverride != null && { zone: zoneOverride }),
        consolidating: consolidatingRef.current,
        wasScanned,
      });
      if (outcome.kind === 'error') throw new Error(outcome.code);
      const result = outcome.view;

      setScreenState('directed');
      setPalletInvalid(false);
      // Clears any stale error from a prior failed attempt (issue #95) — the
      // alreadyStored branch below immediately overwrites this with its own info/warning
      // message when it applies, so this is a no-op flicker in that case, not a conflict.
      clearMessage();
      startPolling(result.reservationId, consolidatingRef.current);
      setHistory(h => [{
        reservationId: result.reservationId,
        palletId: result.pallet.id,
        directedLocation: result.reservedLocation,
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
      } else if (code === 'MISSING_SIZE') {
        // A pallet is expected to always carry a real Size by the time it reaches here
        // (mandatory at creation) — reaching this means the pallet's own data is broken,
        // not that the aisle lacks space. Recoverable by any role via the Size override.
        setMessage({ type: 'error', text: 'This pallet has no Size set — enter a Size override to continue' });
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

  /** Success handling for a completed (non-consolidating) put — tags the history row,
   *  plays the tone, sets the message, and resets to entry. */
  function applyConfirmSuccess(
    reservationId: number,
    result: { location: string; wasMove: boolean; clearedLocation: string | null; wasStaged: boolean },
  ) {
    stopPolling();
    setHistory(h => h.map(e =>
      e.reservationId === reservationId
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
  }

  /**
   * Completes the put once the worker confirms the directed location (#215): the put
   * session sends the scan to `confirmPut` (with the redirect target when Exists Elsewhere
   * redirected it — the server checks the match, the candidate rule and the resolution).
   * This handler only maps the outcome onto tone/message/history.
   */
  async function handleLocationConfirm(value: string, wasScanned: boolean) {
    const v = value.trim();
    if (!v || loadingRef.current) return;
    const d = directedRef.current;
    if (!d) return;

    setLoading(true);
    try {
      const outcome = await session.confirm(v, wasScanned);
      switch (outcome.kind) {
        case 'put':
          applyConfirmSuccess(d.reservationId, outcome);
          break;
        case 'consolidated':
          stopPolling();
          playAlert('info');
          setMessage({ type: 'success', text: `Redirected — consolidated into ${fmtLocation(outcome.location)}` });
          setHistory(h => h.map(e =>
            e.reservationId === d.reservationId
              ? { ...e, outcome: outcome.wasMove ? 'MOVE' as const : 'PUT' as const, finalLocation: outcome.location }
              : e
          ));
          resetToEntry();
          break;
        case 'mismatch':
          resetLocationField();
          playAlert('error');
          setMessage({ type: 'error', text: `Wrong location — directed to ${outcome.directedLocation}` });
          break;
        case 'notCandidate':
          resetLocationField();
          playAlert('error');
          setMessage({ type: 'error', text: `${fmtLocation(outcome.directedLocation)} can no longer take this pallet — pick another location` });
          break;
        case 'expired':
          resetLocationField();
          playAlert('warning');
          setMessage({ type: 'warning', text: `Reservation expired — location ${outcome.reservedLocation} released` });
          stopPolling();
          resetToEntry(true);
          break;
        default:
          resetLocationField();
          playAlert('error');
          setMessage({ type: 'error', text: 'Confirm failed — please try again' });
      }
    } finally {
      setLoading(false);
    }
  }

  /**
   * Escape hatch: releases the reservation without placing the pallet (also while
   * redirected — the reservation stays live through a redirect since #215). Returns to
   * entry; non-locked overrides clear so the next put starts fresh.
   */
  async function handleUnassign() {
    const d = directedRef.current;
    if (!d || loadingRef.current) return;
    setLoading(true);
    try {
      const outcome = await session.unassign();
      if (outcome.kind === 'released') {
        stopPolling();
        playAlert('info');
        setHistory(h => h.map(e => e.reservationId === d.reservationId ? { ...e, outcome: 'RELEASED' as const } : e));
        const releasedTag = outcome.releasedStatus === 'STAGED' ? 'Staged' : 'Empty';
        setMessage({ type: 'info', text: `Reservation cleared — ${outcome.reservedLocation} released (${releasedTag})` });
        resetToEntry();
      } else if (outcome.kind === 'expired') {
        playAlert('warning');
        setMessage({ type: 'warning', text: `Reservation expired — location ${outcome.reservedLocation} released` });
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
   * Hold Location — the session places Hold Both on the reserved location (the hold clears
   * the reservation server-side). Stops here; no auto-continue to a new location.
   * @returns true when the hold landed (the modal closes its dialog)
   */
  async function handleHold(reasonCode: string): Promise<boolean> {
    const d = directedRef.current;
    const outcome = await session.hold(reasonCode);
    if (outcome.kind === 'error') {
      playAlert('error');
      setMessage({ type: 'error', text: outcome.code === 'FORBIDDEN' ? 'You do not have permission to place Hold Both holds' : 'Hold placement failed — please try again' });
      return false;
    }
    playAlert('info');
    setMessage({ type: 'success', text: `Hold Both placed on ${fmtLocation(outcome.location)}` });
    stopPolling();
    if (d) setHistory(h => h.map(e => e.reservationId === d.reservationId ? { ...e, outcome: 'HELD' as const } : e));
    resetToEntry();
    return true;
  }

  /** Exists Elsewhere pick — points the put at the candidate; the worker still confirms it. */
  function handleRedirect(candidate: ConsolidationCandidate) {
    session.redirect({ locationId: candidate.locationId, storageCode: candidate.storageCode });
    setLocationEntryKey(k => k + 1);
    playAlert('info');
    setMessage({ type: 'info', text: `Redirected to ${fmtLocation(candidate.locationId)} — confirm the new location to complete` });
  }

  /** Return to the reserved location after a redirect. */
  function handleReturnToReserved() {
    session.returnToReserved();
    setLocationEntryKey(k => k + 1);
  }

  /**
   * Resets back to the entry state after a put, unassign, or block-with-no-locations.
   * `full=false` (normal put/unassign): clears only pallet and confirm fields; locked overrides
   *   are preserved; focus returns to the pallet field for the next pallet scan.
   * `full=true` (reservation expiry or no-locations): clears all fields including aisle and
   *   overrides; focus returns to the aisle field.
   */
  function resetToEntry(full = false) {
    session.reset();
    setScreenState('entry');
    setPalletIdValue('');
    setPalletInvalid(false);
    // No explicit clear for the Confirm Location panel — it's only ever rendered while
    // screenState === 'directed', so leaving that state unmounts it, which wipes its
    // internal state for free (see LocationEntryFields).
    if (full) {
      postResetFocusRef.current = 'aisle';
      aisleFields.clear();
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
  // Pallet ID's own demo buttons are no longer built here — PalletIdField's `demoScanner`
  // prop below owns that registration internally now (Feature 9, Phase 1). This slot only
  // covers Location Confirm, which stays screen-owned (Location ID's own Demo Scanner phase
  // hasn't happened yet).
  const demoSlot = useMemo(() => (
    locationActive ? (
      <>
        <DemoBtn label="✓ Location" color="green" onClick={demoConfirmOk} />
        <DemoBtn label="✗ Location" color="red"   onClick={demoConfirmBad} />
      </>
    ) : null
  ), [locationActive, demoConfirmOk, demoConfirmBad]);

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
          <div className="w-[280px] shrink-0 flex flex-col gap-2">
            <FieldDisplay
              label="Aisle"
              value={aisleFields.field.value}
              onFocus={aisleFields.focusField}
              active={aisleFields.field.isActive}
              locked={locked}
              size="large"
              invalid={aisleFields.invalid}
            />
            {/* Freight-type badges for the resolved aisle (issue #169) — aisle-wide totals,
                not broken out by zone (SDP has no zone concept of its own), same column-by-
                Storage-Code layout ELZ/STG's Zone Summary panels use, compact size to fit
                this narrow island. */}
            {aisleFields.breakdown.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {groupBreakdownByStorageCode(aisleFields.breakdown).map((col) => (
                  <div key={col.storageCode} className="flex flex-col gap-1">
                    {col.entries.map((b) => (
                      <ZoneCodeBadge key={`${b.storageCode}-${b.size}`} storageCode={b.storageCode} size={b.size} empty={b.empty} staged={b.staged} badgeSize="compact" />
                    ))}
                  </div>
                ))}
              </div>
            )}
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
              <SizeField ref={sizeFieldRef} value={sizeOverride} onChange={setSizeOverride} aisle={overrideAisle} storageCode={storageOverride} width="w-full" disabled={locked} />
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
                  <StorageCodeField ref={storageFieldRef} value={storageOverride} onChange={handleStorageOverrideChange} aisle={overrideAisle} label="Storage" width="w-full" disabled={locked} />
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
                  <ZoneField ref={zoneFieldRef} value={zoneOverride} onChange={setZoneOverride} width="w-full" disabled={locked} />
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
        <PalletIdField
          ref={palletFieldRef}
          label="Scan Pallet ID"
          value={palletIdValue}
          onChange={handlePalletScan}
          demoScanner
          demoAisle={aisleFields.field.value}
          boxClass="h-[72px] px-5 rounded-[12px]"
          valueClass="text-[32px] font-medium tracking-[0.04em]"
          caretClass="w-[3px] h-[38px]"
          disabled={!aisleFields.field.value.trim() || locked}
          invalid={palletInvalid}
        />

        {/* Directed state — Verify-Put Modal (GitHub #151) */}
        {screenState === 'directed' && directed && (
          <SDPVerifyPutModal
            view={directed}
            candidates={session.candidates}
            loading={loading}
            locationEntryKey={locationEntryKey}
            onLocationConfirm={handleLocationConfirm}
            onLocationActiveChange={setLocationActive}
            onUnassign={handleUnassign}
            onHold={handleHold}
            onRedirect={handleRedirect}
            onReturnToReserved={handleReturnToReserved}
          />
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
        keyFn={(entry) => entry.reservationId}
        width="w-[456px]"
        renderRow={(entry) => {
          const outcomeColor =
            entry.outcome === 'PUT'      ? 'text-[#009900]' :
            entry.outcome === 'MOVE'     ? 'text-[#0066CC]' :
            entry.outcome === 'ASSIGNED' ? 'text-[#AA8800]' :
            entry.outcome === 'RELEASED' ? 'text-[#555555]' :
                                           'text-[#CC4400]'; // HELD
          const displayLoc = entry.finalLocation ?? entry.directedLocation;
          return (
            <>
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
            </>
          );
        }}
      />
    </div>
  );
}
