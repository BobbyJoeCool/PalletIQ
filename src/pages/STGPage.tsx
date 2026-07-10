import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Triple from '../assets/Triple.png';
import { AisleGrid, type GridLevel } from '../components/shared/AisleGrid';
import { CellValue } from '../components/shared/CellValue';
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

interface ZoneBreakdown { storageCode: string; size: string; empty: number; staged: number }
interface ZoneSummaryEntry { zone: number; breakdown: ZoneBreakdown[] }

interface ZoneMapResult {
  levels: GridLevel[];
  zoneSummary: ZoneSummaryEntry[];
}

interface AisleSizeCount { size: string; empty: number; staged: number }
interface AisleRow { aisle: number; totalEmpty: number; sizes: AisleSizeCount[] }

/** Stable, referentially-constant empty exclude set — used by Stack 0, which has no lower-
 *  priority sibling to yield to, so its dependency never wastefully changes identity. */
const EMPTY_EXCLUDE_SET = new Set<string>();

/** Stable, referentially-constant empty array — stands in for "this sibling isn't a
 *  lower-priority stack relative to me" in priorLocations' dependency array below, so that
 *  array never accidentally depends on a stack's own `locations` (see priorLocations' comment). */
const EMPTY_LOCATIONS: string[] = [];

/**
 * Repeatedly calls GET /api/staging/next-location, walking the bin/level cursor
 * forward each time, to build a list of up to `count` destination locations. The
 * public API only returns one location per call (see api/functions/staging.ts), so
 * building an N-location list is inherently N sequential round trips.
 *
 * `exclude` skips locations already claimed by a higher-priority sibling stack's
 * uncommitted preview (see StackPanel's `priorLocations`) — the backend only knows about
 * locations actually STAGED in the DB, not another stack's still-in-progress UI state, so
 * this is the client's only way to keep two stacks from showing the same destination.
 * Skipped locations must not count against `count`, or `shortfall` would be inflated by
 * exclusions alone — the loop is bounded by how many results were actually kept.
 */
