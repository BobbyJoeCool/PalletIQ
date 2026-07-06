import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Triple from '../assets/Triple.png';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { AisleGrid, type GridLevel } from '../components/shared/AisleGrid';
import { useAuth } from '../context/AuthContext';
import { useMessageBar } from '../context/MessageBarContext';
import { useNumpad } from '../context/NumpadContext';
import { useStaging } from '../context/StagingContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { fmtLocation } from '../lib/fmt';
import { useNumpadField } from '../lib/useNumpadField';

const SIZES = ['XS', 'HS', 'S', 'M', 'L'];

interface NavState {
  aisle?: number;
  storageCode?: string;
  size?: string;
}

interface StageResult {
  staged: string[];
  shortfall: number;
  nextLocation: string | null;
}

interface RestageResult {
  cleared: number;
  staged: number;
  shortfall: number;
  firstLocation: string | null;
}

interface ZoneMapResult {
  levels: GridLevel[];
}

/**
 * Repeatedly calls GET /api/staging/next-location, walking the bin/level cursor
 * forward each time, to build a list of up to `count` destination locations. The
 * public API only returns one location per call (see api/functions/staging.ts), so
 * building an N-location list is inherently N sequential round trips.
 */
async function fetchStagingLocations(
  token: string,
  aisle: string,
  storageCode: string,
  size: string,
  count: number,
): Promise<string[]> {
  const results: string[] = [];
  let afterBin: number | undefined;
  let afterLevel: number | undefined;
  for (let i = 0; i < count; i++) {
    const params = new URLSearchParams({ aisle, storageCode, size });
    if (afterBin != null) params.set('afterBin', String(afterBin));
    if (afterLevel != null) params.set('afterLevel', String(afterLevel));
    const { nextLocation } = await apiFetch<{ nextLocation: string | null }>(
      `/api/staging/next-location?${params.toString()}`,
      token,
    );
    if (!nextLocation) break;
    results.push(nextLocation);
    afterBin = parseInt(nextLocation.slice(3, 6), 10);
    afterLevel = parseInt(nextLocation.slice(6, 8), 10);
  }
  return results;
}

// ── Small display helpers ──────────────────────────────────────────────────────

/** Labeled input display box used by the Master Control bar (full-size, unlike the
 *  compact pallet-styled boxes used on the fork graphic — see PalletBox below). */
