import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { useMessageBar } from '../context/MessageBarContext';
import { useNumpad } from '../context/NumpadContext';
import { useStaging } from '../context/StagingContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { fmtLocation } from '../lib/fmt';
import { useNumpadField } from '../lib/useNumpadField';

const SIZES = ['XS', 'HS', 'S', 'M', 'L'];
const MAX_VISUAL_SLOTS = 16;

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

function FieldDisplay({
  label, value, onFocus, active = false,
}: { label: string; value: string; onFocus: () => void; active?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-ui text-[12px] font-medium text-[#9A9A9A] uppercase tracking-wider">{label}</span>
      <button
        type="button"
        onClick={onFocus}
        className="flex items-center h-[52px] px-3 rounded-[10px] bg-[#0D0D0D] border-2 border-[#3A3A3A] hover:border-[#555] transition-colors"
      >
        <span className="font-data text-[20px] font-medium text-white">
          {value || <span className="text-[#444]">—</span>}
        </span>
        {active && <span className="inline-block w-[2px] h-[22px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
      </button>
    </div>
  );
}

/** Vertical stack of pallet-slot rectangles — filled once a destination location has
 *  been assigned to that slot, an outline otherwise (shortfall or not-yet-quantified). */
function PalletSlots({ quantity, filledCount }: { quantity: number; filledCount: number }) {
  const slotCount = Math.min(quantity, MAX_VISUAL_SLOTS);
  return (
    <div className="flex flex-col-reverse gap-1 items-center py-2">
      {Array.from({ length: slotCount }, (_, i) => (
        <div
          key={i}
          className={`w-[64px] h-[18px] rounded-[3px] border-2 ${
            i < filledCount ? 'bg-[#CC0000] border-[#CC0000]' : 'border-[#3A3A3A]'
          }`}
        />
      ))}
      {quantity > MAX_VISUAL_SLOTS && (
        <span className="font-ui text-[11px] text-[#666]">+{quantity - MAX_VISUAL_SLOTS} more</span>
      )}
    </div>
  );
}

// ── Stack panel ──────────────────────────────────────────────────────────────

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

  const focusAisleField = useCallback(() => {
    aisleField.focus((v) => {
      updateStack(index, { aisle: v.trim() });
      hidePanel();
    });
  }, [aisleField, hidePanel, index, updateStack]);

  const focusStorageField = useCallback(() => {
    storageField.focus((v) => {
      updateStack(index, { storageCode: v.trim().toUpperCase() });
      hidePanel();
    });
  }, [storageField, hidePanel, index, updateStack]);

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
    <div className="flex-1 flex flex-col items-center gap-3 px-3">
      <span className="font-ui text-[13px] font-semibold text-[#9A9A9A] uppercase tracking-wider">{label}</span>

      {/* Input fields */}
      <div className="grid grid-cols-2 gap-2 w-full">
        <FieldDisplay label="Aisle" value={aisleField.value} onFocus={focusAisleField} active={aisleField.isActive} />
        <FieldDisplay label="Storage" value={storageField.value} onFocus={focusStorageField} active={storageField.isActive} />
        <div className="flex flex-col gap-1">
          <span className="font-ui text-[12px] font-medium text-[#9A9A9A] uppercase tracking-wider">Size</span>
          <select
            aria-label={`${label} Size`}
            value={stack.size}
            onChange={(e) => updateStack(index, { size: e.target.value })}
            className="h-[52px] px-2 rounded-[10px] bg-[#0D0D0D] border-2 border-[#3A3A3A] font-data text-[16px] text-white focus:outline-none focus:border-[#CC0000]"
          >
            <option value="">—</option>
            {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <FieldDisplay label="Qty" value={quantityField.value} onFocus={focusQuantityField} active={quantityField.isActive} />
      </div>

      {/* Fork stack graphic */}
      <PalletSlots quantity={qty} filledCount={stack.locations.length} />

      {/* Destination location list */}
      <div className="w-full flex flex-col gap-1 max-h-[140px] overflow-y-auto">
        {stack.locations.map((loc) => (
          <span key={loc} className="font-data text-[13px] text-[#CFCFCF] text-center">{fmtLocation(loc)}</span>
        ))}
        {Array.from({ length: stack.shortfall }, (_, i) => (
          <span key={`shortfall-${i}`} className="font-ui text-[12px] text-[#CC4444] text-center font-semibold">
            No location available
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={handleStage}
        disabled={!canStage || loading}
        className="w-full h-[56px] rounded-[12px] font-ui text-[17px] font-semibold bg-[#CC0000] hover:bg-[#DD0000] text-white disabled:opacity-40 transition-colors"
      >
        Stage
      </button>
    </div>
  );
}

// ── Log panel ────────────────────────────────────────────────────────────────

function LogPanel() {
  const { log, logExpanded, setLogExpanded } = useStaging();
  const preview = log.slice(0, 2);

  return (
    <div className="shrink-0 border-b border-[#1C1C1C]">
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

function UnstageModal({ defaultAisle, onClose }: { defaultAisle: string; onClose: () => void }) {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const { addLogEntry } = useStaging();
  const [mode, setMode] = useState<'clear' | 'restage'>('clear');
  const [aisle, setAisle] = useState(defaultAisle);
  const [count, setCount] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

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

function MasterControl() {
  const { master, setMaster, stacks, updateStack } = useStaging();
  const { hidePanel } = useNumpad();
  const storageField = useNumpadField('keyboard');

  useEffect(() => { storageField.set(master.storageCode); }, [master.storageCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusStorageField = useCallback(() => {
    storageField.focus((v) => {
      setMaster({ storageCode: v.trim().toUpperCase() });
      hidePanel();
    });
  }, [storageField, hidePanel, setMaster]);

  function fillAll() {
    stacks.forEach((s, i) => {
      if (!s.quantity) updateStack(i as 0 | 1 | 2, { storageCode: master.storageCode, size: master.size });
    });
  }

  return (
    <div className="flex items-end gap-4 px-5 py-3 border-b border-[#1C1C1C] shrink-0">
      <FieldDisplay label="Storage Code" value={storageField.value} onFocus={focusStorageField} active={storageField.isActive} />
      <div className="flex flex-col gap-1 w-[140px]">
        <span className="font-ui text-[12px] font-medium text-[#9A9A9A] uppercase tracking-wider">Size</span>
        <select
          aria-label="Master Size"
          value={master.size}
          onChange={(e) => setMaster({ size: e.target.value })}
          className="h-[52px] px-3 rounded-[10px] bg-[#0D0D0D] border-2 border-[#3A3A3A] font-data text-[18px] text-white focus:outline-none focus:border-[#CC0000]"
        >
          <option value="">—</option>
          {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <button
        type="button"
        onClick={fillAll}
        disabled={!master.storageCode || !master.size}
        className="h-[52px] px-5 rounded-[10px] font-ui text-[15px] font-semibold bg-[#003366] hover:bg-[#004488] text-white disabled:opacity-40 transition-colors"
      >
        Fill All
      </button>
    </div>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

function STGScreen() {
  const { user } = useAuth();
  const routerLocation = useLocation();
  const { stacks, updateStack, setMaster } = useStaging();
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
      <LogPanel />
      <MasterControl />

      <div className="flex-1 flex items-stretch justify-center gap-2 px-4 py-4 overflow-hidden">
        <StackPanel index={0} label="Stack 1" />
        <StackPanel index={1} label="Stack 2" />
        <StackPanel index={2} label="Stack 3" />
      </div>

      {/* Operator compartment — decorative anchor for the fork-truck graphic */}
      <div className="shrink-0 h-[36px] mx-8 mb-4 rounded-t-[10px] bg-[#111111] border border-[#2A2A2A] border-b-0 flex items-center justify-center">
        <span className="font-ui text-[11px] text-[#555] uppercase tracking-wider">Operator Compartment</span>
      </div>

      {isIM && (
        <div className="shrink-0 px-5 pb-4 flex justify-center">
          <button
            type="button"
            onClick={() => setUnstageOpen(true)}
            className="h-[52px] px-6 rounded-[10px] font-ui text-[15px] font-semibold border border-[#3A3A3A] text-[#9A9A9A] hover:border-[#555] hover:text-white transition-colors"
          >
            Unstage Aisle
          </button>
        </div>
      )}

      {unstageOpen && (
        <UnstageModal defaultAisle={stacks[0].aisle} onClose={() => setUnstageOpen(false)} />
      )}
    </div>
  );
}

/** STG — Stage Aisle. StagingProvider (fork-state store) is mounted once, app-wide,
 *  in App.tsx — not here — so fork state survives navigating away and back. */
export function STGPage() {
  return <STGScreen />;
}
