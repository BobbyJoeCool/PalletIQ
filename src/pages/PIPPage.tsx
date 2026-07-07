import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HoldPanel } from '../components/shared/HoldPanel';
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

/**
 * A labeled quantity row showing pallets / cartons / SSPs as three numeric cells.
 * When `highlight` is true, any cell with a value of 0 is shown in red to alert the
 * worker that a unit type is fully depleted.
 */
function QtyRow({ label, qty, highlight }: { label: string; qty: Qty; highlight?: boolean }) {
  const cells = [
    { unit: 'Pallets', val: qty.pallets },
    { unit: 'Cartons', val: qty.cartons },
    { unit: 'SSPs',    val: qty.ssps },
  ];
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-[#1A1A1A]">
      <span className="w-[160px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider pt-1">
        {label}
      </span>
      <div className="flex gap-6">
        {cells.map(({ unit, val }) => (
          <div key={unit} className="flex flex-col items-end">
            <span className={`font-data text-[26px] font-semibold ${highlight && val === 0 ? 'text-[#CC0000]' : 'text-white'}`}>
              {val}
            </span>
            <span className="font-ui text-[12px] text-[#555]">{unit}</span>
          </div>
        ))}
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

// ── PIP Screen ───────────────────────────────────────────────────────────────

type ScreenState = 'selectFunction' | 'ready' | 'verifying';

/**
 * Pallet ID Pull (PIP) screen.
 * Three-state flow: selectFunction → ready → verifying.
 *
 * selectFunction: Worker picks a pull function (CA/CF/FP). Advances to ready.
 * ready: Label field is active. Scanning a label validates it via GET /api/labels/:id and
 *   checks that its pullFunction matches the selected one. On match, transitions to verifying.
 * verifying: Shows label/pallet/remaining quantities. Worker scans either:
 *   - Pallet ID field → POST /api/pulls/verify with palletId
 *   - Alternate ID field → POST /api/pulls/verify with alternateId (UPC or location barcode)
 *   Either path marks the label PULLED, deducts quantities, and on success appends the
 *   pull to the session history and returns to ready. Scanning a new label while in verifying
 *   discards the unverified label and reloads with the new one.
 *
 * Demo buttons track the active numpad field and always show one success and one failure scenario.
 * All scanner input flows through NumpadContext.deliverScan().
 */
export function PIPPage() {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const { deliverScan } = useNumpad();

  const [screenState, setScreenState] = useState<ScreenState>('selectFunction');
  const [pullFunction, setPullFunction] = useState<string | null>(null);
  const [labelData, setLabelData] = useState<LabelScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  // Quick-hold panel (WLH.md: "surfaced as a quick-action on PIP, SDP, and MNP" —
  // inline, not a full navigation) for the scanned label's resolved location.
  const [holdOpen, setHoldOpen] = useState(false);

  const labelField = useNumpadField();
  const pidField   = useNumpadField();
  const altField   = useNumpadField();

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

  /** Sets the chosen pull function and transitions from selectFunction → ready state. */
  function handleSelectFunction(fn: string) {
    setPullFunction(fn);
    setScreenState('ready');
    setTimeout(() => focusLabelField(), 60);
  }

  /** Registers the Label field's numpad handler, wired to handleLabelScan on confirm. */
  const focusLabelField = useCallback(() => {
    labelField.focus(handleLabelScan);
  }, [labelField]);

  /** Registers the Pallet ID field's numpad handler, wired to handlePidVerify on confirm. */
  const focusPidField = useCallback(() => {
    pidField.focus(handlePidVerify);
  }, [pidField]);

  /** Registers the Alternate ID field's numpad handler, wired to handleAltVerify on confirm. */
  const focusAltField = useCallback(() => {
    altField.focus(handleAltVerify);
  }, [altField]);

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
    if (priorState === 'verifying') {
      setMessage({ type: 'warning', text: 'Label not verified' });
      pidField.clear();
      altField.clear();
    }
    setLoading(true);
    try {
      const data = await apiFetch<LabelScanResult>(`/api/labels/${encodeURIComponent(v)}`, token!);
      if (data.label.pullFunction !== pullFunctionRef.current) {
        playAlert('error');
        labelField.clear();
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
      labelField.clear();
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
   * Submit handler for the Alternate ID field. Calls POST /api/pulls/verify with alternateId
   * (the backend tries UPC match then location barcode match in that order).
   * On mismatch (ALTERNATE_MISMATCH), clears and re-focuses the Alt ID field for retry.
   * On success, calls onPullSuccess.
   */
  async function handleAltVerify(value: string) {
    const v = value.trim();
    if (!v || loadingRef.current) return;
    const ld = labelDataRef.current;
    if (!ld) return;
    setLoading(true);
    try {
      const result = await apiFetch<{ location: string; updatedQuantity: Qty }>(
        '/api/pulls/verify',
        token!,
        { method: 'POST', body: JSON.stringify({ labelId: ld.label.id, pullFunction: pullFunctionRef.current, alternateId: v }) },
      );
      onPullSuccess(result.location, ld.label.quantity, result.updatedQuantity);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      playAlert('error');
      altField.clear();
      altField.focus(handleAltVerify);
      if (code === 'ALTERNATE_MISMATCH') {
        setMessage({ type: 'error', text: 'Invalid Alternate ID' });
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
   * Called after a successful pull verification. Plays a success sound, appends a history entry,
   * shows the pull location and remaining quantity in the message bar, then resets all fields
   * and returns to ready state for the next label scan.
   */
  function onPullSuccess(location: string, pulledQty: Qty, updatedQty: Qty) {
    playAlert('info');
    setHistory(h => [{ location, pulledQty, updatedQty, timestamp: new Date() }, ...h]);
    setMessage({ type: 'success', text: `Last Pull ${fmtLocation(location)} — ${fmtQty(updatedQty)}` });
    setLabelData(null);
    setScreenState('ready');
    labelField.clear();
    pidField.clear();
    altField.clear();
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
    const id = setTimeout(() => focusPidField(), 50);
    return () => clearTimeout(id);
  }, [screenState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Demo buttons ──────────────────────────────────────────────────────────

  /** Fetches a real label id (matching the selected pull function) and delivers it as a simulated scan. */
  const demoScanLabel = useCallback(async () => {
    try {
      const fnParam = pullFunction ? `?fn=${pullFunction}` : '';
      const { labelId } = await apiFetch<{ labelId: string }>(`/api/demo/label${fnParam}`, token!);
      deliverScan(labelId);
    } catch (err) {
      setMessage({ type: 'error', text: `Demo label: ${err instanceof Error ? err.message : 'unavailable'}` });
    }
  }, [token, deliverScan, setMessage, pullFunction]);

  /** Delivers a label id that doesn't exist, simulating a not-found scan. */
  const demoBadLabel = useCallback(() => {
    deliverScan('INVALID-LABEL-000');
  }, [deliverScan]);

  /** Delivers the current label's actual pallet id, simulating a correct verification scan. */
  const demoScanPid = useCallback(() => {
    const ld = labelDataRef.current;
    if (ld) deliverScan(String(ld.pallet.id));
  }, [deliverScan]);

  /** Delivers a pallet id that won't match the current label, simulating a mismatch. */
  const demoBadPid = useCallback(() => {
    deliverScan('INVALID-PID-000');
  }, [deliverScan]);

  /** Delivers the current label's resolved location barcode, simulating a correct alternate-ID verification scan. */
  const demoScanAlt = useCallback(() => {
    const ld = labelDataRef.current;
    if (ld?.location.id) deliverScan(ld.location.id); // raw 8-digit barcode, no dashes
  }, [deliverScan]);

  /** Delivers an alternate id that won't match the current label, simulating a mismatch. */
  const demoBadAlt = useCallback(() => {
    deliverScan('000000000');
  }, [deliverScan]);

  // Memoized so the JSX reference is stable across renders that don't change which
  // field is active — useDemoSlot's re-sync effect keys off this reference, and an
  // unmemoized JSX literal would recreate it (and re-fire the effect) on every render,
  // looping forever via the FooterDemoContext state update it triggers.
  const demoSlot = useMemo(() => (
    screenState === 'selectFunction' ? null :
    labelField.isActive ? (
      <>
        <DemoBtn label="✓ Scan Label" color="green" onClick={demoScanLabel} />
        <DemoBtn label="✗ Scan Label" color="red"   onClick={demoBadLabel} />
      </>
    ) : pidField.isActive ? (
      <>
        <DemoBtn label="✓ Scan PID" color="green" onClick={demoScanPid} />
        <DemoBtn label="✗ Scan PID" color="red"   onClick={demoBadPid} />
      </>
    ) : altField.isActive ? (
      <>
        <DemoBtn label="✓ Alt ID" color="green" onClick={demoScanAlt} />
        <DemoBtn label="✗ Alt ID" color="red"   onClick={demoBadAlt} />
      </>
    ) : null
  ), [
    screenState, labelField.isActive, pidField.isActive, altField.isActive,
    demoScanLabel, demoBadLabel, demoScanPid, demoBadPid, demoScanAlt, demoBadAlt,
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 flex select-none">
      {/* Left column — workflow content */}
      <div className="flex-1 flex flex-col p-5 gap-3 overflow-y-auto">

        {screenState === 'selectFunction' ? (
          /* Function selector */
          <div className="flex flex-col gap-4">
            <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider">
              Pull Function
            </span>
            <div className="flex flex-col gap-3">
              {PULL_FUNCTIONS.map(fn => (
                <button
                  key={fn.code}
                  type="button"
                  onClick={() => handleSelectFunction(fn.code)}
                  className="flex items-center gap-5 h-[72px] px-5 rounded-[12px] bg-[#0D0D0D] border-2 border-[#3A3A3A] hover:border-[#CC0000] transition-colors"
                >
                  <span className="font-data text-[32px] font-medium text-white w-[48px]">{fn.code}</span>
                  <span className="font-ui text-[18px] text-[#9A9A9A]">{fn.desc}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Selected function indicator — tap to change */}
            <div className="flex items-center gap-3">
              <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider">
                Pull Function
              </span>
              <button
                type="button"
                onClick={() => {
                  if (screenStateRef.current === 'verifying') {
                    setMessage({ type: 'warning', text: 'Label not verified' });
                    setLabelData(null);
                    pidField.clear();
                    altField.clear();
                  }
                  labelField.clear();
                  setScreenState('selectFunction');
                }}
                className="font-data text-[18px] font-semibold text-white px-3 py-1 rounded-[6px] bg-[#1A1A1A] border border-[#3A3A3A] hover:border-[#CC0000] transition-colors"
              >
                {pullFunction}
              </button>
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
                      ? <LiveId type="location" id={labelData.location.id} />
                      : <span className="text-[#9A9A9A]">—</span>}
                  </DataRow>
                  <DataRow label="Item">{labelData.label.descShort}</DataRow>
                  <DataRow label="DPCI">{labelData.label.dpci}</DataRow>
                  <QtyRow label="Pull qty"    qty={labelData.label.quantity} />
                  <QtyRow label="In location" qty={labelData.pallet.quantity} />
                  {remaining && (
                    <QtyRow label="Remaining" qty={remaining} highlight={remainingZero} />
                  )}
                </div>

                <div className="flex flex-col gap-2 mt-1">
                  <FieldDisplay
                    label="Pallet ID"
                    value={pidField.value}
                    onFocus={focusPidField}
                    active={pidField.isActive}
                  />
                  <FieldDisplay
                    label="Alternate ID"
                    value={altField.value}
                    onFocus={focusAltField}
                    active={altField.isActive}
                  />
                </div>
              </>
            )}
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