function FieldDisplay({
  label, value, onFocus, active = false, width = 'w-[160px]',
}: { label: string; value: string; onFocus: () => void; active?: boolean; width?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${width}`}>
      <span className="font-ui text-[12px] font-medium text-[#9A9A9A] uppercase tracking-wider text-center">{label}</span>
      <button
        type="button"
        onClick={onFocus}
        className="flex items-center justify-center h-[52px] px-3 rounded-[10px] bg-[#0D0D0D] border-2 border-[#3A3A3A] hover:border-[#555] transition-colors"
      >
        <span className="font-data text-[20px] font-medium text-white">
          {value || <span className="text-[#444]">—</span>}
        </span>
        {active && <span className="inline-block w-[2px] h-[22px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
      </button>
    </div>
  );
}

/** A single pallet-styled input box, sized to sit stacked on the fork graphic. Two thin
 *  internal lines suggest pallet slats. `emphasize` (used for Qty) makes the box taller and
 *  brighter — it's the only field a GPMer taps on a regular basis, since Aisle/Storage/Size
 *  normally arrive from Master Control's "Fill All". */
function PalletBox({
  label, value, onFocus, active = false, emphasize = false,
}: { label: string; value: string; onFocus: () => void; active?: boolean; emphasize?: boolean }) {
  return (
    <button
      type="button"
      onClick={onFocus}
      className={`relative flex items-center justify-between px-2 rounded-[5px] border-2 transition-colors min-h-0 ${
        emphasize
          ? 'flex-[1.6] bg-[#1A0D0D] border-[#CC0000]'
          : 'flex-1 bg-[#0D0D0D] border-[#3A3A3A] hover:border-[#555]'
      }`}
    >
      <span className="absolute left-1.5 right-1.5 top-1/3 h-px bg-black/40" />
      <span className="absolute left-1.5 right-1.5 top-2/3 h-px bg-black/40" />
      <span className={`relative font-ui font-medium uppercase tracking-wider text-[#9A9A9A] ${emphasize ? 'text-[12px]' : 'text-[9px]'}`}>
        {label}
      </span>
      <span className={`relative font-data font-semibold text-white ${emphasize ? 'text-[22px]' : 'text-[15px]'}`}>
        {value || <span className="text-[#444]">—</span>}
      </span>
      {active && <span className="absolute right-1 top-1 bottom-1 w-[2px] bg-[#CC0000] animate-pulse rounded-sm" />}
    </button>
  );
}

/** Pallet-styled Size dropdown — same visual treatment as PalletBox, but a native `<select>`. */
function PalletSelect({
  label, ariaLabel, value, onChange,
}: { label: string; ariaLabel: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void }) {
  return (
    <div className="relative flex-1 min-h-0 flex items-center justify-between px-2 rounded-[5px] border-2 bg-[#0D0D0D] border-[#3A3A3A]">
      <span className="absolute left-1.5 right-1.5 top-1/3 h-px bg-black/40" />
      <span className="absolute left-1.5 right-1.5 top-2/3 h-px bg-black/40" />
      <span className="relative font-ui text-[9px] font-medium uppercase tracking-wider text-[#9A9A9A]">{label}</span>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={onChange}
        className="relative bg-transparent font-data text-[15px] font-semibold text-white focus:outline-none"
      >
        <option value="">—</option>
        {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}

// ── Stack panel ──────────────────────────────────────────────────────────────

/** One fork-stack column: a compact Stage button and located-count readout above a
 *  vertical pallet-box stack (Aisle at the bottom, resting on the fork, Qty on top). */
function StackPanel({ index, label }: { index: 0 | 1 | 2; label: string }) {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const { hidePanel } = useNumpad();
  const { stacks, updateStack, resetStackAfterStage, addLogEntry } = useStaging();
  const stack = stacks[index];

  const aisleField = useNumpadField('numpad');
  const storageField = useNumpadField('keyboard');
  const quantityField = useNumpadField('numpad');
  const [loading, setLoading] = useState(false);

  // Keep the on-screen field displays in sync with context — covers the worker's own
  // confirm, master-control "Fill All", and route-state pre-population from ELA/ELZ,
  // all of which mutate context directly rather than going through these field hooks.
  useEffect(() => { aisleField.set(stack.aisle); }, [stack.aisle]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { storageField.set(stack.storageCode); }, [stack.storageCode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { quantityField.set(stack.quantity); }, [stack.quantity]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Registers this stack's Aisle field numpad handler; writes the confirmed value into StagingContext. */
  const focusAisleField = useCallback(() => {
    aisleField.focus((v) => {
      updateStack(index, { aisle: v.trim() });
      hidePanel();
    });
  }, [aisleField, hidePanel, index, updateStack]);

  /** Registers this stack's Storage Code field keyboard handler; writes the confirmed value into StagingContext. */
  const focusStorageField = useCallback(() => {
    storageField.focus((v) => {
      updateStack(index, { storageCode: v.trim().toUpperCase() });
      hidePanel();
    });
  }, [storageField, hidePanel, index, updateStack]);

  /** Registers this stack's Quantity field numpad handler; writes the confirmed value into StagingContext. */
  const focusQuantityField = useCallback(() => {
    quantityField.focus((v) => {
      updateStack(index, { quantity: v.trim() });
      hidePanel();
    });
  }, [quantityField, hidePanel, index, updateStack]);

  // Live destination-location list: re-fetches whenever any of the four inputs change,
  // per STG.md's "List updates live if any input field changes."
  useEffect(() => {
    const qty = parseInt(stack.quantity, 10);
    if (!stack.aisle || !stack.storageCode || !stack.size || !qty || qty <= 0) return;
    let cancelled = false;
    fetchStagingLocations(token!, stack.aisle, stack.storageCode, stack.size, qty)
      .then((locations) => {
        if (cancelled) return;
        updateStack(index, { locations, shortfall: Math.max(0, qty - locations.length) });
      })
      .catch(() => {
        if (!cancelled) setMessage({ type: 'error', text: `Stack ${index + 1}: location lookup failed` });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stack.aisle, stack.storageCode, stack.size, stack.quantity]);

  const qty = parseInt(stack.quantity, 10) || 0;
  const canStage = !!stack.aisle && !!stack.storageCode && !!stack.size && qty > 0 && stack.locations.length > 0;

  /** Submits this stack's assigned locations via POST /api/staging/stage, logs the outcome, and resets the stack on success. */
  async function handleStage() {
    if (!canStage || loading) return;
    setLoading(true);
    try {
      const result = await apiFetch<StageResult>('/api/staging/stage', token!, {
        method: 'POST',
        body: JSON.stringify({
          aisle: parseInt(stack.aisle, 10),
          storageCode: stack.storageCode,
          size: stack.size,
          locationIds: stack.locations,
        }),
      });

      const nextText = result.nextLocation ? fmtLocation(result.nextLocation) : 'no further locations';
      addLogEntry(`${result.staged.length} pallets staged in Aisle ${stack.aisle} → next location ${nextText}`);

      if (result.shortfall > 0) {
        playAlert('warning');
        const requested = result.staged.length + result.shortfall;
        addLogEntry(
          `Warning: ${result.staged.length} of ${requested} locations available in Aisle ${stack.aisle} — ${result.shortfall} pallets have no location`,
          true,
        );
        setMessage({ type: 'warning', text: `Stack ${index + 1}: staged ${result.staged.length} of ${requested} — ${result.shortfall} pallets unplaced` });
      } else {
        playAlert('info');
        setMessage({ type: 'success', text: `Stack ${index + 1}: ${result.staged.length} pallets staged in Aisle ${stack.aisle}` });
      }

      resetStackAfterStage(index);
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: `Stack ${index + 1}: staging failed — please try again` });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col items-stretch justify-between gap-1 px-2 min-w-0 h-full">
      <span className="font-ui text-[10px] font-semibold text-[#666] uppercase tracking-wider text-center">{label}</span>

      <button
        type="button"
        onClick={handleStage}
        disabled={!canStage || loading}
        className="w-full h-[28px] rounded-[6px] font-ui text-[11px] font-bold tracking-wide bg-[#CC0000] hover:bg-[#DD0000] text-white disabled:opacity-40 transition-colors shrink-0"
      >
        STAGE
      </button>

      {/* Left: pallet-box stack (Aisle at the bottom, resting on the fork; Qty on top, most
          used). Right: a real display of where this stack's pallets are going — the actual
          assigned locations, not just a count — since that's the info a GPMer needs to see
          before tapping Stage. */}
      <div className="flex-1 min-h-0 flex gap-2">
        <div className="flex-1 min-w-0 min-h-0 flex flex-col-reverse gap-[3px]">
          <PalletBox label="Aisle" value={aisleField.value} onFocus={focusAisleField} active={aisleField.isActive} />
          <PalletBox label="Storage" value={storageField.value} onFocus={focusStorageField} active={storageField.isActive} />
          <PalletSelect
            label="Size"
            ariaLabel={`${label} Size`}
            value={stack.size}
            onChange={(e) => updateStack(index, { size: e.target.value })}
          />
          <PalletBox label="Qty" value={quantityField.value} onFocus={focusQuantityField} active={quantityField.isActive} emphasize />
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <span className="font-ui text-[8px] font-medium uppercase tracking-wider text-[#666] text-center shrink-0">
            Pallets Go To
          </span>
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[2px] bg-[#0A0A0A] border border-[#2A2A2A] rounded-[5px] p-1">
            {stack.locations.length === 0 && stack.shortfall === 0 && (
              <span className="font-data text-[10px] text-[#444] text-center">—</span>
            )}
            {stack.locations.map((loc) => (
              <span key={loc} className="font-data text-[10px] text-[#CFCFCF] text-center">{fmtLocation(loc)}</span>
            ))}
            {Array.from({ length: stack.shortfall }, (_, i) => (
              <span key={`shortfall-${i}`} className="font-ui text-[9px] text-[#CC4444] text-center font-semibold">
                No location
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Fork graphic ─────────────────────────────────────────────────────────────

/** The Triple.png fork-truck graphic with the three StackPanels resting on its fork bar —
 *  the fork/mast span roughly the left 82% of the image, the cab the remaining ~18%, so the
 *  stack zone below matches that. Triple.png's native aspect is ~2.84:1, so at full 1366px
 *  width its natural height is ~481px; this uses 360px (recognizable proportions without
 *  eating too much of the screen) — the fork bar sits at a fixed 80% down the image regardless
 *  of container height, since it's a uniform stretch, so `bottom-[20%]` below stays correct at
 *  any height. The stack content stretches (items-stretch, not items-end) to fill that whole
 *  80%-tall zone rather than clumping at the bottom, so the available height is actually used. */
function ForkGraphicArea() {
  return (
    <div className="relative shrink-0 h-[360px] mx-4 mt-3 select-none">
      <img
        src={Triple}
        alt=""
        className="absolute inset-0 w-full h-full object-fill opacity-90 pointer-events-none"
      />
      <div className="absolute left-0 top-0 bottom-[20%] w-[82%] flex items-stretch px-2 py-1">
        <StackPanel index={0} label="Stack 1" />
        <div className="w-px self-stretch bg-[#3A3A3A]" />
        <StackPanel index={1} label="Stack 2" />
        <div className="w-px self-stretch bg-[#3A3A3A]" />
        <StackPanel index={2} label="Stack 3" />
      </div>
    </div>
  );
}

// ── Zone map ─────────────────────────────────────────────────────────────────

/** Bottom-half live zone map for whatever Aisle + Storage Code are currently set in Master
 *  Control — reuses the same GET /api/locations/empty-by-zone endpoint and shared AisleGrid
 *  component as ELZ (see ELZPage.tsx), without ELZ's per-zone summary panel: STG only needs
 *  the physical layout for reference while staging, not the empty/staged counts. */
function ZoneMap({ aisle, storageCode }: { aisle: string; storageCode: string }) {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const [levels, setLevels] = useState<GridLevel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!aisle || !storageCode) {
      setLevels(null);
      setNotFound(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    apiFetch<ZoneMapResult>(
      `/api/locations/empty-by-zone?aisle=${aisle}&storageCode=${encodeURIComponent(storageCode)}`,
      token!,
    )
      .then((data) => { if (!cancelled) setLevels(data.levels); })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof Error && err.message === 'NOT_FOUND') {
          setLevels(null);
          setNotFound(true);
        } else {
          setLevels(null);
          setMessage({ type: 'error', text: 'Zone map lookup failed' });
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [aisle, storageCode, token, setMessage]);

  if (!aisle || !storageCode) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-ui text-[16px] text-[#555] text-center px-8">
          Enter an Aisle and Storage Code in Master Control to view the zone map
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-ui text-[14px] text-[#555]">Loading zone map…</p>
      </div>
    );
  }

  if (notFound || !levels) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-ui text-[16px] text-[#CC4444]">Aisle {aisle} not found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-3">
      <AisleGrid levels={levels} />
    </div>
  );
}

// ── Log panel ────────────────────────────────────────────────────────────────

/** Collapsed 2-line preview of the session's staging log; tap to expand into a full scrollable modal. */
function LogPanel() {
  const { log, logExpanded, setLogExpanded } = useStaging();
  const preview = log.slice(0, 2);

  return (
    <div className="shrink-0 border-t border-[#1C1C1C]">
      <button
        type="button"
        onClick={() => setLogExpanded(!logExpanded)}
        className="w-full flex flex-col gap-1 px-5 py-2 hover:bg-[#0D0D0D] transition-colors text-left"
      >
        {log.length === 0 ? (
          <span className="font-ui text-[13px] text-[#555]">No staging activity this session — tap to expand</span>
        ) : (
          preview.map((entry) => (
            <span
              key={entry.id}
              className={`font-ui text-[13px] ${entry.warning ? 'text-[#AA8800]' : 'text-[#9A9A9A]'}`}
            >
              {entry.text}
            </span>
          ))
        )}
      </button>
      {logExpanded && (
        <div className="absolute inset-0 bg-black/90 z-40 flex flex-col" onClick={() => setLogExpanded(false)}>
          <div
            className="mx-auto mt-6 w-[900px] max-h-[80%] bg-[#0D0D0D] border border-[#2A2A2A] rounded-[16px] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#2A2A2A]">
              <span className="font-ui text-[16px] font-semibold text-white">Staging Log</span>
              <button type="button" onClick={() => setLogExpanded(false)} className="font-ui text-[14px] text-[#9A9A9A] hover:text-white">
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-2">
              {log.length === 0 ? (
                <p className="font-ui text-[15px] text-[#555]">No staging activity this session</p>
              ) : (
                log.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between border-b border-[#1A1A1A] pb-2">
                    <span className={`font-ui text-[14px] ${entry.warning ? 'text-[#AA8800]' : 'text-[#CFCFCF]'}`}>
                      {entry.text}
                    </span>
                    <span className="font-data text-[12px] text-[#555]">{entry.timestamp.toLocaleTimeString()}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Unstage / Restage modal ───────────────────────────────────────────────────

/** IM+ modal for clearing or restaging an aisle's staged locations, with a confirm step before either destructive action. */
function UnstageModal({ defaultAisle, onClose }: { defaultAisle: string; onClose: () => void }) {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const { addLogEntry } = useStaging();
  const [mode, setMode] = useState<'clear' | 'restage'>('clear');
  const [aisle, setAisle] = useState(defaultAisle);
  const [count, setCount] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  /** Submits the clear-aisle or restage-aisle request via POST /api/staging/restage and logs the outcome. */
  async function submit() {
    const aisleNum = parseInt(aisle, 10);
    if (isNaN(aisleNum) || (mode === 'restage' && !count)) return;
    setLoading(true);
    try {
      const result = await apiFetch<RestageResult>('/api/staging/restage', token!, {
        method: 'POST',
        body: JSON.stringify({ aisle: aisleNum, count: mode === 'clear' ? 0 : parseInt(count, 10) }),
      });
      playAlert('info');
      if (mode === 'clear') {
        addLogEntry(`Aisle ${aisle} cleared — ${result.cleared} staged locations released`);
        setMessage({ type: 'success', text: `Aisle ${aisle} cleared — ${result.cleared} locations released` });
      } else {
        const first = result.firstLocation ? fmtLocation(result.firstLocation) : 'no locations';
        addLogEntry(`Aisle ${aisle} restaged — ${result.staged} locations staged from ${first}`);
        if (result.shortfall > 0) {
          playAlert('warning');
          setMessage({ type: 'warning', text: `Restaged ${result.staged} of ${count} in Aisle ${aisle} — ${result.shortfall} short` });
        } else {
          setMessage({ type: 'success', text: `Aisle ${aisle} restaged — ${result.staged} locations staged` });
        }
      }
      onClose();
    } catch (err) {
      playAlert('error');
      const code = err instanceof Error ? err.message : '';
      setMessage({ type: 'error', text: code === 'NOT_FOUND' ? 'Aisle not found' : 'Restage failed — please try again' });
    } finally {
      setLoading(false);
    }
  }

  if (confirming) {
    return (
      <ConfirmDialog
        title={mode === 'clear' ? 'Clear all staged locations?' : `Restage ${count || 0} pallets?`}
        message={
          mode === 'clear'
            ? `This clears every staged location in Aisle ${aisle} back to Empty.`
            : `This clears every staged location in Aisle ${aisle}, then stages the first ${count || 0} locations from the back.`
        }
        confirmLabel={mode === 'clear' ? 'Clear Aisle' : 'Restage'}
        variant="danger"
        onConfirm={() => { setConfirming(false); submit(); }}
        onCancel={() => setConfirming(false)}
      />
    );
  }

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-[20px] p-8 w-[480px] flex flex-col gap-5">
        <h2 className="font-ui text-[22px] font-semibold text-white text-center">Unstage Aisle</h2>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setMode('clear')}
            className={`flex-1 h-[52px] rounded-[10px] font-ui text-[15px] font-semibold transition-colors ${mode === 'clear' ? 'bg-[#CC0000] text-white' : 'border border-[#3A3A3A] text-[#9A9A9A]'}`}
          >
            Clear all staged locations
          </button>
          <button
            type="button"
            onClick={() => setMode('restage')}
            className={`flex-1 h-[52px] rounded-[10px] font-ui text-[15px] font-semibold transition-colors ${mode === 'restage' ? 'bg-[#CC0000] text-white' : 'border border-[#3A3A3A] text-[#9A9A9A]'}`}
          >
            Restage with N pallets
          </button>
        </div>

        <label className="flex flex-col gap-1">
          <span className="font-ui text-[13px] text-[#9A9A9A] uppercase tracking-wider">Aisle</span>
          <input
            type="number"
            value={aisle}
            onChange={(e) => setAisle(e.target.value)}
            className="h-[56px] px-4 rounded-[10px] bg-[#000] border-2 border-[#3A3A3A] font-data text-[22px] text-white focus:outline-none focus:border-[#CC0000]"
          />
        </label>

        {mode === 'restage' && (
          <label className="flex flex-col gap-1">
            <span className="font-ui text-[13px] text-[#9A9A9A] uppercase tracking-wider">Count</span>
            <input
              type="number"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="h-[56px] px-4 rounded-[10px] bg-[#000] border-2 border-[#3A3A3A] font-data text-[22px] text-white focus:outline-none focus:border-[#CC0000]"
            />
          </label>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 h-[56px] rounded-[12px] border border-[#3A3A3A] font-ui text-[16px] text-white">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!aisle || (mode === 'restage' && !count) || loading}
            className="flex-1 h-[56px] rounded-[12px] font-ui text-[16px] font-semibold bg-[#CC0000] hover:bg-[#DD0000] text-white disabled:opacity-40"
          >
            {mode === 'clear' ? 'Clear Aisle' : 'Restage'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Master control bar ────────────────────────────────────────────────────────

/** Top control bar: shared Aisle/StorageCode/Size, "Fill All", and (IM+ only) Unstage Aisle. */
function MasterControl({ isIM, onUnstage }: { isIM: boolean; onUnstage: () => void }) {
  const { master, setMaster, stacks, updateStack } = useStaging();
  const { hidePanel } = useNumpad();
  const aisleField = useNumpadField('numpad');
  const storageField = useNumpadField('keyboard');

  useEffect(() => { aisleField.set(master.aisle); }, [master.aisle]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { storageField.set(master.storageCode); }, [master.storageCode]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Registers the master Aisle field's numpad handler; writes the confirmed value into the shared master state. */
  const focusAisleField = useCallback(() => {
    aisleField.focus((v) => {
      setMaster({ aisle: v.trim() });
      hidePanel();
    });
  }, [aisleField, hidePanel, setMaster]);

  /** Registers the master Storage Code field's keyboard handler; writes the confirmed value into the shared master state. */
  const focusStorageField = useCallback(() => {
    storageField.focus((v) => {
      setMaster({ storageCode: v.trim().toUpperCase() });
      hidePanel();
    });
  }, [storageField, hidePanel, setMaster]);

  /** Applies the master Aisle/StorageCode/Size to every stack that doesn't have a Quantity yet. */
  function fillAll() {
    stacks.forEach((s, i) => {
      if (!s.quantity) updateStack(i as 0 | 1 | 2, { aisle: master.aisle, storageCode: master.storageCode, size: master.size });
    });
  }

  // Four equal-width columns mirror ForkGraphicArea's layout below (Stack 1 / Stack 2 /
  // Stack 3 each occupy 25% of width, then the cab/mast zone takes the remaining 25%) —
  // that's what makes Aisle land centered directly above Stack 2, not a coincidence.
  return (
    <div className="flex items-end pt-3 pb-4 border-b border-[#1C1C1C] shrink-0">
      <div className="flex-1 flex justify-center">
        <FieldDisplay label="Storage Code" value={storageField.value} onFocus={focusStorageField} active={storageField.isActive} width="w-[160px]" />
      </div>
      <div className="flex-1 flex justify-center">
        <FieldDisplay label="Aisle" value={aisleField.value} onFocus={focusAisleField} active={aisleField.isActive} width="w-[120px]" />
      </div>
      <div className="flex-1 flex justify-center">
        <div className="flex flex-col gap-1 w-[120px]">
          <span className="font-ui text-[12px] font-medium text-[#9A9A9A] uppercase tracking-wider text-center">Size</span>
          <select
            aria-label="Master Size"
            value={master.size}
            onChange={(e) => setMaster({ size: e.target.value })}
            className="h-[52px] px-3 rounded-[10px] bg-[#0D0D0D] border-2 border-[#3A3A3A] font-data text-[18px] text-white text-center focus:outline-none focus:border-[#CC0000]"
          >
            <option value="">—</option>
            {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={fillAll}
          disabled={!master.aisle || !master.storageCode || !master.size}
          className="h-[52px] px-5 rounded-[10px] font-ui text-[15px] font-semibold bg-[#003366] hover:bg-[#004488] text-white disabled:opacity-40 transition-colors"
        >
          Fill All
        </button>
        {isIM && (
        <button
          type="button"
          onClick={onUnstage}
          className="h-[36px] px-4 rounded-[8px] font-ui text-[12px] font-semibold border border-[#3A3A3A] text-[#9A9A9A] hover:border-[#555] hover:text-white transition-colors"
        >
          Unstage Aisle
        </button>
        )}
      </div>
    </div>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

/** Assembles the STG screen: Master Control, the fork graphic with three StackPanels, a live
 *  zone map for Master Control's Aisle/StorageCode, and the Log Panel at the very bottom. */
function STGScreen() {
  const { user } = useAuth();
  const routerLocation = useLocation();
  const { stacks, updateStack, master, setMaster } = useStaging();
  const [unstageOpen, setUnstageOpen] = useState(false);
  const isIM = ['IM', 'LEAD', 'MANAGER', 'ADMIN'].includes(user?.role ?? '');

  // Pre-population from ELA "Stage Aisle" / ELZ "Stage Aisle" — see STG.md's
  // Pre-population section. Only applied once per navigation (route state is consumed,
  // not re-applied on every render) — an empty Stack 1 is used as the "not yet applied" signal.
  useEffect(() => {
    const state = routerLocation.state as NavState | null;
    if (!state?.aisle || stacks[0].aisle) return;
    const aisle = String(state.aisle);
    updateStack(0, { aisle });
    setMaster({ aisle });
    if (state.storageCode && state.size) {
      setMaster({ storageCode: state.storageCode, size: state.size });
      // "Fill All" auto-triggers: every stack with no Quantity yet (all three, on entry)
      // inherits StorageCode + Size — each still needs its own Quantity entered.
      [0, 1, 2].forEach((i) => updateStack(i as 0 | 1 | 2, { storageCode: state.storageCode!, size: state.size! }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state]);

  return (
    <div className="absolute inset-0 flex flex-col select-none">
      <MasterControl isIM={isIM} onUnstage={() => setUnstageOpen(true)} />
      <ForkGraphicArea />

      <div className="flex-1 flex flex-col overflow-hidden border-t border-[#1C1C1C]">
        <ZoneMap aisle={master.aisle} storageCode={master.storageCode} />
        <LogPanel />
      </div>

      {unstageOpen && (
        <UnstageModal defaultAisle={master.aisle || stacks[0].aisle} onClose={() => setUnstageOpen(false)} />
      )}
    </div>
  );
}

/** STG — Stage Aisle. StagingProvider (fork-state store) is mounted once, app-wide,
 *  in App.tsx — not here — so fork state survives navigating away and back. */
export function STGPage() {
  return <STGScreen />;
}