async function fetchStagingLocations(
  token: string,
  aisle: string,
  storageCode: string,
  size: string,
  count: number,
  exclude: Set<string> = EMPTY_EXCLUDE_SET,
): Promise<string[]> {
  const results: string[] = [];
  let afterBin: number | undefined;
  let afterLevel: number | undefined;
  let attempts = 0;
  const maxAttempts = count + exclude.size + 20; // defensive cap against a pathological aisle
  while (results.length < count && attempts < maxAttempts) {
    attempts++;
    const params = new URLSearchParams({ aisle, storageCode, size });
    if (afterBin != null) params.set('afterBin', String(afterBin));
    if (afterLevel != null) params.set('afterLevel', String(afterLevel));
    const { nextLocation } = await apiFetch<{ nextLocation: string | null }>(
      `/api/staging/next-location?${params.toString()}`,
      token,
    );
    if (!nextLocation) break;
    afterBin = parseInt(nextLocation.slice(3, 6), 10);
    afterLevel = parseInt(nextLocation.slice(6, 8), 10);
    if (exclude.has(nextLocation)) continue; // claimed by a sibling — cursor already advanced past it
    results.push(nextLocation);
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
        className={`flex items-center justify-center h-[52px] px-3 rounded-[10px] bg-[#0D0D0D] border-2 transition-colors ${active ? 'border-[#CC0000]' : 'border-[#3A3A3A] hover:border-[#555]'}`}
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
          : active
          ? 'flex-1 bg-[#0D0D0D] border-[#CC0000]'
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
  const { stacks, updateStack, resetStackAfterStage, addLogEntry, bumpDataVersion } = useStaging();
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

  // Locations already claimed by a higher-priority sibling's uncommitted preview (Stack 0
  // outranks Stack 1 outranks Stack 2, matching the fork graphic's left-to-right layout).
  // One-directional on purpose: a bidirectional exclusion would let two stacks' effects
  // invalidate each other back and forth. Known accepted limitation: if a lower-indexed
  // stack's fields change *after* a higher one already computed its list, the higher one
  // won't know until something re-triggers it — display-only, since the stage endpoint
  // re-validates each location as still EMPTY at write time and never double-books.
  //
  // lowerLocationsN must never resolve to *this* stack's own locations — depending on
  // stacks[index].locations here would self-trigger: this stack's own fetch resolving
  // changes stacks[index].locations, which would recompute this memo to a new Set identity
  // even with identical contents, re-firing the fetch effect below, which resolves and
  // changes stacks[index].locations again — forever. EMPTY_LOCATIONS stands in for "not a
  // lower sibling" so both slots stay referentially stable when not applicable to this index.
  const lowerLocations0 = index > 0 ? stacks[0].locations : EMPTY_LOCATIONS;
  const lowerLocations1 = index > 1 ? stacks[1].locations : EMPTY_LOCATIONS;
  const priorLocations = useMemo(() => {
    if (lowerLocations0.length === 0 && lowerLocations1.length === 0) return EMPTY_EXCLUDE_SET;
    const set = new Set<string>();
    lowerLocations0.forEach((loc) => set.add(loc));
    lowerLocations1.forEach((loc) => set.add(loc));
    return set;
  }, [lowerLocations0, lowerLocations1]);

  // Live destination-location list: re-fetches whenever any of the four inputs change,
  // per STG.md's "List updates live if any input field changes" — also re-fetches when a
  // higher-priority sibling's claimed locations change (including clearing to [] after that
  // sibling stages), so "an update anywhere on the forks" actually propagates.
  useEffect(() => {
    const qty = parseInt(stack.quantity, 10);
    if (!stack.aisle || !stack.storageCode || !stack.size || !qty || qty <= 0) return;
    let cancelled = false;
    fetchStagingLocations(token!, stack.aisle, stack.storageCode, stack.size, qty, priorLocations)
      .then((locations) => {
        if (cancelled) return;
        updateStack(index, { locations, shortfall: Math.max(0, qty - locations.length) });
      })
      .catch(() => {
        if (!cancelled) setMessage({ type: 'error', text: `Stack ${index + 1}: location lookup failed` });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stack.aisle, stack.storageCode, stack.size, stack.quantity, priorLocations]);

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
      bumpDataVersion();
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
            {stack.locations.map((loc, i) => {
              // Larger text when there's little else in the list to show, per the report;
              // the final assigned location (not a shortfall placeholder) is bolded red so
              // the GPMer can see at a glance where the last pallet in the stack is headed.
              const big = stack.locations.length + stack.shortfall <= 4;
              const isLast = i === stack.locations.length - 1;
              return (
                <span
                  key={loc}
                  className={`font-data text-center ${big ? 'text-[14px]' : 'text-[10px]'} ${
                    isLast ? 'font-bold text-[#FF4444]' : 'text-[#CFCFCF]'
                  }`}
                >
                  {fmtLocation(loc)}
                </span>
              );
            })}
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

// ── Live info panel ───────────────────────────────────────────────────────────

/** Short inline message shown in place of a row list/summary that came back empty — the
 *  zone map (if present alongside it) keeps rendering normally either way. */
function NoMatches({ text }: { text: string }) {
  return <p className="font-ui text-[14px] text-[#555] text-center py-4">{text}</p>;
}

/** ELZ-format read-only display: physical layout grid (left, unfiltered) + zone summary
 *  (right, narrowed by whichever of storageCode/size the caller supplied) — same JSX/
 *  formatting pattern as ELZPage.tsx's zone summary panel. Not interactive, per Feature 2's
 *  spec (this format is always a read-only display, matching ELZ itself). */
function ElzFormat({ result, label }: { result: ZoneMapResult; label: string }) {
  return (
    <div className="flex-1 flex gap-4 overflow-hidden px-4 py-3">
      <div className="flex-[6] overflow-auto">
        <AisleGrid levels={result.levels} dense />
      </div>
      <div className="flex-[4] overflow-y-auto border-l border-[#2A2A2A] pl-4">
        {result.zoneSummary.length === 0 ? (
          <NoMatches text={`No open ${label} locations in this aisle`} />
        ) : (
          result.zoneSummary.map((z) => (
            <div key={z.zone} className="mb-3">
              <span className="font-ui text-[14px] font-semibold text-white">Zone {z.zone}</span>
              <div className="flex flex-col gap-1 mt-1">
                {z.breakdown.map((b) => (
                  <div key={`${b.storageCode}-${b.size}`} className="flex items-center justify-between">
                    <span className="font-data text-[13px] text-[#CFCFCF]">{b.storageCode}-{b.size}</span>
                    <CellValue empty={b.empty} staged={b.staged} />
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** ELA-format interactive list: aisle row headers, with size sub-rows nested beneath when
 *  not already narrowed to one exact size. Only the aisle-number / size-label text itself is
 *  a tap target — the counts/data area is a plain span, so a scroll swipe starting over the
 *  numbers never fires a selection, per Feature 2's spec. */
function ElaFormat({
  rows, size, storageCode, onSelectAisle, onSelectSize,
}: { rows: AisleRow[]; size: string; storageCode: string; onSelectAisle: (aisle: number) => void; onSelectSize: (size: string) => void }) {
  if (rows.length === 0) {
    return <NoMatches text={`No open ${storageCode}${size ? `-${size}` : ''} locations`} />;
  }

  if (size) {
    // Already narrowed to one exact freight type — no sub-rows needed; sort/display by
    // that specific size's own empty count (a row's `sizes` still lists every size present
    // in that aisle, not just the queried one).
    const sorted = [...rows].sort((a, b) => {
      const av = a.sizes.find((s) => s.size === size)?.empty ?? 0;
      const bv = b.sizes.find((s) => s.size === size)?.empty ?? 0;
      return bv - av;
    });
    return (
      <div className="flex-1 overflow-y-auto px-4">
        {sorted.map((r) => {
          const cell = r.sizes.find((s) => s.size === size);
          return (
            <div key={r.aisle} className="flex items-center justify-between py-3 border-b border-[#1A1A1A] last:border-b-0">
              <button type="button" onClick={() => onSelectAisle(r.aisle)} className="font-data text-[20px] font-semibold text-white">
                Aisle {r.aisle}
              </button>
              <span>{cell && <CellValue empty={cell.empty} staged={cell.staged} large />}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4">
      {rows.map((r) => (
        <div key={r.aisle} className="py-3 border-b border-[#1A1A1A] last:border-b-0">
          <button type="button" onClick={() => onSelectAisle(r.aisle)} className="font-data text-[20px] font-semibold text-white">
            Aisle {r.aisle}
          </button>
          <div className="flex flex-col gap-1 mt-2 pl-3">
            {r.sizes.filter((s) => s.empty > 0 || s.staged > 0).map((s) => (
              <div key={s.size} className="flex items-center justify-between">
                <button type="button" onClick={() => onSelectSize(s.size)} className="font-data text-[14px] text-[#CFCFCF]">
                  {s.size}
                </button>
                <span><CellValue empty={s.empty} staged={s.staged} /></span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Live matching-aisle/zone info panel (DevNotes/DesignPrompts/Feature-2-STG-Live-Matching-
 * Aisle-Zone-Info.md) — replaces STG's old single-aisle-map display entirely, in the same
 * slot. Driven purely by Master Control's Aisle/StorageCode/Size: shows the ELZ format
 * (grid + zone summary) whenever an Aisle is present, the ELA format (aisle list, tap to
 * fill Aisle/Size) whenever only a Storage Code is present, or an empty-state placeholder
 * otherwise (including Size filled alone). Not collapsible; sized to its content rather
 * than forced to fill all remaining height. Refetches on field changes and whenever a
 * stage/restage actually commits (`dataVersion`) — never from the fork graphic's own
 * candidate-location lookups, which are unrelated to these fields.
 */
function InfoPanel({ aisle, storageCode, size }: { aisle: string; storageCode: string; size: string }) {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const { setMaster, dataVersion } = useStaging();
  const [zoneResult, setZoneResult] = useState<ZoneMapResult | null>(null);
  const [aisleRows, setAisleRows] = useState<AisleRow[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  const mode: 'none' | 'elz' | 'ela' = aisle ? 'elz' : storageCode ? 'ela' : 'none';

  useEffect(() => {
    if (mode === 'none') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- standard data-fetch-on-filter-change effect
      setZoneResult(null);
      setAisleRows(null);
      setNotFound(false);
      return;
    }
    let cancelled = false;
    setNotFound(false);
    if (mode === 'elz') {
      const params = new URLSearchParams({ aisle });
      if (storageCode) params.set('storageCode', storageCode);
      if (size) params.set('size', size);
      apiFetch<ZoneMapResult>(`/api/locations/empty-by-zone?${params.toString()}`, token!)
        .then((data) => { if (!cancelled) setZoneResult(data); })
        .catch((err) => {
          if (cancelled) return;
          if (err instanceof Error && err.message === 'NOT_FOUND') {
            setZoneResult(null);
            setNotFound(true);
          } else {
            setZoneResult(null);
            setMessage({ type: 'error', text: 'Zone lookup failed' });
          }
        });
    } else {
      const params = new URLSearchParams({ storageCode });
      if (size) params.set('size', size);
      apiFetch<AisleRow[]>(`/api/locations/empty-by-aisle?${params.toString()}`, token!)
        .then((data) => { if (!cancelled) setAisleRows(data); })
        .catch(() => { if (!cancelled) setMessage({ type: 'error', text: 'Aisle lookup failed' }); });
    }
    return () => { cancelled = true; };
  }, [mode, aisle, storageCode, size, token, setMessage, dataVersion]);

  if (mode === 'none') {
    return (
      <div className="shrink-0 py-6 flex items-center justify-center">
        <p className="font-ui text-[15px] text-[#555] text-center px-8">
          Enter a Storage Code or Aisle to see matches
        </p>
      </div>
    );
  }

  if (mode === 'elz') {
    if (notFound || !zoneResult) {
      return (
        <div className="shrink-0 py-6 flex items-center justify-center">
          <p className="font-ui text-[15px] text-[#CC4444]">Aisle {aisle} not found</p>
        </div>
      );
    }
    const label = storageCode && size ? `${storageCode}-${size}` : storageCode || size || '';
    return (
      <div className="shrink-0 max-h-[420px] overflow-hidden flex flex-col">
        <ElzFormat result={zoneResult} label={label} />
      </div>
    );
  }

  if (!aisleRows) return null;
  return (
    <div className="shrink-0 max-h-[420px] overflow-hidden flex flex-col">
      <ElaFormat
        rows={aisleRows}
        size={size}
        storageCode={storageCode}
        onSelectAisle={(a) => setMaster({ aisle: String(a) })}
        onSelectSize={(s) => setMaster({ size: s })}
      />
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

interface StagedType { storageCode: string; size: string; staged: number; empty: number; max: number }
interface RestageTypeResult { storageCode: string; size: string; cleared: number; staged: number; shortfall: number }
interface RestageResponse { results: RestageTypeResult[] }
interface RowState { active: boolean; quantity: string }

/** Builds the `${storageCode}-${size}` key used to index row state, matching the label shown per row. */
function typeKey(t: { storageCode: string; size: string }): string {
  return `${t.storageCode}-${t.size}`;
}

/**
 * IM+ popup for per-freight-type unstage/restage in one action (DevNotes/DesignPrompts/
 * Feature-1-STG-Per-Freight-Type-Unstage-Restage.md). One row per freight type currently
 * staged in the aisle (1-6, dynamic). Sized to leave the bottom-right Numpad corner
 * (436×482px) clear, since quantity entry needs it — the panel is capped to the left
 * ~900px of the content slot rather than truly full-screen.
 */
function UnstageModal({ aisle, onClose }: { aisle: string; onClose: () => void }) {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const { addLogEntry, bumpDataVersion } = useStaging();
  const { hidePanel } = useNumpad();
  const [types, setTypes] = useState<StagedType[] | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  // Six fixed numpad-field instances — Rules of Hooks needs a constant call count every
  // render; the row set only changes on this initial fetch, never while a field is in use.
  const qtyFields = [
    useNumpadField('numpad'), useNumpadField('numpad'), useNumpadField('numpad'),
    useNumpadField('numpad'), useNumpadField('numpad'), useNumpadField('numpad'),
  ];

  // Keeps each field's own displayed value in sync with row state after Max/Clear
  // Restage (which set row state directly, bypassing the numpad) — same pattern as
  // MasterControl/StackPanel syncing their fields from context after external updates.
  useEffect(() => {
    types?.forEach((t, i) => qtyFields[i]?.set(rows[typeKey(t)]?.quantity ?? '0'));
  }, [types, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const aisleNum = parseInt(aisle, 10);
    if (isNaN(aisleNum)) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard data-fetch-on-filter-change effect
    setLoading(true);
    apiFetch<StagedType[]>(`/api/staging/staged-types?aisle=${aisleNum}`, token!)
      .then((data) => {
        if (cancelled) return;
        setTypes(data);
        setRows(Object.fromEntries(data.map((t) => [typeKey(t), { active: true, quantity: '0' }])));
      })
      .catch(() => { if (!cancelled) setMessage({ type: 'error', text: 'Failed to load staged freight types' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aisle, token]);

  /** Toggles a row's active/inactive indicator — inactive means "leave this type completely untouched." */
  function toggleActive(key: string) {
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], active: !prev[key].active } }));
  }

  /** Sets a row's quantity, clamping to that row's max — used by the numpad submit, Max, and Clear Restage. */
  function setQuantity(key: string, raw: string, max: number) {
    const n = parseInt(raw, 10);
    const clamped = !raw || isNaN(n) ? '0' : String(Math.min(n, max));
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], quantity: clamped } }));
  }

  /** Submits the active rows' quantities via POST /api/staging/restage and reports a per-type summary. */
  async function apply() {
    if (!types || applying || loading) return;
    setApplying(true);
    setTimeout(() => setApplying(false), 1000);
    const aisleNum = parseInt(aisle, 10);
    const activeTypes = types.filter((t) => rows[typeKey(t)]?.active);
    try {
      const { results } = await apiFetch<RestageResponse>('/api/staging/restage', token!, {
        method: 'POST',
        body: JSON.stringify({
          aisle: aisleNum,
          types: activeTypes.map((t) => ({
            storageCode: t.storageCode,
            size: t.size,
            quantity: parseInt(rows[typeKey(t)].quantity, 10) || 0,
          })),
        }),
      });
      const anyShortfall = results.some((r) => r.shortfall > 0);
      const summary = results.length === 0
        ? 'No changes'
        : results
          .map((r) => {
            const label = `${r.storageCode}-${r.size}`;
            const base = r.staged > 0 ? `Restaged ${r.staged} ${label}` : `Cleared ${label}`;
            return r.shortfall > 0 ? `${base} (${r.shortfall} short)` : base;
          })
          .join(' · ');
      addLogEntry(summary, anyShortfall);
      playAlert(anyShortfall ? 'warning' : 'info');
      setMessage({ type: anyShortfall ? 'warning' : 'success', text: summary });
      bumpDataVersion();
      onClose();
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'Restage failed — please try again' });
    }
  }

  // No full-screen backdrop here (unlike other modals) — a click-blocking layer over the
  // whole screen would cover the bottom-right Numpad corner too, even though it's visually
  // transparent there, defeating the point of leaving that corner free for quantity entry.
  // Only the panel itself captures pointer events.
  return (
    <div className="absolute inset-0 z-50 pointer-events-none">
      <div className="absolute left-6 top-6 bottom-6 w-[900px] bg-[#0D0D0D] border border-[#2A2A2A] rounded-[20px] p-6 flex flex-col gap-4 shadow-[0_0_60px_20px_rgba(0,0,0,0.6)] pointer-events-auto">
        <div className="flex items-center justify-between shrink-0">
          <h2 className="font-ui text-[20px] font-semibold text-white">Unstage / Restage</h2>
          <span className="font-data text-[16px] text-[#9A9A9A]">Aisle {aisle}</span>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-3">
          {loading ? null : !types || types.length === 0 ? (
            <p className="font-ui text-[16px] text-[#555] text-center py-8">Nothing staged in Aisle {aisle}</p>
          ) : (
            types.map((t, i) => {
              const key = typeKey(t);
              const row = rows[key] ?? { active: true, quantity: '0' };
              const qty = parseInt(row.quantity, 10) || 0;
              const overMax = qty > t.max;
              const field = qtyFields[i];
              return (
                <div
                  key={key}
                  className={`flex items-center gap-4 px-4 py-3 rounded-[12px] border ${row.active ? 'border-[#3A3A3A] bg-[#111111]' : 'border-[#2A2A2A] bg-[#0A0A0A]'}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleActive(key)}
                    aria-label={`${row.active ? 'Deactivate' : 'Activate'} ${key}`}
                    className={`w-[40px] h-[40px] rounded-full border-2 shrink-0 transition-colors ${row.active ? 'bg-[#CC0000] border-[#CC0000]' : 'bg-[#0D0D0D] border-[#3A3A3A]'}`}
                  />
                  <div className={`flex-1 flex items-center gap-4 transition-opacity ${row.active ? '' : 'opacity-60 pointer-events-none'}`}>
                    <span className="font-data text-[20px] font-semibold text-white w-[100px]">{key}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-ui text-[13px] text-[#9A9A9A] uppercase tracking-wider">Qty</span>
                      <button
                        type="button"
                        onClick={() => field.focus((v) => { setQuantity(key, v, t.max); hidePanel(); })}
                        className={`flex items-center justify-center h-[48px] w-[90px] rounded-[10px] bg-[#0D0D0D] border-2 transition-colors ${field.isActive ? 'border-[#CC0000]' : 'border-[#3A3A3A] hover:border-[#555]'}`}
                      >
                        <span className="font-data text-[18px] font-medium text-white">
                          {field.value}
                        </span>
                      </button>
                    </div>
                    <span className={`font-ui text-[13px] font-medium ${overMax ? 'text-[#CC0000]' : 'text-[#9A9A9A]'}`}>
                      (max {t.max})
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(key, String(t.max), t.max)}
                      className="h-[40px] px-4 rounded-[8px] font-ui text-[13px] font-semibold border border-[#3A3A3A] text-[#9A9A9A] hover:border-[#555] hover:text-white transition-colors"
                    >
                      Max
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuantity(key, '0', t.max)}
                      className="h-[40px] px-4 rounded-[8px] font-ui text-[13px] font-semibold border border-[#3A3A3A] text-[#9A9A9A] hover:border-[#555] hover:text-white transition-colors"
                    >
                      Clear Restage
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex gap-3 shrink-0">
          <button type="button" onClick={onClose} className="flex-1 h-[56px] rounded-[12px] border border-[#3A3A3A] font-ui text-[16px] text-white">
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!types || types.length === 0 || loading || applying}
            className="flex-1 h-[56px] rounded-[12px] font-ui text-[16px] font-semibold bg-[#CC0000] hover:bg-[#DD0000] text-white disabled:opacity-40"
          >
            Apply
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
  // Fixed 3-character field — auto-commits like every other screen's Aisle field (ELZ/SDP/
  // LocationEntryFields), which Feature 2's live info panel relies on for its "no explicit
  // submit step" behavior, same reasoning as the Storage Code field below.
  const aisleField = useNumpadField('numpad', 3);
  // Fixed 2-character field — auto-commits like every other screen's Storage Code field
  // (ELA/ELZ/SDP), which Feature 2's live info panel relies on for its "no explicit submit
  // step" behavior.
  const storageField = useNumpadField('keyboard', 2);

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

  // Nothing left for Fill All to do once every stack already has its own Quantity — without
  // this, the button's enabled state never reflected quantity entry at all.
  const allStacksHaveQuantity = stacks.every((s) => !!s.quantity);

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
          disabled={!master.aisle || !master.storageCode || !master.size || allStacksHaveQuantity}
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
    if (state.storageCode) {
      // ELZ only ever supplies storageCode (no Size concept on that screen); ELA supplies
      // both. Apply whichever fields are present rather than requiring both together.
      setMaster({ storageCode: state.storageCode, ...(state.size ? { size: state.size } : {}) });
      // "Fill All" auto-triggers: every stack with no Quantity yet (all three, on entry)
      // inherits StorageCode (+ Size if supplied) — each still needs its own Quantity entered.
      [0, 1, 2].forEach((i) => updateStack(i as 0 | 1 | 2, {
        storageCode: state.storageCode!,
        ...(state.size ? { size: state.size } : {}),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state]);

  return (
    <div className="absolute inset-0 flex flex-col select-none">
      <MasterControl isIM={isIM} onUnstage={() => setUnstageOpen(true)} />
      <ForkGraphicArea />

      <div className="flex-1 flex flex-col overflow-y-auto border-t border-[#1C1C1C]">
        <InfoPanel aisle={master.aisle} storageCode={master.storageCode} size={master.size} />
        <LogPanel />
      </div>

      {unstageOpen && (
        <UnstageModal aisle={master.aisle || stacks[0].aisle} onClose={() => setUnstageOpen(false)} />
      )}
    </div>
  );
}

/** STG — Stage Aisle. StagingProvider (fork-state store) is mounted once, app-wide,
 *  in App.tsx — not here — so fork state survives navigating away and back. */
export function STGPage() {
  return <STGScreen />;
}
