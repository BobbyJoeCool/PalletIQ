import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DemoPicker } from '../components/shared/DemoPicker';
import { Dropdown } from '../components/shared/Dropdown';
import { HoldPanel } from '../components/shared/HoldPanel';
import { LocationEntryFields } from '../components/shared/LocationEntryFields';
import { LiveId } from '../components/ui/LiveId';
import { useAuth } from '../context/AuthContext';
import { useDemoSlot } from '../context/FooterDemoContext';
import { useMessageBar } from '../context/MessageBarContext';
import { useNumpad } from '../context/NumpadContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { useNumpadField } from '../lib/useNumpadField';
import { fmtLocation } from '../lib/fmt';

// ── Types ────────────────────────────────────────────────────────────────────

interface Qty { pallets: number; cartons: number; ssps: number }

interface LabelScanResult {
  label: {
    id: string;
    pullFunction: string;
    quantity: Qty;
    dpci: string;
    descShort: string;
  };
  pallet: { id: number; quantity: Qty };
  location: { id: string | null };
}

interface HistoryEntry {
  location: string;
  pulledQty: Qty;
  updatedQty: Qty;
  timestamp: Date;
}

const PULL_FUNCTIONS: { code: string; desc: string }[] = [
  { code: 'CA', desc: 'Carton Air' },
  { code: 'CF', desc: 'Carton Floor' },
  { code: 'FP', desc: 'Full Pallet' },
];

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
 * Pull (quantity requested by the label), and — once verification has computed it —
 * Remaining below a divider. Any Remaining cell at 0 is shown in red, matching the old
 * highlight behavior, to alert the worker a unit type is fully depleted.
 *
 * The Carton column is emphasized (~33% larger, info blue) over Pallet/SSP — cartons are
 * what a worker is counting out by hand on most pulls, so it's the number most worth
 * making easy to read at a glance; a depleted-Carton cell still falls back to the same
 * red-on-zero warning as every other column.
 */
