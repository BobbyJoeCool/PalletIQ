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

interface ScannedPallet {
  id: number;
  dpci: string;
  descShort: string;
  quantity: Qty;
  currentLocation: string | null;
}

interface HistoryEntry {
  key: number;
  palletId: number;
  location?: string;
  level?: number;
  outcome: 'SCANNED' | 'PUT' | 'MOVE';
  occupied?: boolean;
  staged?: boolean;
  timestamp: Date;
}

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
 * Appears after the destination location is scanned and validated. Accepts up to 2 digits; does
 * not call any API — level is passed up to MNPPage via onSelect for inclusion in the confirm call.
 *
 * @param onSelect - Called with the chosen level number on Enter tap
 * @param initialLevel - Pre-fills the input when the destination came from the Empty/Occupied
 *   demo buttons, which fetch a real location and therefore already know its exact level — a
 *   worker triggering one of those has no way to know that level themselves. Still requires an
 *   explicit Enter tap to confirm; a real scanned destination has no known level and leaves this
 *   unset, same as before.
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
 * pallet_scanned: Worker scans a destination location barcode. GET /api/locations/:id validates
 *   the location exists (using only aisle+bin, no level required yet). If valid, transitions
 *   to level_modal. If not found, clears the destination field and shows an error.
 *
 * level_modal: LevelModal collects the rack level the pallet was physically placed at.
 *   On confirm, calls POST /api/puts/manual/confirm which places the pallet, deducts carton
 *   counts, and logs PUT. Returns to ready on success. If the destination was already occupied
 *   by another pallet, still succeeds but shows a warning ("was occupied").
 *
 * A right-column history log tracks all scanned pallets with final placement or "in progress".
 * Demo buttons change with screen state (pallet scan / location scan).
 */
