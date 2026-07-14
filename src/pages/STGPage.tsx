import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Triple from '../assets/Triple.png';
import { AisleGrid, type GridLevel } from '../components/shared/AisleGrid';
import { CellValue } from '../components/shared/CellValue';
import { ReasonCodeField } from '../components/shared/ReasonCodeField';
import { SizeField } from '../components/shared/SizeField';
import { StorageCodeField } from '../components/shared/StorageCodeField';
import { useAuth } from '../context/AuthContext';
import { useMessageBar } from '../context/MessageBarContext';
import { useNumpad } from '../context/NumpadContext';
import { useStaging } from '../context/StagingContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { fmtLocation } from '../lib/fmt';
import { HOLD_REASON_CODES } from '../lib/holdReasonCodes';
import { SIZES, SIZE_NAMES } from '../lib/sizes';
import { useAisleFreightTypes } from '../lib/useAisleFreightTypes';
import { useNumpadField } from '../lib/useNumpadField';
import { useStorageCodes } from '../lib/useStorageCodes';

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

/**
 * Fetches up to `count` destination locations for the front stack in a single request —
 * the server walks the bin/level cursor forward internally now (issue #75: this used to
 * issue one HTTP round-trip per location, which is what made the list refresh feel slow
 * on every field defocus/commit, especially for a large Quantity). Since issue #77
 * collapsed STG down to one stageable position, there's no longer a sibling-stack
 * exclusion set to thread through here (contrast the pre-#77 version of this function).
 */
async function fetchStagingLocations(
  token: string,
  aisle: string,
  storageCode: string,
  size: string,
  count: number,
): Promise<string[]> {
  const params = new URLSearchParams({ aisle, storageCode, size, count: String(count) });
  const { locations } = await apiFetch<{ locations: string[] }>(
    `/api/staging/next-location?${params.toString()}`,
    token,
  );
  return locations;
}

// ── Small display helpers ──────────────────────────────────────────────────────

/** Labeled input display box used by the Master Control bar's Aisle field — a standalone
 *  field, not one of the shared field types from issue #78 (unlike Storage Code/Size,
 *  which now use StorageCodeField/SizeField below). */
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

/** A single pallet-styled input box, sized to sit inside the front-stack box. Two thin
 *  internal lines suggest pallet slats — kept distinct from the generic shared field
 *  components (issue #78) on purpose: this compact stacked-pallet visual is specific to
 *  STG's front-stack box, not a pattern reused elsewhere in the app. `emphasize` (used for
 *  Qty) makes the box taller and brighter — it's the field a GPMer taps most, since
 *  Aisle/Storage/Size normally arrive from Master Control's "Fill All". */
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

// ── Location suggestion reject/hold dialog ────────────────────────────────────

/** Default reason code offered when rejecting a suggested location (issue #77) — editable
 *  via the dropdown before confirming. */
const DEFAULT_REJECT_REASON = 'B05'; // "Blocked" — see holdReasonCodes.ts

/**
 * Confirmation popup for rejecting the front stack's currently suggested location (issue
 * #77). Confirming places a Hold Both (blocks both put and pull — the accessible-to-
 * everyone hold category, matching STG's all-roles access) with the chosen reason code;
 * cancelling leaves the original suggestion untouched. No full backdrop, and positioned in
 * the screen's upper half — same reasoning as UnstageModal below: a worker may need the
 * on-screen keyboard (for a custom reason code), which renders full-width at the bottom of
 * the screen, so this must never cover that zone.
 */
