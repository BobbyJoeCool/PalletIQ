import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataRow } from '../components/shared/DataRow';
import { ContainerDemoScannerBar } from '../components/shared/ContainerDemoScannerBar';
import { Dropdown } from '../components/shared/Dropdown';
import { HoldPanel } from '../components/shared/HoldPanel';
import { LocationEntryFields } from '../components/shared/LocationEntryFields';
import { NumpadFieldBox } from '../components/shared/NumpadFieldBox';
import { PalletIdField, type PalletIdFieldHandle } from '../components/shared/PalletIdField';
import { SessionHistoryPanel } from '../components/shared/SessionHistoryPanel';
import { LiveId } from '../components/ui/LiveId';
import { ModalOverlay } from '../components/ui/ModalOverlay';
import { DigitGrid, NumericReadout } from '../components/ui/NumericKeypad';
import { useAuth } from '../context/AuthContext';
import { useDemoSlot } from '../context/FooterDemoContext';
import { useMessageBar } from '../context/MessageBarContext';
import { useNumpad } from '../context/NumpadContext';
import { type PIPContainerScanResult, usePIP } from '../context/PIPContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { PULL_FUNCTIONS } from '../lib/demoScanner';
import { useDigitInput } from '../lib/useDigitInput';
import { useNumpadField } from '../lib/useNumpadField';
import { fmtLocation } from '../lib/fmt';

// ── Types ────────────────────────────────────────────────────────────────────

interface Qty { pallets: number; cartons: number; ssps: number }

// ContainerScanResult's shape now lives in PIPContext.tsx (App-Wide screen-persistence,
// v1.7.0) as `PIPContainerScanResult`, imported here rather than redeclared.

interface HistoryEntry {
  location: string;
  pulledQty: Qty;
  updatedQty: Qty;
  timestamp: Date;
}

// PULL_FUNCTIONS now lives in lib/demoScanner.ts — ContainerDemoScannerBar's by-status
// popup needs the same list for its Pull Function filter dropdown.

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Formats a Qty object into a short summary string. @returns e.g. "2P / 5C / 0S" */
function fmtQty(q: Qty) {
  return `${q.pallets}P / ${q.cartons}C / ${q.ssps}S`;
}

const QTY_COLS: { key: keyof Qty; label: string }[] = [
  { key: 'pallets', label: 'Pallet' },
  { key: 'cartons', label: 'Carton' },
  { key: 'ssps',    label: 'SSP' },
];

/**
 * Combined Current/Pull/Remaining quantity table (issue #62 — replaces three separate
 * QtyRow blocks with one, to make room for the larger Location display per issue #61).
 * Columns are Pallet/Carton/SSP; rows are Current (quantity presently in the location),
 * Pull (quantity requested by the container), and — once verification has computed it —
 * Remaining below a divider. Any Remaining cell at 0 is shown in red, matching the old
 * highlight behavior, to alert the worker a unit type is fully depleted.
 *
 * The Carton column is emphasized (~33% larger, info blue) over Pallet/SSP — cartons are
 * what a worker is counting out by hand on most pulls, so it's the number most worth
 * making easy to read at a glance; a depleted-Carton cell still falls back to the same
 * red-on-zero warning as every other column.
 *
 * `current`/`pull` accept `null` (issue #187 — this table now always renders, even before
 * a label is scanned) and render a blank placeholder per cell rather than a misleading
 * literal `0`, which would read as "zero units" instead of "nothing loaded yet."
 */