export function MNPPage() {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const { deliverScan } = useNumpad();

  const [screenState, setScreenState] = useState<ScreenState>('ready');
  const [scannedPallet, setScannedPallet] = useState<ScannedPallet | null>(null);
  // Quick-hold panel (WLH.md) for the scanned pallet's current location, if it has one.
  const [holdOpen, setHoldOpen] = useState(false);
  const [pendingLocation, setPendingLocation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  // Pre-fill for LevelModal when the destination came from the Empty/Occupied demo buttons
  // (see demoLevelHintRef below) — null for a real scanned destination, which has no known level.
  const [levelHint, setLevelHint] = useState<number | null>(null);

  // Refs for async callbacks.
  const screenStateRef    = useRef(screenState);
  const loadingRef        = useRef(loading);
  const scannedPalletRef  = useRef(scannedPallet);
  const pendingLocationRef = useRef(pendingLocation);
  screenStateRef.current    = screenState;
  loadingRef.current        = loading;
  scannedPalletRef.current  = scannedPallet;
  pendingLocationRef.current = pendingLocation;

  const pendingEntryKeyRef = useRef<number | null>(null);
  // Set immediately before deliverScan() by the Empty/Occupied demo buttons (which already
  // know the exact level of the location they fetched); consumed once by the very next
  // handleDestinationEnter call and cleared regardless of outcome, so it never leaks into a
  // later real scan.
  const demoLevelHintRef = useRef<number | null>(null);

  const palletField      = useNumpadField();
  const destinationField = useNumpadField();

  // ── Focus management ─────────────────────────────────────────────────────────

  /** Registers the Pallet ID field's numpad handler, wired to handlePalletScan on confirm. */
  const focusPalletField = useCallback(() => {
    palletField.focus(handlePalletScan);
  }, [palletField]);

  /** Registers the Destination Location field's numpad handler, wired to handleDestinationEnter on confirm. */
  const focusDestinationField = useCallback(() => {
    destinationField.focus(handleDestinationEnter);
  }, [destinationField]);

  useEffect(() => {
    if (screenState === 'ready') {
      const id = setTimeout(() => focusPalletField(), 50);
      return () => clearTimeout(id);
    }
  }, [screenState]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (screenState === 'pallet_scanned') {
      const id = setTimeout(() => focusDestinationField(), 50);
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
      const result = await apiFetch<{ pallet: ScannedPallet; eligible: boolean }>(
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
   * Submit handler for the Destination Location field. Calls GET /api/locations/:id to validate
   * the location exists (matched on aisle+bin only — level is collected in the next step).
   * On success, stores the pending location and transitions to level_modal.
   * On error, clears and re-focuses the destination field for retry.
   */
  async function handleDestinationEnter(value: string) {
    const v = value.trim();
    if (!v || loadingRef.current) return;

    // Validate the location exists before showing the level modal.
    setLoading(true);
    try {
      await apiFetch(`/api/locations/${encodeURIComponent(v)}`, token!);
      setPendingLocation(v);
      setLevelHint(demoLevelHintRef.current);
      setScreenState('level_modal');
    } catch {
      playAlert('error');
      destinationField.clear();
      destinationField.focus(handleDestinationEnter);
      setMessage({ type: 'error', text: 'Location not found' });
    } finally {
      demoLevelHintRef.current = null;
      setLoading(false);
    }
  }

  /**
   * Called by LevelModal when the worker confirms a level. Calls POST /api/puts/manual/confirm
   * with the stored pallet ID, pending destination location, and chosen level. On success,
   * updates the history entry from SCANNED → PUT/MOVE and shows a completion message.
   * If the destination was occupied, outcome is still successful but shows a warning.
   * On error, closes the modal and returns to pallet_scanned so the worker can re-scan.
   *
   * @param level - The rack level number selected by the worker in LevelModal
   */
  async function handleLevelSelect(level: number) {
    const pallet = scannedPalletRef.current;
    const loc    = pendingLocationRef.current;
    if (!pallet || !loc) return;

    setLoading(true);
    try {
      const result = await apiFetch<{
        location: string;
        level: number;
        wasMove: boolean;
        clearedLocation: string | null;
        destinationWasOccupied: boolean;
        destinationWasStaged: boolean;
      }>(
        '/api/puts/manual/confirm',
        token!,
        { method: 'POST', body: JSON.stringify({ palletId: pallet.id, destinationLocation: loc, level }) },
      );

      const key = pendingEntryKeyRef.current ?? 0;
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
      playAlert('error');
      setMessage({ type: 'error', text: code === 'NOT_FOUND' ? 'Location not found' : 'Confirm failed — please try again' });
      setScreenState('pallet_scanned');
      destinationField.clear();
      setTimeout(() => destinationField.focus(handleDestinationEnter), 50);
    } finally {
      setLoading(false);
    }
  }

  /** Clears all per-put state (scanned pallet, pending location, history key) and returns to ready. */
  function resetToReady() {
    setScannedPallet(null);
    setPendingLocation(null);
    setLevelHint(null);
    pendingEntryKeyRef.current = null;
    setScreenState('ready');
    palletField.clear();
    destinationField.clear();
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
   * Stashes the fetched location's actual level in demoLevelHintRef so LevelModal can
   * pre-fill it — the worker has no way to know what level a randomly-picked demo
   * location is otherwise.
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

  /**
   * Fetches a real already-occupied location id and delivers it as a simulated destination
   * scan. Stashes the fetched location's actual level in demoLevelHintRef, same as demoEmptyLoc.
   */
  const demoOccupiedLoc = useCallback(async () => {
    try {
      const { locationId, level } = await apiFetch<{ locationId: string; level: number }>('/api/demo/location?status=occupied', token!);
      demoLevelHintRef.current = level;
      deliverScan(locationId);
    } catch (err) {
      setMessage({ type: 'error', text: `Demo location: ${err instanceof Error ? err.message : 'unavailable'}` });
    }
  }, [token, deliverScan, setMessage]);

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
        <DemoBtn label="✓ Empty"    color="green" onClick={demoEmptyLoc} />
        <DemoBtn label="~ Occupied" color="amber" onClick={demoOccupiedLoc} />
      </>
    ) : null
  ), [screenState, demoPut, demoMove, demoBadPid, demoEmptyLoc, demoOccupiedLoc]);

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
                <FieldDisplay
                  label="Destination Location"
                  value={destinationField.value}
                  onFocus={focusDestinationField}
                  active={destinationField.isActive}
                />
                <button
                  type="button"
                  onClick={resetToReady}
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
                entry.outcome === 'SCANNED' ? 'text-[#AA8800]' :
                entry.outcome === 'MOVE'    ? 'text-[#0066CC]' :
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
                      <span className="font-ui text-[13px] text-[#555] italic">in progress…</span>
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

      {/* Level selection modal — State 3 */}
      {screenState === 'level_modal' && (
        <LevelModal onSelect={handleLevelSelect} initialLevel={levelHint} />
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