function QtyTable({ current, pull, remaining, remainingZero }: { current: Qty; pull: Qty; remaining: Qty | null; remainingZero?: boolean }) {
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
            {current[key]}
          </span>
        ))}

        <span className="font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">Pull</span>
        {QTY_COLS.map(({ key }) => (
          <span
            key={key}
            className={`font-data font-semibold text-center ${key === 'cartons' ? 'text-[27px] text-[#5B9BD5]' : 'text-[20px] text-white'}`}
          >
            {pull[key]}
          </span>
        ))}

        {remaining && (
          <>
            <div className="col-span-4 border-t border-[#333] my-0.5" />
            <span className="font-ui text-[15px] font-semibold text-[#9A9A9A] uppercase tracking-wider">Remaining</span>
            {QTY_COLS.map(({ key }) => {
              const depleted = remainingZero && remaining[key] === 0;
              const emphasized = key === 'cartons';
              return (
                <span
                  key={key}
                  className={`font-data font-bold text-center ${emphasized ? 'text-[29px]' : 'text-[22px]'} ${
                    depleted ? 'text-[#CC0000]' : emphasized ? 'text-[#5B9BD5]' : 'text-white'
                  }`}
                >
                  {remaining[key]}
                </span>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

/** Single labeled data row in the pull-data panel — displays plain text or an inline component. */
function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-[#1A1A1A]">
      <span className="w-[160px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">
        {label}
      </span>
      <div className="font-data text-[22px] text-white">{children}</div>
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
 */
function FieldDisplay({
  label,
  value,
  onFocus,
  active = false,
  disabled = false,
  compact = false,
}: {
  label: string;
  value: string;
  onFocus: () => void;
  active?: boolean;
  disabled?: boolean;
  compact?: boolean;
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
        className={`flex items-center ${compact ? 'h-[60px] px-4' : 'h-[72px] px-5'} rounded-[12px] bg-[#0D0D0D] border-2 disabled:opacity-40 transition-colors ${active && !disabled ? 'border-[#CC0000]' : 'border-[#3A3A3A] hover:border-[#555]'}`}
      >
        <span className={`font-data ${compact ? 'text-[26px]' : 'text-[32px]'} font-medium text-white tracking-[0.04em]`}>
          {value || <span className="text-[#444]">—</span>}
        </span>
        {active && !disabled && (
          <span className={`inline-block w-[3px] ${compact ? 'h-[30px]' : 'h-[38px]'} bg-[#CC0000] ml-2 animate-pulse rounded-sm`} />
        )}
      </button>
    </div>
  );
}

// ── PIP Screen ───────────────────────────────────────────────────────────────

type ScreenState = 'ready' | 'verifying';

/**
 * Pallet ID Pull (PIP) screen.
 * Two-state flow: ready → verifying. Pull Function is a persistent dropdown at the top of
 * the screen (defaults to the first option) rather than a separate initial step — Label/
 * PID/UPC/Location are always reachable, and changing the function is just a dropdown
 * selection away rather than a full-screen mode switch.
 *
 * ready: Label field is active. Scanning a label validates it via GET /api/labels/:id and
 *   checks that its pullFunction matches the selected one. On match, transitions to verifying.
 * verifying: Shows label/pallet/remaining quantities. Worker scans any one of:
 *   - Pallet ID field → POST /api/pulls/verify with palletId
 *   - UPC field → POST /api/pulls/verify with upc
 *   - Location field → POST /api/pulls/verify with location (issue #82 — split from a
 *     single combined Alternate ID field into independent UPC/Location fields)
 *   Any path marks the label PULLED, deducts quantities, and on success appends the
 *   pull to the session history and returns to ready. Scanning a new label while in verifying
 *   discards the unverified label and reloads with the new one.
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
 * kept local to this file rather than extracted into a shared component — MNP's version
 * has no Cancel action (collecting a level there is mandatory, not a correction the
 * worker can back out of), so the two components' needs already diverge.
 */
function LevelCorrectionDialog({
  scannedLevel, actualLevel, onConfirm, onCancel,
}: { scannedLevel: number; actualLevel: number; onConfirm: (level: number) => void; onCancel: () => void }) {
  const [input, setInput] = useState('');

  /** Appends a digit to the level input, capped at 2 digits. */
  function pressDigit(d: string) {
    setInput((v) => (v.length >= 2 ? v : v + d));
  }
  /** Removes the last digit from the level input. */
  function backspace() {
    setInput((v) => v.slice(0, -1));
  }
  /** Accepts the typed level as-is (no validation against real data) and reports it. */
  function confirm() {
    const level = parseInt(input, 10);
    if (!input || isNaN(level) || level <= 0) return;
    onConfirm(level);
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div data-testid="level-correction-dialog" className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-[20px] p-8 w-[520px] shadow-2xl">
        <h2 className="font-ui text-[22px] font-semibold text-white text-center mb-3">
          What level was this pallet actually pulled from?
        </h2>
        <p className="font-ui text-[15px] text-[#9A9A9A] text-center mb-5">
          You scanned Level {scannedLevel}, but this pallet's recorded location is Level {actualLevel}.
        </p>

        <div className="flex items-center justify-center h-[64px] mb-5 rounded-[12px] bg-[#0D0D0D] border-2 border-[#3A3A3A]">
          <span className="font-data text-[36px] font-medium text-white tracking-[0.1em]">
            {input || <span className="text-[#444]">—</span>}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {keys.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => pressDigit(d)}
              className="h-[64px] rounded-[14px] bg-[#1F1F1F] border border-[#2C2C2C] text-white font-data text-[26px] font-medium hover:border-[#555] transition-colors active:scale-95"
            >
              {d}
            </button>
          ))}
          <button type="button" onClick={backspace} className="h-[64px] rounded-[14px] bg-[#1F1F1F] border border-[#2C2C2C] text-white font-ui text-[18px] font-medium hover:border-[#555] transition-colors active:scale-95">
            ⌫
          </button>
          <button type="button" onClick={() => pressDigit('0')} className="h-[64px] rounded-[14px] bg-[#1F1F1F] border border-[#2C2C2C] text-white font-data text-[26px] font-medium hover:border-[#555] transition-colors active:scale-95">
            0
          </button>
          <span />
        </div>

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
      </div>
    </div>
  );
}

export function PIPPage() {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const { deliverScan } = useNumpad();

  const [screenState, setScreenState] = useState<ScreenState>('ready');
  const [pullFunction, setPullFunction] = useState<string>(PULL_FUNCTIONS[0].code);
  const [labelData, setLabelData] = useState<LabelScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  // Quick-hold panel (WLH.md: "surfaced as a quick-action on PIP, SDP, and MNP" —
  // inline, not a full navigation) for the scanned label's resolved location.
  const [holdOpen, setHoldOpen] = useState(false);
  // Pending FP level-mismatch confirmation (issue #49) — set by handleLocationVerify on
  // LEVEL_MISMATCH, resolved by confirmLevelMismatch/cancelLevelMismatch.
  const [levelMismatch, setLevelMismatch] = useState<{ scannedLevel: number; actualLevel: number; locationValue: string } | null>(null);
  // Demo-only "which invalid label" picker (shared DemoPicker component) — see
  // pickInvalidLabel's comment.
  const [invalidLabelPickerOpen, setInvalidLabelPickerOpen] = useState(false);

  const labelField    = useNumpadField();
  const pidField      = useNumpadField();
  // Issue #82 — UPC and Location replace the old single Alternate ID field; each is
  // independently scannable/enterable (one-active-field-at-a-time, same as everywhere
  // else), and confirming either alone immediately attempts a verify with just that value.
  const upcField      = useNumpadField();
  // Location is the shared 3-box Aisle/Bin/Level component (also used by PAR/WLH/LII)
  // rather than a useNumpadField() — it manages its own three internal fields, so state
  // that used to live on a single field object is tracked separately here. `locationActive`
  // mirrors the other fields' `.isActive` for the demo-footer gating below; `locationEntryKey`
  // forces a full remount (clearing all three boxes) on error/retry/reset, and
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
  const labelDataRef     = useRef(labelData);
  const pullFunctionRef  = useRef(pullFunction);
  screenStateRef.current  = screenState;
  loadingRef.current      = loading;
  labelDataRef.current    = labelData;
  pullFunctionRef.current = pullFunction;

  // ── Handlers ──────────────────────────────────────────────────────────────

  /**
   * Handles a Pull Function change from the dropdown. A no-op if the same value is
   * re-selected (tapping the dropdown open and picking the current function shouldn't
   * disrupt an in-progress verification). Otherwise resets back to ready — warning about
   * and discarding any unverified label first, matching the old full-screen selector's
   * "changing function abandons the current label" behavior — clears the Label field, and
   * refocuses it for the next scan under the new function.
   */
  function handlePullFunctionChange(fn: string) {
    if (fn === pullFunctionRef.current) return;
    if (screenStateRef.current === 'verifying') {
      setMessage({ type: 'warning', text: 'Label not verified' });
      setLabelData(null);
      pidField.clear();
      upcField.clear();
      resetLocationField(false);
    }
    setPullFunction(fn);
    setScreenState('ready');
    labelField.clear();
    setTimeout(() => focusLabelField(), 50);
  }

  /** Registers the Label field's numpad handler, wired to handleLabelScan on confirm. */
  const focusLabelField = useCallback(() => {
    labelField.focus(handleLabelScan);
  }, [labelField]);

  /** Registers the Pallet ID field's numpad handler, wired to handlePidVerify on confirm. */
  const focusPidField = useCallback(() => {
    suppressAutoPidFocusRef.current = true;
    pidField.focus(handlePidVerify);
  }, [pidField]);

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
   * Submit handler for the label field. Calls GET /api/labels/:id.
   * If the label's pull function doesn't match the selected one, rejects it with an error.
   * If already in verifying state (rescan), warns about the unverified label before replacing it.
   * On success, stores the label data and transitions to verifying state.
   */
  async function handleLabelScan(value: string) {
    const v = value.trim();
    const priorState = screenStateRef.current;
    if (!v || loadingRef.current || (priorState !== 'ready' && priorState !== 'verifying')) return;
    // The Label field's displayed value is intentionally never cleared after a successful
    // scan (so a worker can tap it again to see what's loaded, or to refocus it for a real
    // rescan — see the "rescanning while verifying" test). That stale value is exactly what
    // NumpadContext's setKeyHandler resubmits as a synthetic 'Enter' whenever focus moves
    // away from this field automatically (e.g. the verifying-entry effect auto-focusing
    // PID) — without this check, that non-user-initiated resubmission of the SAME
    // already-loaded label re-enters this "already verifying" branch below, clearing
    // PID/UPC/Location and scheduling *another* delayed auto-focus-PID call, cascading into
    // an unpredictable focus race. A genuine rescan always delivers a *different* label id.
    if (priorState === 'verifying' && labelDataRef.current?.label.id === v) return;
    if (priorState === 'verifying') {
      // No message-bar update here — scanning the next label while the previous one was still
      // unverified is a normal part of the fast scan-then-verify-in-batch workflow, not an error
      // condition. Overwriting whatever's already showing (e.g. the previous pull's success
      // message) with a "Label not verified" warning on every plain rescan is what issue #45
      // actually reported; the fields still get cleared to make way for the new label's data.
      pidField.clear();
      upcField.clear();
      resetLocationField(false);
    }
    setLoading(true);
    try {
      const data = await apiFetch<LabelScanResult>(`/api/labels/${encodeURIComponent(v)}`, token!);
      if (data.label.pullFunction !== pullFunctionRef.current) {
        playAlert('error');
        // Value stays visible (not cleared) so the worker can see what they scanned;
        // re-focusing (not clearing) still arms a fresh start for the next input, so a
        // manual retry replaces rather than appends onto the stale value.
        focusLabelField();
        setMessage({ type: 'error', text: `Wrong function — label requires ${data.label.pullFunction}` });
        return;
      }
      setLabelData(data);
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
      // the Wrong Function branch above for why focusLabelField() (not .clear()) is what
      // arms a fresh start for the next input.
      focusLabelField();
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
   * On mismatch (PALLET_MISMATCH), clears and re-focuses the PID field for retry.
   * On success, calls onPullSuccess.
   */
  async function handlePidVerify(value: string) {
    const v = value.trim();
    if (!v || loadingRef.current) return;
    const ld = labelDataRef.current;
    if (!ld) return;
    setLoading(true);
    try {
      const result = await apiFetch<{ location: string; updatedQuantity: Qty }>(
        '/api/pulls/verify',
        token!,
        { method: 'POST', body: JSON.stringify({ labelId: ld.label.id, pullFunction: pullFunctionRef.current, palletId: v }) },
      );
      onPullSuccess(result.location, ld.label.quantity, result.updatedQuantity);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      playAlert('error');
      pidField.clear();
      pidField.focus(handlePidVerify);
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
   * On mismatch (ALTERNATE_MISMATCH), clears and re-focuses the UPC field for retry.
   * On success, calls onPullSuccess.
   */
  async function handleUpcVerify(value: string) {
    const v = value.trim();
    if (!v || loadingRef.current) return;
    const ld = labelDataRef.current;
    if (!ld) return;
    setLoading(true);
    try {
      const result = await apiFetch<{ location: string; updatedQuantity: Qty }>(
        '/api/pulls/verify',
        token!,
        { method: 'POST', body: JSON.stringify({ labelId: ld.label.id, pullFunction: pullFunctionRef.current, upc: v }) },
      );
      onPullSuccess(result.location, ld.label.quantity, result.updatedQuantity);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      playAlert('error');
      upcField.clear();
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
   * (ALTERNATE_MISMATCH), clears and re-focuses Location for retry. On success, calls
   * onPullSuccess.
   */
  async function handleLocationVerify(value: string, wasScanned: boolean) {
    const v = value.trim();
    if (!v || loadingRef.current) return;
    const ld = labelDataRef.current;
    if (!ld) return;
    setLoading(true);
    try {
      const result = await apiFetch<{ location: string; updatedQuantity: Qty }>(
        '/api/pulls/verify',
        token!,
        { method: 'POST', body: JSON.stringify({ labelId: ld.label.id, pullFunction: pullFunctionRef.current, location: v, wasScanned }) },
      );
      onPullSuccess(result.location, ld.label.quantity, result.updatedQuantity);
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
      resetLocationField(true);
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
   * Worker typed the level this pallet was actually pulled from (issue #72 — collects a
   * correction rather than just confirming/rejecting the mismatch). Replaces the
   * originally-scanned level with that correction (aisle+bin unchanged) and resubmits
   * with confirmLevelMismatch: true; the corrected level is accepted as-is, no further
   * validation against real data. Only reachable via a scanned Full Pallet mismatch (see
   * handleLocationVerify), so wasScanned is always true on the resubmit.
   */
  async function confirmLevelMismatch(correctedLevel: number) {
    const pending = levelMismatch;
    const ld = labelDataRef.current;
    setLevelMismatch(null);
    if (!pending || !ld) return;
    setLoading(true);
    try {
      const correctedLocation = pending.locationValue.slice(0, 6) + String(correctedLevel).padStart(2, '0');
      const result = await apiFetch<{ location: string; updatedQuantity: Qty }>(
        '/api/pulls/verify',
        token!,
        { method: 'POST', body: JSON.stringify({ labelId: ld.label.id, pullFunction: pullFunctionRef.current, location: correctedLocation, confirmLevelMismatch: true, wasScanned: true }) },
      );
      onPullSuccess(result.location, ld.label.quantity, result.updatedQuantity);
    } catch {
      playAlert('error');
      resetLocationField(true);
      setMessage({ type: 'error', text: 'Verification failed — please try again' });
    } finally {
      setLoading(false);
    }
  }

  /** Worker declined to confirm the FP level mismatch — treat it like any other invalid Location. */
  function cancelLevelMismatch() {
    setLevelMismatch(null);
    playAlert('error');
    resetLocationField(true);
    setMessage({ type: 'error', text: 'Invalid Location' });
  }

  /**
   * Called after a successful pull verification. Plays a success sound, appends a history entry,
   * shows the pull location and remaining quantity in the message bar, then resets all fields
   * and returns to ready state for the next label scan.
   *
   * Re-focuses the Label field synchronously here rather than relying solely on the 'ready'
   * effect's 50ms-delayed focusLabelField() call below — that delay leaves a window where the
   * PID/Alt field (just cleared, but never explicitly released as NumpadContext's active
   * handler) is still what a scan gets delivered to. A fast barcode-scanner scan of the next
   * label can land inside that window, hitting the stale PID/Alt handler instead of
   * handleLabelScan — which is what was producing issue #45's spurious "Label not verified"
   * warning even after a pull had already verified successfully: the scan silently mis-routed
   * to the (now-empty) PID field, no-op'd there, and only the *following* real scan attempt hit
   * handleLabelScan while still carrying leftover verifying-adjacent state. Registering the
   * Label handler immediately closes that window; the 'ready' effect's own call afterward is a
   * harmless redundant no-op re-registration.
   */
  function onPullSuccess(location: string, pulledQty: Qty, updatedQty: Qty) {
    playAlert('info');
    setHistory(h => [{ location, pulledQty, updatedQty, timestamp: new Date() }, ...h]);
    setMessage({ type: 'success', text: `Last Pull ${fmtLocation(location)} — ${fmtQty(updatedQty)}` });
    setLabelData(null);
    setScreenState('ready');
    labelField.clear();
    pidField.clear();
    upcField.clear();
    resetLocationField(false);
    focusLabelField();
  }

  // ── Focus management by screen state ─────────────────────────────────────

  useEffect(() => {
    if (screenState !== 'ready') return;
    // Only fires on state entry — omitting focusLabelField from deps is intentional.
    // Adding it causes the effect to re-run on every render within 'ready'.
    const id = setTimeout(() => focusLabelField(), 50);
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

  /** Fetches a real label id (matching the selected pull function) and delivers it as a simulated scan. */
  const demoScanLabel = useCallback(async () => {
    try {
      const { labelId } = await apiFetch<{ labelId: string }>(`/api/demo/label?fn=${pullFunction}`, token!);
      deliverScan(labelId);
    } catch (err) {
      setMessage({ type: 'error', text: `Demo label: ${err instanceof Error ? err.message : 'unavailable'}` });
    }
  }, [token, deliverScan, setMessage, pullFunction]);

  /** Delivers a label id that doesn't exist, simulating a not-found scan. */
  const demoBadLabel = useCallback(() => {
    deliverScan('INVALID-LABEL-000');
  }, [deliverScan]);

  /**
   * Dispatches the shared DemoPicker's choice — consolidates what used to be four
   * separate demo callbacks (Wrong Function / Pulled / Canceled / Purged) behind one
   * "Invalid Label" footer button plus this popup, to keep the footer's single row from
   * getting crowded. Wrong Function fetches a real label for a different pull function
   * (demonstrates handleLabelScan's FN_CHECK path); the other three fetch a label already
   * in that terminal status (demonstrates the "Invalid status: {status}" path, which a
   * worker can't otherwise reach by scanning normally).
   */
  const pickInvalidLabel = useCallback(async (kind: 'wrongFn' | 'pulled' | 'canceled' | 'purged') => {
    setInvalidLabelPickerOpen(false);
    try {
      const query = kind === 'wrongFn'
        ? `fn=${PULL_FUNCTIONS.find(f => f.code !== pullFunction)?.code ?? ''}`
        : `status=${{ pulled: 'PULLED', canceled: 'CANCELED', purged: 'PURGED' }[kind]}`;
      const { labelId } = await apiFetch<{ labelId: string }>(`/api/demo/label?${query}`, token!);
      deliverScan(labelId);
    } catch (err) {
      setMessage({ type: 'error', text: `Demo label: ${err instanceof Error ? err.message : 'unavailable'}` });
    }
  }, [token, deliverScan, setMessage, pullFunction]);

  /** Delivers the current label's actual pallet id, simulating a correct verification scan. */
  const demoScanPid = useCallback(() => {
    const ld = labelDataRef.current;
    if (ld) deliverScan(String(ld.pallet.id));
  }, [deliverScan]);

  /** Delivers a pallet id that won't match the current label, simulating a mismatch. */
  const demoBadPid = useCallback(() => {
    deliverScan('INVALID-PID-000');
  }, [deliverScan]);

  /**
   * Fetches the current label's item UPC (by its DPCI) and delivers it, simulating a
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
    const ld = labelDataRef.current;
    if (!ld) return;
    try {
      const item = await apiFetch<{ upc: string }>(`/api/items/dpci/${ld.label.dpci}`, token!);
      focusUpcField();
      deliverScan(item.upc);
    } catch {
      setMessage({ type: 'error', text: 'Demo UPC unavailable' });
    }
  }, [token, deliverScan, setMessage, focusUpcField]);

  /** Delivers a UPC that won't match the current label, simulating a mismatch. */
  const demoBadUpc = useCallback(() => {
    deliverScan('000000000000');
  }, [deliverScan]);

  /** Delivers the current label's resolved location barcode, simulating a correct location verification scan. */
  const demoScanLocation = useCallback(() => {
    const ld = labelDataRef.current;
    if (ld?.location.id) deliverScan(ld.location.id); // raw 8-digit barcode, no dashes
  }, [deliverScan]);

  /** Delivers a location that won't match the current label, simulating a mismatch. */
  const demoBadLocation = useCallback(() => {
    deliverScan('00000000'); // 8 digits — must be exactly 8 to hit LocationEntryFields' full-barcode-scan path
  }, [deliverScan]);

  // Memoized so the JSX reference is stable across renders that don't change which
  // field is active — useDemoSlot's re-sync effect keys off this reference, and an
  // unmemoized JSX literal would recreate it (and re-fire the effect) on every render,
  // looping forever via the FooterDemoContext state update it triggers.
  const demoSlot = useMemo(() => (
    labelField.isActive ? (
      <>
        <DemoBtn label="✓ Scan Label" color="green" onClick={demoScanLabel} />
        <DemoBtn label="✗ Scan Label" color="red"   onClick={demoBadLabel} />
        <DemoBtn label="⚠ Invalid Label" color="amber" onClick={() => setInvalidLabelPickerOpen(true)} />
      </>
    ) : pidField.isActive ? (
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
    labelField.isActive, pidField.isActive, upcField.isActive, locationActive,
    demoScanLabel, demoBadLabel,
    demoScanPid, demoBadPid, demoScanUpc, demoBadUpc, demoScanLocation, demoBadLocation,
  ]);

  useDemoSlot(demoSlot);

  // ── Computed values for State 2 ───────────────────────────────────────────

  const remaining: Qty | null = labelData
    ? {
        pallets: Math.max(0, labelData.pallet.quantity.pallets - labelData.label.quantity.pallets),
        cartons: Math.max(0, labelData.pallet.quantity.cartons - labelData.label.quantity.cartons),
        ssps:    Math.max(0, labelData.pallet.quantity.ssps    - labelData.label.quantity.ssps),
      }
    : null;

  const remainingZero = remaining
    ? remaining.pallets === 0 || remaining.cartons === 0 || remaining.ssps === 0
    : false;

  // Hand-entered Location locks Aisle across every pull function — re-typing it doesn't
  // add verification value, the worker already knows their aisle by other means — pulled
  // from the label already loaded rather than typed. Carton Floor additionally locks
  // Level too, since only its Bin actually needs verifying (product decision); CA/FP
  // still require Bin and Level to be genuinely typed and checked. All boxes stay visible
  // for layout consistency; a full location is always reconstructed underneath regardless
  // of which boxes are locked.
  const locationLockedAisle = labelData?.location.id ? labelData.location.id.slice(0, 3) : undefined;
  const locationLockedLevel = pullFunction === 'CF' && labelData?.location.id ? labelData.location.id.slice(6, 8) : undefined;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 flex select-none">
      {/* Left column — workflow content */}
      <div className="flex-1 flex flex-col p-5 gap-3 overflow-y-auto">

        {/* Pull Function — persistent dropdown, always reachable; changing it mid-
            verification discards the unverified label (handlePullFunctionChange). */}
        <div className="flex items-center gap-3">
          <Dropdown
            label="Pull Function"
            value={pullFunction}
            options={PULL_FUNCTIONS.map(fn => ({ value: fn.code, label: `${fn.code} — ${fn.desc}` }))}
            onChange={handlePullFunctionChange}
          />
          {labelData?.location.id && (
            <button
              type="button"
              onClick={() => setHoldOpen(true)}
              className="ml-auto h-[38px] px-4 rounded-[8px] font-ui text-[14px] font-medium border border-[#3A3A3A] text-[#9A9A9A] hover:border-[#555] hover:text-white transition-colors"
            >
              Hold
            </button>
          )}
        </div>

        {/* Label input */}
        <FieldDisplay
          label="Scan Label"
          value={labelField.value}
          onFocus={focusLabelField}
          active={labelField.isActive}
        />

        {/* State 2 — scan data + verification */}
        {screenState === 'verifying' && labelData && (
          <>
                <div className="flex flex-col mt-1">
                  <DataRow label="Location">
                    {labelData.location.id
                      ? (
                        <span className="inline-flex px-3 py-1 rounded-[10px] bg-[#CC0000]/10 border-2 border-[#CC0000]/40">
                          <LiveId type="location" id={labelData.location.id} className="!text-[46px] !font-bold !text-[#FF1A1A]" />
                        </span>
                      )
                      : <span className="text-[#9A9A9A]">—</span>}
                  </DataRow>
                  <DataRow label="Item">{labelData.label.descShort}</DataRow>
                  <DataRow label="DPCI"><LiveId type="dpci" id={labelData.label.dpci} /></DataRow>
                  <QtyTable
                    current={labelData.pallet.quantity}
                    pull={labelData.label.quantity}
                    remaining={remaining}
                    remainingZero={remainingZero}
                  />
                </div>

                <div className="flex flex-col gap-2 mt-1">
                  <FieldDisplay
                    label="Pallet ID"
                    value={pidField.value}
                    onFocus={focusPidField}
                    active={pidField.isActive}
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
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

        {loading && (
          <div className="font-ui text-[16px] text-[#9A9A9A] animate-pulse">Working…</div>
        )}
      </div>

      {/* Right column — session history */}
      <div className="w-[456px] flex flex-col border-l border-[#1C1C1C] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1C1C1C]">
          <span className="font-ui text-[14px] font-semibold text-[#9A9A9A] uppercase tracking-wider">
            Pull History
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {history.length === 0 ? (
            <p className="px-5 py-4 font-ui text-[15px] text-[#555]">No pulls this session</p>
          ) : (
            history.map((entry, i) => (
              <div key={i} className="px-5 py-3 border-b border-[#111] flex flex-col gap-1">
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
              </div>
            ))
          )}
        </div>
      </div>

      {holdOpen && labelData?.location.id && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
          <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-[20px] p-6 max-h-full overflow-y-auto">
            <HoldPanel locationId={labelData.location.id} onDone={() => setHoldOpen(false)} showClose />
          </div>
        </div>
      )}

      {levelMismatch && (
        <LevelCorrectionDialog
          scannedLevel={levelMismatch.scannedLevel}
          actualLevel={levelMismatch.actualLevel}
          onConfirm={confirmLevelMismatch}
          onCancel={cancelLevelMismatch}
        />
      )}

      {invalidLabelPickerOpen && (
        <DemoPicker
          title="Simulate which invalid label?"
          options={[
            { key: 'wrongFn', label: 'Wrong Function' },
            { key: 'pulled', label: 'Pulled Label' },
            { key: 'canceled', label: 'Canceled Label' },
            { key: 'purged', label: 'Purged Label' },
          ]}
          onPick={pickInvalidLabel}
          onCancel={() => setInvalidLabelPickerOpen(false)}
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