function RejectHoldDialog({ locationId, onClose, onHeld }: { locationId: string; onClose: () => void; onHeld: () => void }) {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const [reasonCode, setReasonCode] = useState(DEFAULT_REJECT_REASON);
  const [submitting, setSubmitting] = useState(false);

  /** Places a Hold Both on the rejected location with the chosen reason code, then signals the caller to recompute a new suggestion. */
  async function confirm() {
    if (!reasonCode || submitting) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/locations/${locationId}/hold`, token!, {
        method: 'PATCH',
        body: JSON.stringify({ holdType: 'HOLD_BOTH', reasonCode }),
      });
      playAlert('info');
      setMessage({ type: 'success', text: `${fmtLocation(locationId)} held — suggesting a new location` });
      onHeld();
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'Hold placement failed — please try again' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="absolute inset-0 z-50 pointer-events-none">
      <div className="absolute left-1/2 -translate-x-1/2 top-8 w-[480px] bg-[#0D0D0D] border border-[#2A2A2A] rounded-[20px] p-6 flex flex-col gap-4 shadow-[0_0_60px_20px_rgba(0,0,0,0.6)] pointer-events-auto">
        <h3 className="font-ui text-[19px] font-semibold text-white">Reject suggested location?</h3>
        <p className="font-ui text-[14px] text-[#9A9A9A]">
          <span className="font-data text-white">{fmtLocation(locationId)}</span> will be put on hold and a new
          location will be suggested. This does not stage anything.
        </p>
        <ReasonCodeField codes={HOLD_REASON_CODES} value={reasonCode} onChange={setReasonCode} label="Reason" />
        <div className="flex gap-3 mt-1">
          <button type="button" onClick={onClose} className="flex-1 h-[52px] rounded-[10px] border border-[#3A3A3A] font-ui text-[15px] text-white">
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={submitting || !reasonCode}
            className="flex-1 h-[52px] rounded-[10px] font-ui text-[15px] font-semibold bg-[#CC0000] hover:bg-[#DD0000] text-white disabled:opacity-40"
          >
            Confirm Hold
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Stack box ──────────────────────────────────────────────────────────────────

const STACK_LABELS = ['Staging', 'Next', 'On Deck'] as const;

/**
 * One of the three stack-entry boxes riding the forks (issue #81 — restores the three-
 * independent-stacks layout that #77 had collapsed to one, but keeps #77's rule that only
 * the front slot ever computes locations or stages). Pure data entry — Aisle/Storage/Size/
 * Qty — for whichever stack occupies `index` in StagingContext's compacting queue; no
 * location list or Stage button here (see LocationsPanel below, which owns those for
 * index 0 only). Index 0 is rendered at the rightmost position (closest to the Locations
 * panel), index 2 at the leftmost (closest to the mast/operator) — see STGScreen.
 */
function StackBox({ index }: { index: 0 | 1 | 2 }) {
  const { stacks, updateStack } = useStaging();
  const { hidePanel } = useNumpad();
  const stack = stacks[index];

  const aisleField = useNumpadField('numpad');
  const storageField = useNumpadField('keyboard');
  const quantityField = useNumpadField('numpad');

  // Keep the on-screen field displays in sync with context — covers the worker's own
  // confirm, master-control "Fill All", route-state pre-population from ELA/ELZ, and
  // queue compaction after a sibling stage, all of which mutate context directly rather
  // than going through these field hooks.
  useEffect(() => { aisleField.set(stack.aisle); }, [stack.aisle]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { storageField.set(stack.storageCode); }, [stack.storageCode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { quantityField.set(stack.quantity); }, [stack.quantity]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Registers this stack's Aisle field numpad handler; writes the confirmed value into StagingContext. */
  const focusAisleField = useCallback(() => {
    aisleField.focus((v) => { updateStack(index, { aisle: v.trim() }); hidePanel(); });
  }, [aisleField, hidePanel, index, updateStack]);

  /** Registers this stack's Storage Code field keyboard handler; writes the confirmed value into StagingContext. */
  const focusStorageField = useCallback(() => {
    storageField.focus((v) => { updateStack(index, { storageCode: v.trim().toUpperCase() }); hidePanel(); });
  }, [storageField, hidePanel, index, updateStack]);

  /** Registers this stack's Quantity field numpad handler; writes the confirmed value into StagingContext. */
  const focusQuantityField = useCallback(() => {
    quantityField.focus((v) => { updateStack(index, { quantity: v.trim() }); hidePanel(); });
  }, [quantityField, hidePanel, index, updateStack]);

  return (
    <div className="flex-1 min-w-0 flex flex-col items-stretch gap-1 h-full">
      <span className="font-ui text-[10px] font-semibold text-[#666] uppercase tracking-wider text-center shrink-0">
        {STACK_LABELS[index]}
      </span>
      <div className="flex-1 min-h-0 flex flex-col-reverse gap-[3px]">
        <PalletBox label="Aisle" value={aisleField.value} onFocus={focusAisleField} active={aisleField.isActive} />
        <PalletBox label="Storage" value={storageField.value} onFocus={focusStorageField} active={storageField.isActive} />
        <PalletSelect
          label="Size"
          ariaLabel={`${STACK_LABELS[index]} Size`}
          value={stack.size}
          onChange={(e) => updateStack(index, { size: e.target.value })}
        />
        <PalletBox label="Qty" value={quantityField.value} onFocus={focusQuantityField} active={quantityField.isActive} emphasize />
      </div>
    </div>
  );
}

// ── Locations panel ──────────────────────────────────────────────────────────────

/** Bubbles are laid out 5 per column, wrapping into additional columns beyond that (issue
 *  #81 — some HS stacks run up to 10 pallets, which needs 2 columns of 5 to stay legible;
 *  a generic chunk-by-5 handles any count without a hardcoded 2-column limit). */
function chunkBy5<T>(items: T[]): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += 5) chunks.push(items.slice(i, i + 5));
  return chunks;
}

/**
 * The front stack's (StagingContext stacks[0]) computed destination-location list and
 * Stage action — issue #81 restyles these as large tappable bubbles (5 per column, wrapping
 * into further columns past that) instead of the small inline text list #77 used, and moves
 * them into their own panel next to the three stack boxes rather than squeezed inside one.
 * Only the front slot ever reaches this panel — StackBox (index 1/2) has no equivalent.
 * The very next suggested location (`locations[0]`) is still a button — tapping it opens
 * the reject/hold flow rather than staging anything, unchanged from #77.
 */
function LocationsPanel() {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const { stacks, updateStack, resetStackAfterStage, addLogEntry, bumpDataVersion, dataVersion } = useStaging();
  const front = stacks[0];

  const [loading, setLoading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  // Set right before the recompute triggered by a reject/hold confirmation, so that
  // specific fetch resolution (and only that one) can report "no valid location remains"
  // per issue #77 — an ordinary shortfall from a large Quantity is not an error.
  const expectingSuggestionRef = useRef(false);

  // Live destination-location list for the front slot only: re-fetches whenever its input
  // fields change (including via queue compaction after a sibling stages), or `dataVersion`
  // bumps (a location was just held via the reject flow, or the manual Refresh button —
  // issue #76 — was pressed).
  useEffect(() => {
    const qty = parseInt(front.quantity, 10);
    if (!front.aisle || !front.storageCode || !front.size || !qty || qty <= 0) return;
    let cancelled = false;
    fetchStagingLocations(token!, front.aisle, front.storageCode, front.size, qty)
      .then((locations) => {
        if (cancelled) return;
        if (expectingSuggestionRef.current) {
          expectingSuggestionRef.current = false;
          if (locations.length === 0) {
            setMessage({ type: 'error', text: 'No valid location available to suggest' });
          }
        }
        updateStack(0, { locations, shortfall: Math.max(0, qty - locations.length) });
      })
      .catch(() => {
        if (!cancelled) setMessage({ type: 'error', text: 'Location lookup failed' });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [front.aisle, front.storageCode, front.size, front.quantity, dataVersion]);

  const qty = parseInt(front.quantity, 10) || 0;
  const canStage = !!front.aisle && !!front.storageCode && !!front.size && qty > 0 && front.locations.length > 0;

  /** Submits the front slot's assigned locations via POST /api/staging/stage, logs the outcome, and resets/compacts the queue on success. */
  async function handleStage() {
    if (!canStage || loading) return;
    setLoading(true);
    try {
      const result = await apiFetch<StageResult>('/api/staging/stage', token!, {
        method: 'POST',
        body: JSON.stringify({
          aisle: parseInt(front.aisle, 10),
          storageCode: front.storageCode,
          size: front.size,
          locationIds: front.locations,
        }),
      });

      const nextText = result.nextLocation ? fmtLocation(result.nextLocation) : 'no further locations';
      addLogEntry(`${result.staged.length} pallets staged in Aisle ${front.aisle} → next location ${nextText}`);

      if (result.shortfall > 0) {
        playAlert('warning');
        const requested = result.staged.length + result.shortfall;
        addLogEntry(
          `Warning: ${result.staged.length} of ${requested} locations available in Aisle ${front.aisle} — ${result.shortfall} pallets have no location`,
          true,
        );
        setMessage({ type: 'warning', text: `Staged ${result.staged.length} of ${requested} — ${result.shortfall} pallets unplaced` });
      } else {
        playAlert('info');
        setMessage({ type: 'success', text: `${result.staged.length} pallets staged in Aisle ${front.aisle}` });
      }

      resetStackAfterStage();
      bumpDataVersion();
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'Staging failed — please try again' });
    } finally {
      setLoading(false);
    }
  }

  /** A location was successfully held — closes the dialog and recomputes the suggestion (via dataVersion) without staging anything. */
  function handleHeld() {
    const rejected = rejectTarget;
    setRejectTarget(null);
    addLogEntry(`Rejected suggested location ${fmtLocation(rejected!)} — held and recalculating`);
    expectingSuggestionRef.current = true;
    bumpDataVersion();
  }

  const bubbles: { key: string; loc: string | null; isNext: boolean; isLast: boolean }[] = [
    ...front.locations.map((loc, i) => ({ key: loc, loc, isNext: i === 0, isLast: i === front.locations.length - 1 && front.shortfall === 0 })),
    ...Array.from({ length: front.shortfall }, (_, i) => ({ key: `shortfall-${i}`, loc: null, isNext: false, isLast: i === front.shortfall - 1 })),
  ];
  const columns = chunkBy5(bubbles);

  return (
    <div className="w-[340px] shrink-0 flex flex-col gap-1.5 p-2 bg-[#0A0A0A] border border-[#2A2A2A] rounded-[12px]">
      <span className="font-ui text-[12px] font-semibold text-[#9A9A9A] uppercase tracking-wider text-center shrink-0">
        Locations
      </span>

      {/* Bubble height/gap sized so 5 (a full column, per issue #81) fit this row's fixed
          270px height alongside the label and Stage button without scrolling; overflow-auto
          remains as a safety net for a shortfall-padded column that runs longer. */}
      <div data-testid="location-bubbles" className="flex-1 min-h-0 overflow-auto flex items-start justify-center gap-2 p-1">
        {columns.length === 0 && (
          <span className="font-data text-[14px] text-[#444] text-center self-center">—</span>
        )}
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-1.5">
            {col.map((b) => {
              if (b.loc === null) {
                return (
                  <span
                    key={b.key}
                    className="min-w-[112px] h-[32px] px-2 flex items-center justify-center rounded-full border-2 border-[#CC0000] bg-[#2A0D0D] font-ui text-[11px] font-bold text-[#FF6666] text-center whitespace-nowrap"
                  >
                    No Location
                  </span>
                );
              }
              // The next suggestion (first overall) is a tap target — tapping it opens the
              // reject/hold flow, not staging (per issue #77, unchanged by #81).
              if (b.isNext) {
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => setRejectTarget(b.loc)}
                    className={`min-w-[112px] h-[32px] px-2 flex items-center justify-center rounded-full border-2 font-data text-[13px] font-bold text-center whitespace-nowrap transition-colors ${
                      b.isLast ? 'border-[#FF4444] bg-[#2A0D0D] text-[#FF4444]' : 'border-[#3A6BB0] bg-[#132C4D] text-white hover:border-[#5A8BD0]'
                    }`}
                  >
                    {fmtLocation(b.loc)}
                  </button>
                );
              }
              return (
                <span
                  key={b.key}
                  className={`min-w-[112px] h-[32px] px-2 flex items-center justify-center rounded-full border-2 font-data text-[13px] font-bold text-center whitespace-nowrap ${
                    b.isLast ? 'border-[#FF4444] bg-[#2A0D0D] text-[#FF4444]' : 'border-[#3A6BB0] bg-[#132C4D] text-white'
                  }`}
                >
                  {fmtLocation(b.loc)}
                </span>
              );
            })}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleStage}
        disabled={!canStage || loading}
        className="w-full h-[48px] rounded-[10px] font-ui text-[16px] font-bold tracking-wide bg-[#CC0000] hover:bg-[#DD0000] text-white disabled:opacity-40 transition-colors shrink-0"
      >
        STAGE
      </button>

      {rejectTarget && (
        <RejectHoldDialog locationId={rejectTarget} onClose={() => setRejectTarget(null)} onHeld={handleHeld} />
      )}
    </div>
  );
}

// ── Fork graphic ─────────────────────────────────────────────────────────────

/**
 * The Triple.png fork-truck graphic, flipped so the forks point right and shortened to
 * reclaim vertical space (issue #77), then narrowed to a fixed width (issue #81) to make
 * room for three stack boxes plus a separate, larger Locations panel — the issue's own
 * stated reason for shrinking the graphic in the first place. The image is mirrored via a
 * horizontal CSS transform rather than a second asset — the fork/mast span (originally the
 * left ~82%) now renders on the right, and the cab (originally the right ~18%) now renders
 * on the left, which is exactly where the Fill All / Unstage Aisle buttons belong per issue
 * #77 ("top-left of the triple graphic, over the operator's compartment").
 */
function TripleGraphic({ isIM, onFillAll, fillAllDisabled, onUnstage }: {
  isIM: boolean;
  onFillAll: () => void;
  fillAllDisabled: boolean;
  onUnstage: () => void;
}) {
  return (
    <div className="relative w-[200px] shrink-0 h-[270px] select-none">
      {/* object-contain, not object-fill (unlike the pre-#81 flex-1 version) — at this
          fixed 200px width the image's native ~2.8:1 aspect ratio would otherwise stretch
          into an illegible sliver; contain keeps the truck recognizable, just smaller. */}
      <img
        src={Triple}
        alt=""
        className="absolute inset-0 w-full h-full object-contain opacity-90 pointer-events-none [transform:scaleX(-1)]"
      />
      <div className="absolute left-3 top-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={onFillAll}
          disabled={fillAllDisabled}
          className="h-[44px] px-5 rounded-[10px] font-ui text-[14px] font-semibold bg-[#003366] hover:bg-[#004488] text-white disabled:opacity-40 transition-colors"
        >
          Fill All
        </button>
        {isIM && (
          // Larger and red (issue #74) — its destructive nature (clears staged locations)
          // should stand out, now doubly so since it lives right next to Fill All.
          <button
            type="button"
            onClick={onUnstage}
            className="h-[56px] px-6 rounded-[10px] font-ui text-[16px] font-bold bg-[#CC0000] hover:bg-[#DD0000] text-white transition-colors shadow-[0_0_20px_4px_rgba(204,0,0,0.35)]"
          >
            Unstage Aisle
          </button>
        )}
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
 * stage/restage actually commits or the manual Refresh button is pressed (`dataVersion`) —
 * never from the fork graphic's own candidate-location lookups, which are unrelated to
 * these fields.
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
  // MasterControl/StackBox syncing their fields from context after external updates.
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

/** Top control bar: shared Aisle/StorageCode/Size and the manual Refresh button (issue
 *  #76). "Fill All" and "Unstage Aisle" moved onto the fork graphic itself (issue #77). */
function MasterControl({ onRefresh }: { onRefresh: () => void }) {
  const { master, setMaster } = useStaging();
  const { hidePanel } = useNumpad();
  // Fixed 3-character field — auto-commits like every other screen's Aisle field (ELZ/SDP/
  // LocationEntryFields), which Feature 2's live info panel relies on for its "no explicit
  // submit step" behavior, same reasoning as the Storage Code field below. padOnSubmit:
  // typing "5" and hitting OK is accepted as "005", same as those other screens.
  const aisleField = useNumpadField('numpad', 3, true);

  useEffect(() => { aisleField.set(master.aisle); }, [master.aisle]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Registers the master Aisle field's numpad handler; writes the confirmed value into the shared master state. */
  const focusAisleField = useCallback(() => {
    aisleField.focus((v) => { setMaster({ aisle: v.trim() }); hidePanel(); });
  }, [aisleField, hidePanel, setMaster]);

  // Narrows the Storage Code/Size dropdown-helpers (issue #80) to what's actually present
  // once an aisle is entered — the live info panel below stays fully unfiltered regardless.
  const aisleNum = parseInt(master.aisle, 10);
  const aisleTypes = useAisleFreightTypes(isNaN(aisleNum) ? null : aisleNum);
  const fullStorageCodes = useStorageCodes();
  const storageCodeOptions = aisleTypes && fullStorageCodes
    ? fullStorageCodes.filter((c) => aisleTypes.storageCodes.includes(c.code))
    : undefined;
  const sizeOptions = aisleTypes
    ? aisleTypes.sizesFor(master.storageCode || undefined).map((s) => ({ code: s, desc: SIZE_NAMES[s] }))
    : undefined;

  return (
    <div className="flex items-end justify-between pt-3 pb-4 border-b border-[#1C1C1C] shrink-0 px-4">
      <div className="flex items-end gap-4">
        <StorageCodeField value={master.storageCode} onChange={(v) => setMaster({ storageCode: v })} options={storageCodeOptions} size="compact" />
        <FieldDisplay label="Aisle" value={aisleField.value} onFocus={focusAisleField} active={aisleField.isActive} width="w-[120px]" />
        <SizeField value={master.size} onChange={(v) => setMaster({ size: v })} options={sizeOptions} size="compact" ariaLabel="Master Size" />
      </div>

      {/* Manual Refresh (issue #76) — reloads the live info panel and the front stack's
          suggested location, independent of the automatic refresh already triggered by
          field commits (issue #75 tracks that automatic path being slow). */}
      <button
        type="button"
        onClick={onRefresh}
        className="h-[44px] px-5 rounded-[10px] font-ui text-[14px] font-semibold border border-[#3A3A3A] text-[#9A9A9A] hover:border-[#555] hover:text-white transition-colors"
      >
        Refresh
      </button>
    </div>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

/** Assembles the STG screen: Master Control, the fork graphic with its three stack boxes
 *  and Locations panel (issue #81), a live zone map for Master Control's Aisle/StorageCode,
 *  and the Log Panel at the very bottom. */
function STGScreen() {
  const { user } = useAuth();
  const { setMessage } = useMessageBar();
  const routerLocation = useLocation();
  const { stacks, updateStack, master, setMaster, bumpDataVersion } = useStaging();
  const [unstageOpen, setUnstageOpen] = useState(false);
  const isIM = ['IM', 'LEAD', 'MANAGER', 'ADMIN'].includes(user?.role ?? '');

  // Pre-population from ELA "Stage Aisle" / ELZ "Stage Aisle" — see STG.md's
  // Pre-population section. Only applied once per navigation (route state is consumed, not
  // re-applied on every render) — the front slot's empty aisle is used as the "not yet
  // applied" signal. Issue #81 restored the three-stack model, so "Fill All" auto-
  // triggering on entry means applying storageCode/size to all three slots again, matching
  // the pre-#77 behavior — each still needs its own Quantity before it can be staged.
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
      ([0, 1, 2] as const).forEach((i) => updateStack(i, {
        storageCode: state.storageCode!,
        ...(state.size ? { size: state.size } : {}),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state]);

  /** Applies Master Control's Aisle/StorageCode/Size to every stack slot that doesn't have a Quantity yet (issue #81 — restores the pre-#77 "Fill All" behavior; never triggers the reject/hold flow). */
  function fillAll() {
    ([0, 1, 2] as const).forEach((i) => {
      if (!stacks[i].quantity) updateStack(i, { aisle: master.aisle, storageCode: master.storageCode, size: master.size });
    });
  }

  // Nothing left for Fill All to do once every slot already has its own Quantity.
  const allStacksHaveQuantity = stacks.every((s) => !!s.quantity);

  /** Manual Refresh (issue #76): reloads the live info panel and the front slot's suggestion without changing any field. */
  function handleRefresh() {
    bumpDataVersion();
    setMessage({ type: 'info', text: 'Refreshed' });
  }

  return (
    <div className="absolute inset-0 flex flex-col select-none">
      <MasterControl onRefresh={handleRefresh} />

      {/* Explicit height (not just items-stretch) so each stack box's and the Locations
          panel's internal flex-1/min-h-0 chains have a real bound to shrink against —
          matching the old ForkGraphicArea's `top-0 bottom-[20%]` absolute-positioning
          trick, which gave its StackPanel children the same kind of implicit bounded
          height. Without this, content overflows past 270px and gets hidden under the
          bottom-right Numpad panel. */}
      <div className="flex items-stretch gap-3 mx-4 mt-3 h-[270px]">
        <TripleGraphic
          isIM={isIM}
          onFillAll={fillAll}
          fillAllDisabled={!master.aisle || !master.storageCode || !master.size || allStacksHaveQuantity}
          onUnstage={() => setUnstageOpen(true)}
        />
        {/* Issue #81: three independent stack boxes ride the forks; index 2 (back, closest
            to the mast) renders leftmost, index 0 (front, "the end of the forks") renders
            rightmost, right next to the Locations panel that's wired to it exclusively. */}
        <StackBox index={2} />
        <StackBox index={1} />
        <StackBox index={0} />
        <LocationsPanel />
      </div>

      <div className="flex-1 flex flex-col overflow-y-auto border-t border-[#1C1C1C] mt-3">
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