function QtyTable({ current, pull, remaining, remainingZero }: { current: Qty | null; pull: Qty | null; remaining: Qty | null; remainingZero?: boolean }) {
  return (
    <div className="py-1.5 border-b border-[#1A1A1A]">
      <div className="grid grid-cols-[160px_repeat(3,1fr)] items-center gap-x-2 gap-y-1">
        <span />
        {QTY_COLS.map(({ key, label }) => (
          <span key={key} className="font-ui text-[11px] text-[#666] uppercase tracking-wider text-center">{label}</span>
        ))}

        <span className="font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">Current</span>
        {QTY_COLS.map(({ key }) => (
          <span
            key={key}
            className={`font-data font-semibold text-center ${key === 'cartons' ? 'text-[27px] text-[#5B9BD5]' : 'text-[20px] text-white'}`}
          >
            {current ? current[key] : <span className="text-[#444]">—</span>}
          </span>
        ))}

        <span className="font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">Pull</span>
        {QTY_COLS.map(({ key }) => (
          <span
            key={key}
            className={`font-data font-semibold text-center ${key === 'cartons' ? 'text-[27px] text-[#5B9BD5]' : 'text-[20px] text-white'}`}
          >
            {pull ? pull[key] : <span className="text-[#444]">—</span>}
          </span>
        ))}

        <div className="col-span-4 border-t border-[#333] my-0.5" />
        <span className="font-ui text-[15px] font-semibold text-[#9A9A9A] uppercase tracking-wider">Remaining</span>
        {QTY_COLS.map(({ key }) => {
          const depleted = remaining != null && remainingZero && remaining[key] === 0;
          const emphasized = key === 'cartons';
          return (
            <span
              key={key}
              className={`font-data font-bold text-center ${emphasized ? 'text-[29px]' : 'text-[22px]'} ${
                depleted ? 'text-[#CC0000]' : emphasized ? 'text-[#5B9BD5]' : 'text-white'
              }`}
            >
              {remaining ? remaining[key] : <span className="text-[#444]">—</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Input display field driven by NumpadContext. Tapping calls onFocus, which registers
 * the field's submit handler. The blinking red cursor appears when active and not disabled.
 *
 * @param label - Field label shown above the display box
 * @param value - Current field value (from useNumpadField)
 * @param onFocus - Called when the field is tapped; should call field.focus(handler)
 * @param active - True when this field currently holds the numpad handler registration
 * @param disabled - True when the field should not accept focus (e.g., during loading)
 * @param compact - Slightly smaller box/text, for fields that sit side by side (issue #82's
 *   UPC/Location pair) rather than taking the full row width Label/Pallet ID use.
 * @param invalid - Applies the app-wide red-wash treatment (see `src/lib/invalidWash.ts`)
 *   instead of the plain active-only border — invalid wins over active, same precedence as
 *   every other field in the app.
 * @param valid - Applies the app-wide blue "confirmed valid" wash (issue #188's CID
 *   3-state status) — the Label field's own use case, currently.
 */
function FieldDisplay({
  label,
  value,
  onFocus,
  active = false,
  disabled = false,
  compact = false,
  invalid = false,
  valid = false,
}: {
  label: string;
  value: string;
  onFocus: () => void;
  active?: boolean;
  disabled?: boolean;
  compact?: boolean;
  invalid?: boolean;
  valid?: boolean;
}) {
  return (
    <NumpadFieldBox
      label={label}
      value={value}
      onFocus={onFocus}
      active={active}
      disabled={disabled}
      invalid={invalid}
      valid={valid}
      boxClass={compact ? 'h-[60px] px-4 rounded-[12px]' : 'h-[72px] px-5 rounded-[12px]'}
      valueClass={compact ? 'text-[26px] font-medium tracking-[0.04em]' : 'text-[32px] font-medium tracking-[0.04em]'}
      caretClass={compact ? 'w-[3px] h-[30px]' : 'w-[3px] h-[38px]'}
    />
  );
}

// ── PIP Screen ───────────────────────────────────────────────────────────────

type ScreenState = 'ready' | 'verifying';

/**
 * CID's own 3-state status (issue #188) — distinct from any individual field's plain
 * invalid wash: 'neutral' is "no information" (fresh load, or just reset after a
 * successful pull verification); 'valid' is a currently-loaded, verified label; 'invalid'
 * is a scan/entry that failed. Pallet ID/UPC/Location are only enterable while 'valid'
 * (see `disabled={cidStatus !== 'valid'}` at each field below) — there's nothing to verify
 * against otherwise. Neutral→valid deliberately does *not* clear the message bar (so a
 * fresh label scan right after a successful pull doesn't stomp that pull's own "Last Pull
 * ... count" confirmation); invalid→valid does, since there's a stale error to replace.
 */
type CidStatus = 'valid' | 'neutral' | 'invalid';

/**
 * Pallet ID Pull (PIP) screen.
 * Two-state flow: ready → verifying. Pull Function is a persistent dropdown at the top of
 * the screen (defaults to the first option) rather than a separate initial step — Label/
 * PID/UPC/Location are always reachable, and changing the function is just a dropdown
 * selection away rather than a full-screen mode switch.
 *
 * ready: Label field is active. Scanning a label validates it via GET /api/containers/:id and
 *   checks that its pullFunction matches the selected one. On match, transitions to verifying.
 * verifying: Shows container/pallet/remaining quantities. Worker scans any one of:
 *   - Pallet ID field → POST /api/pulls/verify with palletId
 *   - UPC field → POST /api/pulls/verify with upc
 *   - Location field → POST /api/pulls/verify with location (issue #82 — split from a
 *     single combined Alternate ID field into independent UPC/Location fields)
 *   Any path marks the container PULLED, deducts quantities, and on success appends the
 *   pull to the session history and returns to ready. Scanning a new label while in verifying
 *   discards the unverified container and reloads with the new one.
 *
 * Demo buttons track the active numpad field and always show one success and one failure scenario.
 * All scanner input flows through NumpadContext.deliverScan().
 */

/**
 * FP Alt-ID level-mismatch correction popup (issue #72 — replaces the old plain
 * confirm/reject dialog). Instead of just confirming or rejecting the scanned-but-wrong
 * level, the worker types the level the pallet was actually pulled from. That corrected
 * level is accepted as-is with no further validation (an attestation, not a lookup) and
 * is what gets resubmitted in place of the originally-scanned level. Modeled on MNP's
 * LevelModal keypad (not the shared ConfirmDialog, which has no room for an input) but
 * kept local to this file rather than fully merged into one shared dialog — MNP's version
 * has no Cancel action (collecting a level there is mandatory, not a correction the
 * worker can back out of), so the two components' bottom sections still diverge even
 * after sharing their overlay chrome/readout/digit-grid (Refactoring Audit findings F3/F4).
 */
function LevelCorrectionDialog({
  scannedLevel, actualLevel, onConfirm, onCancel,
}: { scannedLevel: number; actualLevel: number; onConfirm: (level: number) => void; onCancel: () => void }) {
  const { input, pressDigit, backspace } = useDigitInput();

  /** Accepts the typed level as-is (no validation against real data) and reports it. */
  function confirm() {
    const level = parseInt(input, 10);
    if (!input || isNaN(level) || level <= 0) return;
    onConfirm(level);
  }

  return (
    <ModalOverlay testId="level-correction-dialog" width="w-[520px]">
      <h2 className="font-ui text-[22px] font-semibold text-white text-center mb-3">
        What level was this pallet actually pulled from?
      </h2>
      <p className="font-ui text-[15px] text-[#9A9A9A] text-center mb-5">
        You scanned Level {scannedLevel}, but this pallet's recorded location is Level {actualLevel}.
      </p>

      <NumericReadout value={input} />

      <DigitGrid onDigit={pressDigit} onBackspace={backspace} keySize="compact" className="mb-4" />

      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="flex-1 h-[56px] rounded-[12px] border border-[#3A3A3A] font-ui text-[17px] font-medium text-white hover:bg-[#1A1A1A] transition-colors">
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={!input}
          className="flex-1 h-[56px] rounded-[12px] font-ui text-[17px] font-semibold text-white bg-[#CC0000] hover:bg-[#AA0000] disabled:opacity-40 transition-colors"
        >
          Confirm Level
        </button>
      </div>
    </ModalOverlay>
  );
}

/**
 * Small anchored popup (issue #186) offering a choice between the currently-scanned
 * container's location and the previous pull's — a worker's normal flow is to scan
 * Pallet ID to verify and immediately scan the next label while the scanner's still in
 * hand, so they often only realize a location needs holding after they've already moved
 * on to the next one. Only ever rendered by its caller when both locations exist
 * (`openHold` skips straight to `HoldPanel` when there's just one, since there's nothing
 * to pick between). Tap-outside-closes, matching every other lightweight anchored popup
 * in the app (e.g. `WorkstationExcludeFilter`).
 */
function HoldLocationPicker({
  currentLocation, previousLocation, onPick, onClose,
}: { currentLocation: string; previousLocation: string; onPick: (locationId: string) => void; onClose: () => void }) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) onClose();
    }
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [onClose]);

  return (
    <div ref={wrapperRef} className="absolute z-50 top-full right-0 mt-1 w-max min-w-[220px] rounded-[10px] bg-[#0D0D0D] border border-[#3A3A3A] shadow-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => onPick(currentLocation)}
        className="w-full flex flex-col items-start gap-0.5 px-4 py-2.5 text-left hover:bg-[#1A1A1A] transition-colors border-b border-[#1A1A1A]"
      >
        <span className="font-ui text-[12px] font-medium text-[#9A9A9A] uppercase tracking-wider">Current Location</span>
        <LiveId type="location" id={currentLocation} className="!text-[18px] !font-semibold" />
      </button>
      <button
        type="button"
        onClick={() => onPick(previousLocation)}
        className="w-full flex flex-col items-start gap-0.5 px-4 py-2.5 text-left hover:bg-[#1A1A1A] transition-colors"
      >
        <span className="font-ui text-[12px] font-medium text-[#9A9A9A] uppercase tracking-wider">Previous Location</span>
        <LiveId type="location" id={previousLocation} className="!text-[18px] !font-semibold" />
      </button>
    </div>
  );
}

export function PIPPage() {
  const { token } = useAuth();
  const { setMessage, clearMessage } = useMessageBar();
  const { deliverScan, isScanningRef } = useNumpad();

  const [screenState, setScreenState] = useState<ScreenState>('ready');
  const [pullFunction, setPullFunction] = useState<string>(PULL_FUNCTIONS[0].code);
  // Session-level persistence (App-Wide screen-persistence item, v1.7.0) — see
  // PIPContext.tsx's own doc comment; mirrors LII/PII/ISI's identical pattern.
  const { containerData, setContainerData } = usePIP();
  const [loading, setLoading] = useState(false);
  // CID's 3-state status (issue #188 — see the CidStatus type doc above). Also gates
  // Pallet ID/UPC/Location: each is `disabled` unless this is 'valid' (nothing to verify
  // against otherwise, and issue #187 now renders them even before a label is scanned).
  const [cidStatus, setCidStatus] = useState<CidStatus>('neutral');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  // Quick-hold panel (WLH.md: "surfaced as a quick-action on PIP, SDP, and MNP" —
  // inline, not a full navigation). `holdLocationId` is whichever location the worker
  // actually picked (current or previous — issue #186); `holdPickerOpen` is the small
  // current-vs-previous popup, shown only when both exist (see openHold below).
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdPickerOpen, setHoldPickerOpen] = useState(false);
  const [holdLocationId, setHoldLocationId] = useState<string | null>(null);
  // Pending FP level-mismatch confirmation (issue #49) — set by handleLocationVerify on
  // LEVEL_MISMATCH, resolved by confirmLevelMismatch/cancelLevelMismatch.
  const [levelMismatch, setLevelMismatch] = useState<{ scannedLevel: number; actualLevel: number; locationValue: string } | null>(null);

  const containerField = useNumpadField();
  const pidFieldRef   = useRef<PalletIdFieldHandle>(null);
  const [pidValue, setPidValue] = useState('');
  const [pidActive, setPidActive] = useState(false);
  // Invalid-wash flags (issue #185) — an unsuccessful Pallet ID/UPC/Location attempt now
  // washes red and keeps the entered value on screen (matching the Label field's own
  // already-correct behavior) instead of silently clearing it; cleared on the next
  // successful pull (onPullSuccess) or a fresh Label scan (which resets the whole
  // verifying attempt regardless of what was mid-typed). Location's is a single flag
  // (not per-box) since a server-side ALTERNATE_MISMATCH doesn't attribute the failure to
  // one specific box — a *locked* box's own mismatch is handled entirely inside
  // LocationEntryFields itself instead (see handleLocationLockedMismatch below).
  const [pidInvalid, setPidInvalid] = useState(false);
  const [upcInvalid, setUpcInvalid] = useState(false);
  const [locationInvalid, setLocationInvalid] = useState(false);
  // Issue #82 — UPC and Location replace the old single Alternate ID field; each is
  // independently scannable/enterable (one-active-field-at-a-time, same as everywhere
  // else), and confirming either alone immediately attempts a verify with just that value.
  const upcField      = useNumpadField();
  // Location is the shared 3-box Aisle/Bin/Level component (also used by PAR/WLH/LII)
  // rather than a useNumpadField() — it manages its own three internal fields, so state
  // that used to live on a single field object is tracked separately here. `locationActive`
  // mirrors the other fields' `.isActive` for the demo-footer gating below; `locationEntryKey`
  // forces a full remount (clearing all three boxes) — now only used to clear on a genuine
  // reset (a fresh Label scan or a successful pull, issue #185 — no longer on a plain
  // invalid attempt, which washes+keeps its value like every other field instead), and
  // `locationAutoFocusRef` is read by that fresh instance's `autoFocus` prop — mutating it
  // just before bumping the key is what lets a remount optionally auto-focus Aisle again,
  // matching how PID/UPC explicitly refocus themselves after an error.
  const [locationActive, setLocationActive] = useState(false);
  const [locationEntryKey, setLocationEntryKey] = useState(0);
  const locationAutoFocusRef = useRef(false);

  // Guards the 'verifying'-entry auto-focus effect below against stealing focus back to
  // PID if the worker (or a fast automated scan) has already manually focused a different
  // field within the effect's 50ms delay — without this, that delayed focusPidField() call
  // fires unconditionally and yanks focus away from whatever the worker just tapped,
  // discarding a scan mid-delivery. Reset false on each entry into 'verifying'; set true by
  // any manual focus call (PID or Alt ID) so the delayed auto-focus becomes a no-op.
  const suppressAutoPidFocusRef = useRef(false);

  // Refs so callbacks passed into handlers always see the current value.
  const screenStateRef   = useRef(screenState);
  const loadingRef       = useRef(loading);
  const containerDataRef = useRef(containerData);
  const pullFunctionRef  = useRef(pullFunction);
  const cidStatusRef     = useRef(cidStatus);
  screenStateRef.current  = screenState;
  loadingRef.current      = loading;
  containerDataRef.current = containerData;
  pullFunctionRef.current = pullFunction;
  cidStatusRef.current    = cidStatus;

  // ── Handlers ──────────────────────────────────────────────────────────────

  /**
   * Handles a Pull Function change from the dropdown. A no-op if the same value is
   * re-selected (tapping the dropdown open and picking the current function shouldn't
   * disrupt an in-progress verification). Otherwise resets back to ready — warning about
   * and discarding any unverified container first, matching the old full-screen selector's
   * "changing function abandons the current label" behavior — clears the Label field, and
   * refocuses it for the next scan under the new function.
   */
  function handlePullFunctionChange(fn: string) {
    if (fn === pullFunctionRef.current) return;
    if (screenStateRef.current === 'verifying') {
      setMessage({ type: 'warning', text: 'Label not verified' });
      setContainerData(null);
      setPidValue('');
      upcField.clear();
      resetLocationField(false);
      setPidInvalid(false);
      setUpcInvalid(false);
      setLocationInvalid(false);
    }
    setPullFunction(fn);
    setScreenState('ready');
    containerField.clear();
    setCidStatus('neutral');
    setTimeout(() => focusContainerField(), 50);
  }

  /** Registers the Label field's numpad handler, wired to handleContainerScan on confirm. */
  const focusContainerField = useCallback(() => {
    containerField.focus(handleContainerScan);
  }, [containerField]);

  /** (Re-)focuses the Pallet ID field for another attempt. */
  const focusPidField = useCallback(() => {
    suppressAutoPidFocusRef.current = true;
    pidFieldRef.current?.focus();
  }, []);

  /** Registers the UPC field's numpad handler, wired to handleUpcVerify on confirm. */
  const focusUpcField = useCallback(() => {
    suppressAutoPidFocusRef.current = true;
    upcField.focus(handleUpcVerify);
  }, [upcField]);

  /** Clears Location's three boxes via a full remount; pass autoFocus to also refocus Aisle immediately (matching PID/UPC's clear-and-refocus-on-error behavior). */
  const resetLocationField = useCallback((autoFocus: boolean) => {
    locationAutoFocusRef.current = autoFocus;
    setLocationEntryKey((k) => k + 1);
  }, []);

  /**
   * Submit handler for the Label field. Calls GET /api/containers/:id.
   * If the container's pull function doesn't match the selected one, rejects it with an error.
   * If already in verifying state (rescan), warns about the unverified container before replacing it.
   * On success, stores the container data and transitions to verifying state.
   */
  async function handleContainerScan(value: string) {
    const v = value.trim();
    const priorState = screenStateRef.current;
    if (!v || loadingRef.current || (priorState !== 'ready' && priorState !== 'verifying')) return;
    // The Label field's displayed value is intentionally never cleared after a successful
    // scan (so a worker can tap it again to see what's loaded, or to refocus it for a real
    // rescan — see the "rescanning while verifying" test). That stale value is exactly what
    // NumpadContext's setKeyHandler resubmits as a synthetic 'Enter' whenever focus moves
    // away from this field automatically (e.g. the verifying-entry effect auto-focusing
    // PID) — without this check, that non-user-initiated resubmission of the SAME
    // already-loaded container re-enters this "already verifying" branch below, clearing
    // PID/UPC/Location and scheduling *another* delayed auto-focus-PID call, cascading into
    // an unpredictable focus race. A genuine rescan always delivers a *different* container id.
    if (priorState === 'verifying' && containerDataRef.current?.container.id === v) return;
    if (priorState === 'verifying') {
      // No message-bar update here — scanning the next label while the previous one was still
      // unverified is a normal part of the fast scan-then-verify-in-batch workflow, not an error
      // condition. Overwriting whatever's already showing (e.g. the previous pull's success
      // message) with a "Label not verified" warning on every plain rescan is what issue #45
      // actually reported; the fields still get cleared to make way for the new container's data.
      setPidValue('');
      upcField.clear();
      resetLocationField(false);
      setPidInvalid(false);
      setUpcInvalid(false);
      setLocationInvalid(false);
    }
    setLoading(true);
    try {
      const data = await apiFetch<PIPContainerScanResult>(`/api/containers/${encodeURIComponent(v)}`, token!);
      if (data.container.pullFunction !== pullFunctionRef.current) {
        playAlert('error');
        // Value stays visible (not cleared) so the worker can see what they scanned;
        // re-focusing (not clearing) still arms a fresh start for the next input, so a
        // manual retry replaces rather than appends onto the stale value.
        focusContainerField();
        setCidStatus('invalid');
        setMessage({ type: 'error', text: `Wrong function — label requires ${data.container.pullFunction}` });
        return;
      }
      setContainerData(data);
      // Issue #188 — only clear the message bar when replacing an actual error (invalid →
      // valid); a fresh scan landing right after a successful pull (neutral → valid) must
      // NOT stomp that pull's own "Last Pull ... count" confirmation, which is exactly the
      // bug this status was introduced to fix.
      if (cidStatusRef.current === 'invalid') clearMessage();
      setCidStatus('valid');
      if (priorState !== 'verifying') {
        setScreenState('verifying');
        // PID field auto-focuses via the verifying effect.
      } else {
        // Already in verifying — effect won't re-fire, so focus PID explicitly.
        setTimeout(() => focusPidField(), 50);
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      playAlert('error');
      // Value stays visible (not cleared) so the worker can see what they scanned; see
      // the Wrong Function branch above for why focusContainerField() (not .clear()) is what
      // arms a fresh start for the next input.
      focusContainerField();
      setCidStatus('invalid');
      if (code === 'NOT_FOUND') {
        setMessage({ type: 'error', text: 'Label not found' });
      } else {
        setMessage({ type: 'error', text: `Invalid status: ${code}` });
      }
    } finally {
      setLoading(false);
    }
  }

  /**
   * Submit handler for the Pallet ID field. Calls POST /api/pulls/verify with palletId.
   * On mismatch (PALLET_MISMATCH), washes the field red and keeps the entered value
   * visible (issue #185) — re-focusing (not clearing) still arms a fresh start for the
   * next input, same as the Label field's own established pattern. On success, calls
   * onPullSuccess.
   *
   * The `loadingRef.current` guard is checked *before* `setPidValue` (not after, unlike
   * a plain early-return order would suggest) — this call can legitimately re-enter itself
   * while the original call's own `await apiFetch` is still pending: `onPullSuccess` moves
   * focus to the Label field, and `useNumpadField`'s own submittingRef guard against a
   * reentrant Blur only covers this handler's *synchronous* prefix (up to its first
   * `await`), not the whole async operation — so that focus change's synthetic Blur at PID
   * (the field being left) re-fires this same handler a second time, synchronously, before
   * `onPullSuccess`'s own `setPidValue('')` has actually been applied. Setting `pidValue`
   * unconditionally on that reentrant call would silently overwrite the pending clear with
   * the just-verified value again — the PID box never visually clears. Checking the guard
   * first makes that reentrant call a true no-op instead.
   */
  async function handlePidVerify(value: string) {
    const v = value.trim();
    if (!v || loadingRef.current) return;
    setPidValue(v);
    const ld = containerDataRef.current;
    if (!ld) return;
    // Read synchronously, before the await below — isScanningRef.current is still true
    // here for a scan's trailing synthetic Enter (see NumpadContext's deliverScan), but
    // is reset to false shortly after this function's synchronous prefix returns control.
    const wasScanned = isScanningRef.current;
    setLoading(true);
    try {
      const result = await apiFetch<{ location: string; updatedQuantity: Qty }>(
        '/api/pulls/verify',
        token!,
        { method: 'POST', body: JSON.stringify({ containerId: ld.container.id, pullFunction: pullFunctionRef.current, palletId: v, wasScanned }) },
      );
      onPullSuccess(result.location, ld.container.quantity, result.updatedQuantity);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      playAlert('error');
      setPidInvalid(true);
      pidFieldRef.current?.focus();
      if (code === 'PALLET_MISMATCH') {
        setMessage({ type: 'error', text: 'Incorrect Pallet ID' });
      } else if (code === 'WRONG_PULL_FUNCTION') {
        setMessage({ type: 'error', text: 'Pull function mismatch' });
      } else {
        setMessage({ type: 'error', text: 'Verification failed — please try again' });
      }
    } finally {
      setLoading(false);
    }
  }

  /**
   * Submit handler for the UPC field. Calls POST /api/pulls/verify with upc.
   * On mismatch (ALTERNATE_MISMATCH), washes the field red and keeps the entered value
   * visible (issue #185), re-focusing (not clearing) for a fresh retry — same pattern as
   * Pallet ID. On success, calls onPullSuccess.
   */
  async function handleUpcVerify(value: string) {
    const v = value.trim();
    if (!v || loadingRef.current) return;
    const ld = containerDataRef.current;
    if (!ld) return;
    // See handlePidVerify's comment — must be read before the await below.
    const wasScanned = isScanningRef.current;
    setLoading(true);
    try {
      const result = await apiFetch<{ location: string; updatedQuantity: Qty }>(
        '/api/pulls/verify',
        token!,
        { method: 'POST', body: JSON.stringify({ containerId: ld.container.id, pullFunction: pullFunctionRef.current, upc: v, wasScanned }) },
      );
      onPullSuccess(result.location, ld.container.quantity, result.updatedQuantity);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      playAlert('error');
      setUpcInvalid(true);
      upcField.focus(handleUpcVerify);
      if (code === 'ALTERNATE_MISMATCH') {
        setMessage({ type: 'error', text: 'Invalid UPC' });
      } else if (code === 'WRONG_PULL_FUNCTION') {
        setMessage({ type: 'error', text: 'Pull function mismatch' });
      } else {
        setMessage({ type: 'error', text: 'Verification failed — please try again' });
      }
    } finally {
      setLoading(false);
    }
  }

  /**
   * Submit handler for Location, called by LocationEntryFields once a full 8-digit
   * Aisle+Bin+Level value resolves. Hand-entry always locks Aisle to the pallet's real
   * value (per locationLockedAisle below — re-typing it isn't required for any function);
   * Carton Floor additionally locks Level, so only its Bin is actually fallible in
   * practice, while CA/FP still require Bin and Level to be genuinely typed and verified.
   * Calls POST /api/pulls/verify with location and wasScanned — the match rule depends on
   * both the pull function and entry method (see verifyPull's docstring): scanned CA needs
   * a full match, scanned CF only Aisle+Bin, scanned FP a full match with a level-mismatch
   * recovery popup, hand-entered CA/FP a full match with no popup. On mismatch
   * (ALTERNATE_MISMATCH), washes the boxes red and keeps whatever was entered (issue
   * #185) — this is the server-side "the whole value doesn't match" case, which can't be
   * attributed to one specific box, unlike a locked-field mismatch (see
   * handleLocationLockedMismatch, which never reaches the server at all). On success,
   * calls onPullSuccess.
   */
  async function handleLocationVerify(value: string, wasScanned: boolean) {
    const v = value.trim();
    if (!v || loadingRef.current) return;
    const ld = containerDataRef.current;
    if (!ld) return;
    setLoading(true);
    try {
      const result = await apiFetch<{ location: string; updatedQuantity: Qty }>(
        '/api/pulls/verify',
        token!,
        { method: 'POST', body: JSON.stringify({ containerId: ld.container.id, pullFunction: pullFunctionRef.current, location: v, wasScanned }) },
      );
      onPullSuccess(result.location, ld.container.quantity, result.updatedQuantity);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'LEVEL_MISMATCH') {
        const data = (err as { data?: { scannedLevel: number; actualLevel: number } }).data;
        if (data) {
          setLevelMismatch({ ...data, locationValue: v });
          return;
        }
      }
      playAlert('error');
      setLocationInvalid(true);
      if (code === 'ALTERNATE_MISMATCH') {
        setMessage({ type: 'error', text: 'Invalid Location' });
      } else if (code === 'WRONG_PULL_FUNCTION') {
        setMessage({ type: 'error', text: 'Pull function mismatch' });
      } else {
        setMessage({ type: 'error', text: 'Verification failed — please try again' });
      }
    } finally {
      setLoading(false);
    }
  }

  /**
   * Fires when LocationEntryFields itself detects a scanned value's Aisle or Level
   * segment disagreeing with what's locked (issue #183's follow-up) — never reaches the
   * server at all, since a locked field is always a known-correct value already. The
   * component washes the specific mismatched box and shows what was actually scanned on
   * its own internally; this just surfaces the message it hands back.
   */
  function handleLocationLockedMismatch(message: string) {
    playAlert('error');
    setMessage({ type: 'error', text: message });
  }

  /**
   * Worker typed the level this pallet was actually pulled from (issue #72 — collects a
   * correction rather than just confirming/rejecting the mismatch). Replaces the
   * originally-scanned level with that correction (aisle+bin unchanged) and resubmits
   * with confirmLevelMismatch: true; the corrected level is accepted as-is, no further
   * validation against real data. Only reachable via a scanned Full Pallet mismatch (see
   * handleLocationVerify), so wasScanned is always true on the resubmit.
   */
  async function confirmLevelMismatch(correctedLevel: number) {
    const pending = levelMismatch;
    const ld = containerDataRef.current;
    setLevelMismatch(null);
    if (!pending || !ld) return;
    setLoading(true);
    try {
      const correctedLocation = pending.locationValue.slice(0, 6) + String(correctedLevel).padStart(2, '0');
      const result = await apiFetch<{ location: string; updatedQuantity: Qty }>(
        '/api/pulls/verify',
        token!,
        { method: 'POST', body: JSON.stringify({ containerId: ld.container.id, pullFunction: pullFunctionRef.current, location: correctedLocation, confirmLevelMismatch: true, wasScanned: true }) },
      );
      onPullSuccess(result.location, ld.container.quantity, result.updatedQuantity);
    } catch {
      playAlert('error');
      setLocationInvalid(true);
      setMessage({ type: 'error', text: 'Verification failed — please try again' });
    } finally {
      setLoading(false);
    }
  }

  /** Worker declined to confirm the FP level mismatch — treat it like any other invalid Location. */
  function cancelLevelMismatch() {
    setLevelMismatch(null);
    playAlert('error');
    setLocationInvalid(true);
    setMessage({ type: 'error', text: 'Invalid Location' });
  }

  /**
   * Called after a successful pull verification. Plays a success sound, appends a history entry,
   * shows the pull location and remaining quantity in the message bar, then resets all fields
   * and returns to ready state for the next label scan.
   *
   * Re-focuses the Label field synchronously here rather than relying solely on the 'ready'
   * effect's 50ms-delayed focusContainerField() call below — that delay leaves a window where the
   * PID/Alt field (just cleared, but never explicitly released as NumpadContext's active
   * handler) is still what a scan gets delivered to. A fast barcode-scanner scan of the next
   * label can land inside that window, hitting the stale PID/Alt handler instead of
   * handleContainerScan — which is what was producing issue #45's spurious "Label not verified"
   * warning even after a pull had already verified successfully: the scan silently mis-routed
   * to the (now-empty) PID field, no-op'd there, and only the *following* real scan attempt hit
   * handleContainerScan while still carrying leftover verifying-adjacent state. Registering the
   * Label handler immediately closes that window; the 'ready' effect's own call afterward is a
   * harmless redundant no-op re-registration.
   */
  function onPullSuccess(location: string, pulledQty: Qty, updatedQty: Qty) {
    playAlert('info');
    setHistory(h => [{ location, pulledQty, updatedQty, timestamp: new Date() }, ...h]);
    setMessage({ type: 'success', text: `Last Pull ${fmtLocation(location)} — ${fmtQty(updatedQty)}` });
    setContainerData(null);
    setScreenState('ready');
    containerField.clear();
    // Issue #188 — 'neutral', not cleared-and-forgotten: a fresh scan landing right after
    // this (neutral → valid) must not stomp the success message just set above.
    setCidStatus('neutral');
    setPidValue('');
    upcField.clear();
    resetLocationField(false);
    setPidInvalid(false);
    setUpcInvalid(false);
    setLocationInvalid(false);
    focusContainerField();
  }

  // ── Focus management by screen state ─────────────────────────────────────

  useEffect(() => {
    if (screenState !== 'ready') return;
    // Only fires on state entry — omitting focusContainerField from deps is intentional.
    // Adding it causes the effect to re-run on every render within 'ready'.
    const id = setTimeout(() => focusContainerField(), 50);
    return () => clearTimeout(id);
  }, [screenState]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (screenState !== 'verifying') return;
    // Only fires on state entry — omitting focusPidField from deps is intentional.
    // Adding it causes the effect to re-run within 'verifying' and steal focus from Alt ID.
    suppressAutoPidFocusRef.current = false;
    const id = setTimeout(() => {
      if (!suppressAutoPidFocusRef.current) focusPidField();
    }, 50);
    return () => clearTimeout(id);
  }, [screenState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Demo buttons ──────────────────────────────────────────────────────────

  // Container ID's Valid/by-status/Invalid buttons are owned internally by
  // `ContainerDemoScannerBar` (Feature 9, CID phase) — see the demoSlot useMemo below.
  // Retired: the old bespoke demoScanContainer/demoBadContainer/pickInvalidContainer
  // callbacks and the dedicated "⚠ Invalid Label" picker (Wrong Function/Pulled/Canceled/
  // Purged) — those four options are now Status picks in the shared by-status popup, per
  // the Core Concept section's "Invalid is strictly not-found" rule.

  /** Delivers the current container's actual pallet id, simulating a correct verification scan. */
  const demoScanPid = useCallback(() => {
    const ld = containerDataRef.current;
    if (ld) deliverScan(String(ld.pallet.id));
  }, [deliverScan]);

  /** Delivers a pallet id that won't match the current container, simulating a mismatch. */
  const demoBadPid = useCallback(() => {
    deliverScan('INVALID-PID-000');
  }, [deliverScan]);

  /**
   * Fetches the current container's item UPC (by its DPCI) and delivers it, simulating a
   * correct UPC verification scan. Unlike every other demo handler, this one has to await
   * a network call before it can deliver — during that gap, the delayed auto-focus-PID
   * effect (still pending from entering `verifying`) could in principle win a race and
   * switch the active field away from UPC, so deliverScan's normal "send to whatever's
   * currently active" behavior would misroute the fetched UPC into the wrong field.
   * Re-focusing UPC immediately before delivering closes that window regardless of what
   * happened during the await, at the cost of a harmless redundant re-registration on the
   * common path where nothing raced at all.
   */
  const demoScanUpc = useCallback(async () => {
    const ld = containerDataRef.current;
    if (!ld) return;
    try {
      const item = await apiFetch<{ upc: string }>(`/api/items/dpci/${ld.container.dpci}`, token!);
      focusUpcField();
      deliverScan(item.upc);
    } catch {
      setMessage({ type: 'error', text: 'Demo UPC unavailable' });
    }
  }, [token, deliverScan, setMessage, focusUpcField]);

  /** Delivers a UPC that won't match the current container, simulating a mismatch. */
  const demoBadUpc = useCallback(() => {
    deliverScan('000000000000');
  }, [deliverScan]);

  /** Delivers the current container's resolved location barcode, simulating a correct location verification scan. */
  const demoScanLocation = useCallback(() => {
    const ld = containerDataRef.current;
    if (ld?.location.id) deliverScan(ld.location.id); // raw 8-digit barcode, no dashes
  }, [deliverScan]);

  /** Delivers a location that won't match the current container, simulating a mismatch. */
  const demoBadLocation = useCallback(() => {
    deliverScan('00000000'); // 8 digits — must be exactly 8 to hit LocationEntryFields' full-barcode-scan path
  }, [deliverScan]);

  // Memoized so the JSX reference is stable across renders that don't change which
  // field is active — useDemoSlot's re-sync effect keys off this reference, and an
  // unmemoized JSX literal would recreate it (and re-fire the effect) on every render,
  // looping forever via the FooterDemoContext state update it triggers.
  const demoSlot = useMemo(() => (
    containerField.isActive ? (
      <ContainerDemoScannerBar onFill={deliverScan} fn={pullFunction} />
    ) : pidActive ? (
      <>
        <DemoBtn label="✓ Scan PID" color="green" onClick={demoScanPid} />
        <DemoBtn label="✗ Scan PID" color="red"   onClick={demoBadPid} />
      </>
    ) : upcField.isActive ? (
      <>
        <DemoBtn label="✓ UPC" color="green" onClick={demoScanUpc} />
        <DemoBtn label="✗ UPC" color="red"   onClick={demoBadUpc} />
      </>
    ) : locationActive ? (
      <>
        <DemoBtn label="✓ Location" color="green" onClick={demoScanLocation} />
        <DemoBtn label="✗ Location" color="red"   onClick={demoBadLocation} />
      </>
    ) : null
  ), [
    containerField.isActive, pidActive, upcField.isActive, locationActive,
    deliverScan, pullFunction,
    demoScanPid, demoBadPid, demoScanUpc, demoBadUpc, demoScanLocation, demoBadLocation,
  ]);

  useDemoSlot(demoSlot);

  // ── Computed values for State 2 ───────────────────────────────────────────

  const remaining: Qty | null = containerData
    ? {
        pallets: Math.max(0, containerData.pallet.quantity.pallets - containerData.container.quantity.pallets),
        cartons: Math.max(0, containerData.pallet.quantity.cartons - containerData.container.quantity.cartons),
        ssps:    Math.max(0, containerData.pallet.quantity.ssps    - containerData.container.quantity.ssps),
      }
    : null;

  const remainingZero = remaining
    ? remaining.pallets === 0 || remaining.cartons === 0 || remaining.ssps === 0
    : false;

  // Hand-entered Location locks Aisle across every pull function — re-typing it doesn't
  // add verification value, the worker already knows their aisle by other means — pulled
  // from the container already loaded rather than typed. Carton Floor additionally locks
  // Level too, since only its Bin actually needs verifying (product decision); CA/FP
  // still require Bin and Level to be genuinely typed and checked. All boxes stay visible
  // for layout consistency; a full location is always reconstructed underneath regardless
  // of which boxes are locked.
  const locationLockedAisle = containerData?.location.id ? containerData.location.id.slice(0, 3) : undefined;
  const locationLockedLevel = pullFunction === 'CF' && containerData?.location.id ? containerData.location.id.slice(6, 8) : undefined;

  // Issue #186 — the currently-scanned container's location, and the most recently
  // completed pull's location this session (history is prepended, so [0] is newest).
  // Either, both, or neither may exist at any given moment.
  const currentHoldLocation = containerData?.location.id ?? null;
  const previousHoldLocation = history[0]?.location ?? null;

  /**
   * Opens Hold for whichever location makes sense: a small picker when both a current and
   * a previous location exist (the worker may need either — see the Hold button's own
   * comment below), or straight to HoldPanel when only one does. A worker realizing they
   * need to hold a location only after having already scanned the next label is the
   * common case this exists for.
   */
  function openHold() {
    if (currentHoldLocation && previousHoldLocation) {
      setHoldPickerOpen(true);
      return;
    }
    const only = currentHoldLocation ?? previousHoldLocation;
    if (!only) return;
    setHoldLocationId(only);
    setHoldOpen(true);
  }

  /** Worker picked one of the two locations from the Hold picker popup. */
  function pickHoldLocation(locationId: string) {
    setHoldLocationId(locationId);
    setHoldPickerOpen(false);
    setHoldOpen(true);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 flex select-none">
      {/* Left column — workflow content */}
      <div className="flex-1 flex flex-col p-5 gap-3 overflow-y-auto">

        {/* Pull Function — persistent dropdown, always reachable; changing it mid-
            verification discards the unverified label (handlePullFunctionChange). Grown
            1.25x (issue #186), matching Hold's own growth, to read closer to the size of
            the Scan Label entry box below. */}
        <div className="flex items-center gap-3">
          <Dropdown
            label="Pull Function"
            value={pullFunction}
            size="large"
            options={PULL_FUNCTIONS.map(fn => ({ value: fn.code, label: `${fn.code} — ${fn.desc}` }))}
            onChange={handlePullFunctionChange}
          />
          {/* Issue #186 — red, 1.25x larger (was easy to lose on screen), and now offers a
              choice of the currently-scanned location or the previous pull's: the normal
              flow is scan-PID-to-verify then immediately scan the next label while the
              scanner's still in hand, so a worker often only realizes a location needs
              holding after they've already moved on to the next one. */}
          {(currentHoldLocation || previousHoldLocation) && (
            <div className="relative ml-auto">
              <button
                type="button"
                onClick={openHold}
                className="h-[48px] px-6 rounded-[10px] font-ui text-[16px] font-semibold bg-[#CC0000] hover:bg-[#DD0000] text-white transition-colors"
              >
                Hold
              </button>
              {holdPickerOpen && currentHoldLocation && previousHoldLocation && (
                <HoldLocationPicker
                  currentLocation={currentHoldLocation}
                  previousLocation={previousHoldLocation}
                  onPick={pickHoldLocation}
                  onClose={() => setHoldPickerOpen(false)}
                />
              )}
            </div>
          )}
        </div>

        {/* Label input */}
        <FieldDisplay
          label="Scan Label"
          value={containerField.value}
          onFocus={focusContainerField}
          active={containerField.isActive}
          invalid={cidStatus === 'invalid'}
          valid={cidStatus === 'valid'}
        />

        {/* Issue #187 — always rendered now, not gated behind a scanned label; every value
            below falls back to a blank placeholder while containerData is null. Issue
            #188 — Pallet ID/UPC/Location are each `disabled` unless the Label field above
            is 'valid': there's nothing loaded to verify against otherwise. */}
        <div className="flex flex-col mt-1">
          <DataRow label="Location" dense labelWidth={160}>
            {containerData?.location.id
              ? (
                // Issue #186 — blue (was red), font shrunk to 0.8x (46px→37px) to help
                // make room for Pull Function/Hold's own 1.25x growth above. Vertical
                // padding tuned (not a plain 0.8x of the old py-1) so the two rows'
                // combined height change nets to ~0 — measured live: row 1 +11px,
                // this row -11.5px, per the explicit "should be a wash" requirement.
                <span className="inline-flex px-2.5 py-[5px] rounded-[8px] bg-[#3A6BB0]/10 border-2 border-[#3A6BB0]/40">
                  <LiveId type="location" id={containerData.location.id} className="!text-[37px] !font-bold !text-[#5B9BD5]" />
                </span>
              )
              : <span className="text-[#9A9A9A]">—</span>}
          </DataRow>
          <DataRow label="Item" dense labelWidth={160}>
            {containerData?.container.descShort ?? <span className="text-[#9A9A9A]">—</span>}
          </DataRow>
          <DataRow label="DPCI" dense labelWidth={160}>
            {containerData ? <LiveId type="dpci" id={containerData.container.dpci} /> : <span className="text-[#9A9A9A]">—</span>}
          </DataRow>
          <QtyTable
            current={containerData?.pallet.quantity ?? null}
            pull={containerData?.container.quantity ?? null}
            remaining={remaining}
            remainingZero={remainingZero}
          />
        </div>

        <div className="flex flex-col gap-2 mt-1">
          <PalletIdField
            ref={pidFieldRef}
            label="Pallet ID"
            value={pidValue}
            onChange={handlePidVerify}
            boxClass="h-[72px] px-5 rounded-[12px]"
            valueClass="text-[32px] font-medium tracking-[0.04em]"
            caretClass="w-[3px] h-[38px]"
            onActiveChange={setPidActive}
            disabled={cidStatus !== 'valid'}
            invalid={pidInvalid}
          />
          {/* Issue #82 — UPC and Location, side by side, replacing the old combined
              Alternate ID field. Each is independently scannable/enterable; confirming
              either alone immediately attempts a verify with just that value. */}
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <FieldDisplay
                label="UPC"
                value={upcField.value}
                onFocus={focusUpcField}
                active={upcField.isActive}
                disabled={cidStatus !== 'valid'}
                invalid={upcInvalid}
              />
            </div>
            <div className="w-px self-stretch bg-[#2A2A2A]" />
            <div className="flex flex-col gap-1">
              <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Location</span>
              <LocationEntryFields
                key={locationEntryKey}
                autoFocus={locationAutoFocusRef.current}
                onResolved={handleLocationVerify}
                onActiveChange={setLocationActive}
                lockedAisle={locationLockedAisle}
                lockedLevel={locationLockedLevel}
                disabled={cidStatus !== 'valid'}
                groupInvalid={locationInvalid}
                onLockedMismatch={handleLocationLockedMismatch}
              />
            </div>
          </div>
        </div>

        {loading && (
          <div className="font-ui text-[16px] text-[#9A9A9A] animate-pulse">Working…</div>
        )}
      </div>

      {/* Right column — session history */}
      <SessionHistoryPanel
        title="Pull History"
        emptyMessage="No pulls this session"
        entries={history}
        keyFn={(_entry, i) => i}
        width="w-[456px]"
        renderRow={(entry) => (
          <>
            <div className="flex items-center justify-between">
              <LiveId type="location" id={entry.location} className="!text-[24px] !font-bold !text-[#FF1A1A]" />
              <span className="font-data text-[12px] text-[#555]">
                {entry.timestamp.toLocaleTimeString()}
              </span>
            </div>
            <span className="font-data text-[15px] text-[#CFCFCF]">
              Pulled {fmtQty(entry.pulledQty)}
            </span>
            <span className="font-data text-[15px] text-[#CFCFCF]">
              {fmtQty(entry.updatedQty)} remaining
            </span>
          </>
        )}
      />

      {holdOpen && holdLocationId && (
        <ModalOverlay backdropClassName="p-8" padding="p-6" cardClassName="max-h-full overflow-y-auto" shadow={false}>
          <HoldPanel locationId={holdLocationId} onDone={() => { setHoldOpen(false); setHoldLocationId(null); }} showClose />
        </ModalOverlay>
      )}

      {levelMismatch && (
        <LevelCorrectionDialog
          scannedLevel={levelMismatch.scannedLevel}
          actualLevel={levelMismatch.actualLevel}
          onConfirm={confirmLevelMismatch}
          onCancel={cancelLevelMismatch}
        />
      )}
    </div>
  );
}

// ── Demo button helper ────────────────────────────────────────────────────────

/**
 * Small colored button rendered in the Footer's demo slot.
 * Used throughout PIP to inject scanner events via deliverScan for demo purposes.
 */
function DemoBtn({
  label,
  color,
  onClick,
}: {
  label: string;
  color: 'green' | 'red' | 'blue' | 'amber';
  onClick: () => void;
}) {
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
      className={`h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium select-none transition-colors ${colors[color]}`}
    >
      {label}
    </button>
  );
}
