import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Triple from '../assets/Triple.png';
import { AisleGrid, type GridLevel, type ZoneBinRange } from '../components/shared/AisleGrid';
import { AisleSizeTable, type AisleSizeRow, type AisleSizeSort } from '../components/shared/AisleSizeTable';
import { type CodeOption } from '../components/shared/CodePickerField';
import { NumpadFieldBox } from '../components/shared/NumpadFieldBox';
import { ReasonCodeField } from '../components/shared/ReasonCodeField';
import { SizeField } from '../components/shared/SizeField';
import { ZoneCodeBadge } from '../components/shared/ZoneCodeBadge';
import { StorageCodeField } from '../components/shared/StorageCodeField';
import { useAuth } from '../context/AuthContext';
import { useMessageBar } from '../context/MessageBarContext';
import { useNumpad } from '../context/NumpadContext';
import { useStaging } from '../context/StagingContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { fmtLocation } from '../lib/fmt';
import { HOLD_REASON_CODES } from '../lib/holdReasonCodes';
import { INVALID_WASH } from '../lib/invalidWash';
import { SIZE_NAMES } from '../lib/sizes';
import { effectiveStack } from '../lib/stagingHelpers';
import { useAisleField } from '../lib/useAisleField';
import { useAisleFreightTypes } from '../lib/useAisleFreightTypes';
import { useCodePickerField } from '../lib/useCodePickerField';
import { useNumpadField } from '../lib/useNumpadField';
import { useStorageCodes } from '../lib/useStorageCodes';
import { groupBreakdownByStorageCode } from '../lib/zoneSummary';

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
  zoneBinRanges: ZoneBinRange[];
}

type AisleRow = AisleSizeRow;

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
  zone?: string,
): Promise<string[]> {
  const params = new URLSearchParams({ aisle, storageCode, size, count: String(count) });
  if (zone) params.set('zone', zone);
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
  label, value, onFocus, active = false, width = 'w-[160px]', invalid = false,
}: { label: string; value: string; onFocus: () => void; active?: boolean; width?: string; invalid?: boolean }) {
  return (
    <NumpadFieldBox
      label={label}
      value={value}
      onFocus={onFocus}
      active={active}
      invalid={invalid}
      width={width}
      centered
      labelClass="text-[12px]"
      boxClass="h-[52px] px-3 rounded-[10px]"
      valueClass="text-[20px] font-medium"
      caretClass="w-[2px] h-[22px]"
    />
  );
}

/** A single pallet-styled input box, sized to sit inside the front-stack box. Two thin
 *  internal lines suggest pallet slats — kept distinct from the generic shared field
 *  components (issue #78) on purpose: this compact stacked-pallet visual is specific to
 *  STG's front-stack box, not a pattern reused elsewhere in the app. `tinted` shades the
 *  box with a 50%-transparent blue — used for Qty always (v1.6.6, changed from red to
 *  blue in issue #99 to match that issue's own override-cell color), and for Aisle
 *  whenever its per-field override is active (issue #99). `large` doubles the label/value
 *  font size — Qty only (issue #99 follow-up), since Qty's own row now absorbs the extra
 *  height Clear/Fill's old row used to occupy and reads oddly undersized at that height
 *  with the same small text every other field uses. */
/** `reserveToggleSpace` mirrors `InheritedDisplay`'s own prop of the same name (#127) —
 *  reserves the same trailing width `PalletCodePicker`'s own popup toggle button occupies,
 *  so a field whose *overridden* state renders as a plain `PalletBox` (Aisle) ends up the
 *  same fixed width as one whose overridden state renders as a `PalletCodePicker`
 *  (Storage/Size/Zone) — without this, Aisle's box rendered visibly wider than Storage's/
 *  Size's, since only PalletCodePicker's own flex-1 wrapper splits its width with a `▾`
 *  button sibling. */
function PalletBox({
  label, value, onFocus, active = false, tinted = false, large = false, reserveToggleSpace = false, invalid = false,
}: { label: string; value: string; onFocus: () => void; active?: boolean; tinted?: boolean; large?: boolean; reserveToggleSpace?: boolean; invalid?: boolean }) {
  return (
    <div className="relative flex-1 min-h-0 flex items-stretch gap-1">
      <button
        type="button"
        onClick={onFocus}
        className={`relative flex-1 min-w-0 flex items-center justify-between px-2 rounded-[5px] border-2 transition-colors min-h-0 ${
          invalid ? INVALID_WASH : tinted ? 'bg-[#3A6BB080]' : 'bg-[#0D0D0D]'
        } ${invalid ? '' : active ? 'border-[#CC0000]' : 'border-[#3A3A3A] hover:border-[#555]'}`}
      >
        <span className="absolute left-1.5 right-1.5 top-1/3 h-px bg-black/40" />
        <span className="absolute left-1.5 right-1.5 top-2/3 h-px bg-black/40" />
        <span className={`relative font-ui font-medium uppercase tracking-wider text-[#9A9A9A] ${large ? 'text-[18px]' : 'text-[9px]'}`}>
          {label}
        </span>
        <span className={`relative font-data font-semibold text-white ${large ? 'text-[30px]' : 'text-[15px]'}`}>
          {value || <span className="text-[#444]">—</span>}
        </span>
        {active && <span className="absolute right-1 top-1 bottom-1 w-[2px] bg-[#CC0000] animate-pulse rounded-sm" />}
      </button>
      {reserveToggleSpace && <span className="shrink-0 w-[20px]" aria-hidden />}
    </div>
  );
}

/** Display of a field currently inheriting Master Control's value (issue #99) — same
 *  visual chrome as PalletBox (so swapping between this and the real entry field on
 *  override-toggle never shifts layout). Tapping it activates that field's override
 *  directly (STG fix — previously required tapping the separate OVERRIDE toggle first).
 *  `reserveToggleSpace` reserves the same trailing width `PalletCodePicker`'s own popup
 *  toggle button occupies (STG fix — Storage/Size/Zone's box was narrower than Aisle's
 *  while overridden, since only they have that extra button eating into their row's
 *  shared space; reserving the same space here keeps the box itself a fixed width
 *  whether the field is overridden or not). */
function InheritedDisplay({ label, value, onActivate, reserveToggleSpace = false }: { label: string; value: string; onActivate: () => void; reserveToggleSpace?: boolean }) {
  return (
    <div className="relative flex-1 min-h-0 flex items-stretch gap-1">
      <button
        type="button"
        onClick={onActivate}
        className="relative flex-1 min-w-0 flex items-center justify-between px-2 rounded-[5px] border-2 border-[#3A3A3A] bg-[#0D0D0D] hover:border-[#555] transition-colors"
      >
        <span className="absolute left-1.5 right-1.5 top-1/3 h-px bg-black/40" />
        <span className="absolute left-1.5 right-1.5 top-2/3 h-px bg-black/40" />
        <span className="relative font-ui font-medium uppercase tracking-wider text-[#9A9A9A] text-[9px]">
          {label}
        </span>
        <span className="relative font-data font-semibold text-white text-[15px]">
          {value || <span className="text-[#444]">—</span>}
        </span>
      </button>
      {reserveToggleSpace && <span className="shrink-0 w-[20px]" aria-hidden />}
    </div>
  );
}

/** Toggle arming/disarming one field's override (issue #99) — rendered to the *left* of
 *  its field, wide enough to spell out "Override" rather than an icon. Solid blue (0%
 *  transparent) when active, matching the field's own 50%-transparent blue per the issue's
 *  spec; plain outline otherwise. */
function OverrideToggle({ active, onClick, ariaLabel }: { active: boolean; onClick: () => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={`shrink-0 w-[60px] rounded-[5px] border-2 flex items-center justify-center transition-colors ${
        active ? 'border-[#3A6BB0] bg-[#3A6BB0] text-white' : 'border-[#3A3A3A] text-[#9A9A9A] hover:border-[#555] hover:text-white'
      }`}
    >
      <span className="font-ui text-[9px] font-bold uppercase tracking-wide">Override</span>
    </button>
  );
}

/**
 * Pallet-styled entry + dropdown-helper field — PalletBox's own visual chrome (flex-1
 * height, `rounded-[5px]`, slat lines, corner label baked into the box) with
 * CodePickerField's tap-to-type-or-pick-from-popup interaction. Used for Storage/Size on
 * a stack (STG's per-stack scoped-entry checklist item) — CodePickerField itself isn't
 * reskinnable to this box's exact rounding/height/label position via its own props (its
 * `size` variants target filter-bar-style boxes, not this pallet-slat look), so this is a
 * dedicated local component reimplementing just enough of CodePickerField's own
 * field+popup logic to match, rather than a StorageCodeField/SizeField call site directly.
 *
 * Owns its own aisle-narrowing internally (Feature 10) via `field`/`aisle`/
 * `storageCodeForSize` — same `useAisleFreightTypes`-backed mechanism `StorageCodeField`/
 * `SizeField` use, so STG's callers (StackBox/MasterControl) no longer need to compute
 * `storageOptions`/`sizeOptions`/`storageStrict`/`sizeStrict` themselves. Always validates
 * against the narrowed (not full) list — matching STG's own established intent ("a typed
 * value not actually present in this aisle" should be flagged, see the callers' own prior
 * comment) — unlike `StorageCodeField`'s default, since a stack's value must actually
 * resolve within its own aisle to be usable at all. `field: 'zone'` skips narrowing
 * entirely (Zone never narrows by aisle, matching `ZoneField`'s own fixed 4-value list) —
 * still routed through this same component rather than the shared `ZoneField` purely for
 * chrome (see this component's own top doc), not because Zone shares Storage/Size's
 * dependency-prop shape.
 */
function PalletCodePicker({
  label, ariaLabel, value, onChange, field: fieldKind, aisle, storageCodeForSize, maxLength, transform, earlyCommit, onInvalid, onValidityChange, tinted = false, invalid: forcedInvalid = false,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  onChange: (v: string) => void;
  /** Discriminates which narrowing this instance needs — Storage narrows by aisle alone,
   *  Size narrows by aisle *and* the stack's own current Storage Code, Zone never narrows. */
  field: 'storageCode' | 'size' | 'zone';
  /** Dependency prop (Feature 10) — the stack's own *effective* Aisle (inherited or
   *  overridden), `null` while not yet resolved/parseable. Ignored when `field === 'zone'`. */
  aisle: number | null;
  /** Only meaningful when `field === 'size'` — the stack's own *effective* Storage Code,
   *  further narrowing Size within `aisle`. */
  storageCodeForSize?: string;
  maxLength?: number;
  transform?: (raw: string) => string;
  earlyCommit?: (value: string) => boolean;
  /** Fires on a strict-mode commit-reject (the value stays visible, washed, rather than
   *  clearing — #109). Strict is always on here (STG's own established intent), gated
   *  automatically while the narrowing data is still loading, same as every other field. */
  onInvalid?: (code: string) => void;
  /** See `useCodePickerField`'s own doc — fires reactively on this field's own computed
   *  validity (Feature 10), independent of the commit-time `onInvalid` above. */
  onValidityChange?: (invalid: boolean) => void;
  /** 50%-transparent blue field background — set whenever this field's override is active
   *  (issue #99; PalletCodePicker is only ever rendered for Storage/Size while overridden,
   *  see StackBox, so every call site passes this as always-true). */
  tinted?: boolean;
  /** Forces the wash on top of this field's own internal narrowed-list check — not needed
   *  for the ordinary case, which the field now handles on its own (Feature 10). */
  invalid?: boolean;
}) {
  // Always called (Rules of Hooks) — internally no-ops (returns null) while `aisle` is
  // null, and simply unused for `field === 'zone'`.
  const aisleTypes = useAisleFreightTypes(fieldKind === 'zone' ? null : aisle);
  const fullStorageCodes = useStorageCodes();
  const options: CodeOption[] = fieldKind === 'zone'
    ? ZONE_OPTIONS
    : aisleTypes
      ? fieldKind === 'storageCode'
        ? (fullStorageCodes ?? []).filter((c) => aisleTypes.storageCodes.includes(c.code))
        : aisleTypes.sizesFor(storageCodeForSize || undefined).map((s) => ({ code: s, desc: SIZE_NAMES[s] }))
      : [];
  const optionsLoading = fieldKind === 'zone' ? false : aisleTypes === null || (fieldKind === 'storageCode' && fullStorageCodes === null);

  const { field, open, setOpen, wrapperRef, focusField, selectOption, invalid: computedInvalid } = useCodePickerField(value, onChange, options, {
    panel: 'keyboard', maxLength, transform, earlyCommit, strict: true, onInvalid, onValidityChange, optionsLoading,
  });
  const invalid = forcedInvalid || computedInvalid;

  return (
    <div ref={wrapperRef} className="relative flex-1 min-h-0 flex items-stretch gap-1">
      <button
        type="button"
        onClick={focusField}
        aria-label={ariaLabel}
        className={`relative flex-1 min-w-0 flex items-center justify-between px-2 rounded-[5px] border-2 transition-colors ${
          invalid ? INVALID_WASH : tinted ? 'bg-[#3A6BB080]' : 'bg-[#0D0D0D]'
        } ${invalid ? '' : field.isActive ? 'border-[#CC0000]' : 'border-[#3A3A3A] hover:border-[#555]'}`}
      >
        <span className="absolute left-1.5 right-1.5 top-1/3 h-px bg-black/40" />
        <span className="absolute left-1.5 right-1.5 top-2/3 h-px bg-black/40" />
        <span className="relative font-ui font-medium uppercase tracking-wider text-[#9A9A9A] text-[9px]">
          {label}
        </span>
        <span className="relative font-data font-semibold text-white text-[15px]">
          {field.value || <span className="text-[#444]">—</span>}
        </span>
        {field.isActive && <span className="absolute right-1 top-1 bottom-1 w-[2px] bg-[#CC0000] animate-pulse rounded-sm" />}
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`${ariaLabel} options`}
        className={`shrink-0 w-[20px] rounded-[5px] border-2 flex items-center justify-center transition-colors ${
          open ? 'border-[#CC0000] text-white' : 'border-[#3A3A3A] text-[#9A9A9A] hover:border-[#555] hover:text-white'
        }`}
      >
        <span className="text-[9px]">▾</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 min-w-[160px] w-max max-w-[240px] max-h-[220px] overflow-y-auto bg-[#0D0D0D] border border-[#3A3A3A] rounded-[10px] shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
          {options.length === 0 ? (
            <p className="font-ui text-[12px] text-[#555] px-3 py-2">No values available</p>
          ) : (
            options.map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => selectOption(opt.code)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1A1A1A] transition-colors border-b border-[#1A1A1A] last:border-b-0"
              >
                <span className="font-data text-[13px] font-semibold text-white shrink-0">{opt.code}</span>
                <span className="font-ui text-[11px] text-[#9A9A9A] truncate">— {opt.desc}</span>
              </button>
            ))
          )}
        </div>
      )}
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

/** Fixed zone options (1-4) for the per-stack Zone override's dropdown-helper popup — a
 *  small known set, unlike Storage Code/Size which depend on the stack's own aisle. */
const ZONE_OPTIONS: CodeOption[] = ['1', '2', '3', '4'].map((z) => ({ code: z, desc: `Zone ${z}` }));

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
  const { stacks, updateStack, master } = useStaging();
  const { hidePanel } = useNumpad();
  const { token } = useAuth();
  const { setMessage, clearMessage } = useMessageBar();
  const stack = stacks[index];
  // Resolved Aisle/StorageCode/Size — Master Control's current value for any field this
  // stack doesn't override, its own stored value for any field that is overridden (issue
  // #99). Every non-Qty field below reads from here, never straight off `stack.*`.
  const effective = effectiveStack(stack, master);

  const quantityField = useNumpadField('numpad');

  // Aisle entry field (issue #161) — existence check now owned internally by the shared
  // hook (previously this stack's own `handleAisleConfirm`, reusing `GET /api/locations/
  // empty-by-zone` purely for its NOT_FOUND side effect; switched to the purpose-built
  // `aisle-exists` endpoint, confirmed to check the identical condition server-side — see
  // useAisleField's own doc). `PalletBox`'s own distinct pallet-slat chrome (deliberately
  // not one of the generic shared field components — see its own doc comment) is kept
  // exactly as-is; only the data/validation source changes here.
  const aisleFields = useAisleField({
    fetch: useCallback((aisle) => apiFetch<{ exists: boolean }>(`/api/locations/aisle-exists?aisle=${aisle}`, token!), [token]),
    onConfirm: useCallback((v) => { hidePanel(); updateStack(index, { aisle: v }); }, [hidePanel, index, updateStack]),
    onResolved: useCallback(() => { clearMessage(); }, [clearMessage]),
    onNotFound: useCallback(() => {
      playAlert('error');
      setMessage({ type: 'error', text: `${STACK_LABELS[index]} Stack - Aisle - Invalid Entry` });
    }, [index, setMessage]),
  });

  // Keep the on-screen field displays in sync with context — covers the worker's own
  // confirm, an override toggling on (pre-filled from Master Control), route-state
  // pre-population from ELA/ELZ, and queue compaction after a sibling stage, all of which
  // mutate context directly rather than going through these field hooks.
  useEffect(() => { aisleFields.field.set(stack.aisle); }, [stack.aisle]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { quantityField.set(stack.quantity); }, [stack.quantity]); // eslint-disable-line react-hooks/exhaustive-deps

  // Storage/Size are PalletCodePicker instances (STG's own chrome, StorageCodeField/
  // SizeField's shared shape) narrowed to this stack's own *effective* Aisle/StorageCode
  // (the open STG validation-checklist item — "storage and size should be entries with
  // scoped dropdowns based on the aisle for that stack" — corrected from an earlier plain-
  // `<select>` pass to match Master Control's own entry-box-plus-popup interaction, per
  // direct instruction). A typed value is validated the same as a popup selection would be
  // — previously a worker typing a code not actually present in this aisle committed
  // silently with no error, unlike Aisle just below. `PalletCodePicker` now owns its own
  // narrowing fetch and validity computation internally (Feature 10) — this stack only
  // needs to pass its own effective Aisle/Storage Code as dependency props.
  const stackAisleNum = parseInt(effective.aisle, 10);
  const stackAisle = isNaN(stackAisleNum) ? null : stackAisleNum;
  /** Reacts to `PalletCodePicker`'s own reactive validity (Feature 10) — plays the same
   *  error tone/message-bar line this always has, now sourced from the field's internal
   *  check instead of a commit-only callback (also catches a value that becomes invalid
   *  later because Aisle changed underneath it, not just at the moment of typing). The
   *  wash itself no longer needs tracking here at all — `PalletCodePicker` washes itself. */
  const handleStorageValidityChange = useCallback((inv: boolean) => {
    if (inv) {
      playAlert('error');
      setMessage({ type: 'error', text: `${STACK_LABELS[index]} Stack - Storage Code - Invalid Entry` });
    }
  }, [index, setMessage]);
  const handleSizeValidityChange = useCallback((inv: boolean) => {
    if (inv) {
      playAlert('error');
      setMessage({ type: 'error', text: `${STACK_LABELS[index]} Stack - Size - Invalid Entry` });
    }
  }, [index, setMessage]);
  const handleZoneValidityChange = useCallback((inv: boolean) => {
    if (inv) {
      playAlert('error');
      setMessage({ type: 'error', text: `${STACK_LABELS[index]} Stack - Zone - Invalid Entry` });
    }
  }, [index, setMessage]);

  /** Registers this stack's Quantity field numpad handler; writes the confirmed value into StagingContext. */
  const focusQuantityField = useCallback(() => {
    quantityField.focus((v) => { updateStack(index, { quantity: v.trim() }); hidePanel(); });
  }, [quantityField, hidePanel, index, updateStack]);

  // Per-field override toggles (issue #99). Arming an override pre-fills that field with
  // Master Control's *current* value (so the worker edits from a sensible starting point
  // instead of blank); disarming clears the stack's own stored value back out (it's unused
  // while not overridden anyway — effectiveStack always reads Master Control for it — but
  // clearing it avoids a stale value quietly resurfacing next time the override arms again).
  const toggleAisleOverride = useCallback(() => {
    aisleFields.clear();
    updateStack(index, stack.aisleOverride ? { aisleOverride: false, aisle: '' } : { aisleOverride: true, aisle: master.aisle });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, stack.aisleOverride, master.aisle, updateStack]);
  const toggleStorageOverride = useCallback(() => {
    updateStack(index, stack.storageCodeOverride ? { storageCodeOverride: false, storageCode: '' } : { storageCodeOverride: true, storageCode: master.storageCode });
  }, [index, stack.storageCodeOverride, master.storageCode, updateStack]);
  const toggleSizeOverride = useCallback(() => {
    updateStack(index, stack.sizeOverride ? { sizeOverride: false, size: '' } : { sizeOverride: true, size: master.size });
  }, [index, stack.sizeOverride, master.size, updateStack]);
  // Zone has no Master Control field to pre-fill from (unlike Aisle/Storage/Size) — arming
  // just starts it blank, disarming clears it back out the same as the others.
  const toggleZoneOverride = useCallback(() => {
    updateStack(index, stack.zoneOverride ? { zoneOverride: false, zone: '' } : { zoneOverride: true, zone: '' });
  }, [index, stack.zoneOverride, updateStack]);

  /** Clears this one stack's Aisle/Storage/Size/Zone/Qty (and any active overrides on them)
   *  and any computed locations/shortfall — the single-slot version of `clearForks()`'s own
   *  logic, independent of the other two stacks (mirrors STG#06's per-stack scoping).
   *  Storage/Size/Zone's own invalid state no longer needs resetting here (Feature 10) —
   *  clearing `value` to `''` below already reads as valid via each field's own internal
   *  check; only Aisle still needs an explicit reset since its own existence check isn't
   *  routed through useCodePickerField at all. */
  const clearStack = useCallback(() => {
    aisleFields.clear();
    updateStack(index, {
      aisle: '', storageCode: '', size: '', quantity: '', locations: [], shortfall: 0,
      aisleOverride: false, storageCodeOverride: false, sizeOverride: false,
      zone: '', zoneOverride: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, updateStack]);

  return (
    <div
      className={`flex-1 min-w-0 flex flex-col items-stretch gap-1 h-full ${
        index === 0 ? 'border-2 border-[#3A6BB0] bg-[#3A6BB033] rounded-[8px] p-1' : ''
      }`}
    >
      {/* Staging (index 0, the front/active slot — the only one that computes locations and
       *  stages) reads larger and red to stand out from Next/On Deck — also gets its own
       *  blue box (border + 80%-transparent fill, per direct instruction) to set it apart
       *  from Next/On Deck at a glance, not just via the label's own color/size. */}
      <span
        className={`font-ui font-semibold uppercase tracking-wider text-center shrink-0 ${
          index === 0 ? 'text-[12.5px] text-[#CC0000]' : 'text-[10px] text-[#666]'
        }`}
      >
        {STACK_LABELS[index]}
      </span>
      {/* flex-col-reverse displays its *last* DOM child at the top — the combined Clear/Qty
       *  row is listed last here specifically so it renders directly under the stack label
       *  above, same as "Fill from Master" used to (v1.6.6), before issue #99 removed Fill
       *  and merged Clear into Qty's own row. */}
      <div className="flex-1 min-h-0 flex flex-col-reverse gap-[3px]">
        {/* Aisle — a non-interactive display of Master Control's current value while not
         *  overridden, the normal editable box once it is (issue #99). Override toggle sits
         *  to the *left* of the field per direct instruction. Tapping the display itself
         *  also arms the override directly (STG fix — no longer requires tapping OVERRIDE
         *  first). */}
        <div className="relative flex-1 min-h-0 flex items-stretch gap-1">
          <OverrideToggle active={stack.aisleOverride} onClick={toggleAisleOverride} ariaLabel={`${STACK_LABELS[index]} Aisle override`} />
          {stack.aisleOverride ? (
            <PalletBox label="Aisle" value={aisleFields.field.value} onFocus={aisleFields.focusField} active={aisleFields.field.isActive} tinted reserveToggleSpace invalid={aisleFields.invalid} />
          ) : (
            <InheritedDisplay label="Aisle" value={master.aisle} onActivate={toggleAisleOverride} reserveToggleSpace />
          )}
        </div>
        {/* Zone — override-only, no Master Control equivalent to inherit from (unlike
         *  Aisle/Storage/Size); off just means "no zone restriction" on this stack's
         *  destination search. Same OverrideToggle-plus-field pattern as the others for
         *  visual/interaction consistency. */}
        <div className="relative flex-1 min-h-0 flex items-stretch gap-1">
          <OverrideToggle active={stack.zoneOverride} onClick={toggleZoneOverride} ariaLabel={`${STACK_LABELS[index]} Zone override`} />
          {stack.zoneOverride ? (
            <PalletCodePicker
              label="Zone"
              ariaLabel={`${STACK_LABELS[index]} Zone`}
              value={stack.zone}
              onChange={(v) => updateStack(index, { zone: v })}
              field="zone"
              aisle={null}
              maxLength={1}
              onValidityChange={handleZoneValidityChange}
              tinted
            />
          ) : (
            <InheritedDisplay label="Zone" value="" onActivate={toggleZoneOverride} reserveToggleSpace />
          )}
        </div>
        <div className="relative flex-1 min-h-0 flex items-stretch gap-1">
          <OverrideToggle active={stack.storageCodeOverride} onClick={toggleStorageOverride} ariaLabel={`${STACK_LABELS[index]} Storage Code override`} />
          {stack.storageCodeOverride ? (
            <PalletCodePicker
              label="Storage"
              ariaLabel={`${STACK_LABELS[index]} Storage Code`}
              value={stack.storageCode}
              onChange={(v) => updateStack(index, { storageCode: v })}
              field="storageCode"
              aisle={stackAisle}
              maxLength={2}
              transform={(v) => v.toUpperCase()}
              onValidityChange={handleStorageValidityChange}
              tinted
            />
          ) : (
            <InheritedDisplay label="Storage" value={master.storageCode} onActivate={toggleStorageOverride} reserveToggleSpace />
          )}
        </div>
        <div className="relative flex-1 min-h-0 flex items-stretch gap-1">
          <OverrideToggle active={stack.sizeOverride} onClick={toggleSizeOverride} ariaLabel={`${STACK_LABELS[index]} Size override`} />
          {stack.sizeOverride ? (
            <PalletCodePicker
              label="Size"
              ariaLabel={`${STACK_LABELS[index]} Size`}
              value={stack.size}
              onChange={(v) => updateStack(index, { size: v })}
              field="size"
              aisle={stackAisle}
              storageCodeForSize={effective.storageCode}
              maxLength={2}
              transform={(v) => v.toUpperCase()}
              earlyCommit={(v) => ['S', 'M', 'L'].includes(v)}
              onValidityChange={handleSizeValidityChange}
              tinted
            />
          ) : (
            <InheritedDisplay label="Size" value={master.size} onActivate={toggleSizeOverride} reserveToggleSpace />
          )}
        </div>
        {/* Clear (this one stack's local entry only, never Master Control) + Qty, combined
         *  into one row (issue #99 — previously Qty had its own row, with Fill/Clear below
         *  it as a second row; Fill is gone now that inheritance is automatic/live, so Clear
         *  moved up alongside Qty instead of needing a row of its own). `flex-[2]` — this
         *  row absorbs the old Fill/Clear row's height in addition to Qty's own original
         *  row, so Qty ends up twice as tall as Aisle/Storage/Size (which stay `flex-1`,
         *  unchanged) rather than the space just disappearing now that Fill is gone. Clear
         *  and Qty's own text sized up to match (double the original 9px/15px) so they
         *  don't look lost in the taller box. */}
        <div className="flex-[2] min-h-0 flex gap-1">
          <button
            type="button"
            onClick={clearStack}
            className="shrink-0 w-[64px] flex items-center justify-center rounded-[5px] border-2 border-[#CC0000] text-[#CC0000] hover:bg-[#CC0000] hover:text-white transition-colors"
          >
            <span className="font-ui text-[18px] font-bold uppercase tracking-wider text-center leading-tight">
              Clear
            </span>
          </button>
          <PalletBox label="Qty" value={quantityField.value} onFocus={focusQuantityField} active={quantityField.isActive} tinted large />
        </div>
      </div>
    </div>
  );
}

/** Splits `items` into consecutive groups of `size` — the general form behind both
 *  LocationsPanel's bubble columns and LogPanel's 3-per-column log entries. */
function chunkBy<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** Tracks a ref'd element's own content-box size via ResizeObserver — LocationsPanel uses
 *  this to size its bubbles as a live fraction of the actual rendered container rather than
 *  a fixed px guess (the open STG checklist item asking for dynamic bubble sizing). */
function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentBoxSize?.[0];
      setSize(box ? { width: box.inlineSize, height: box.blockSize } : { width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

// ── Locations panel ──────────────────────────────────────────────────────────────

/**
 * The front stack's (StagingContext stacks[0]) computed destination-location list and
 * Stage action — issue #81 restyles these as large tappable bubbles (5 per column, wrapping
 * into further columns past that) instead of the small inline text list #77 used, and moves
 * them into their own panel next to the three stack boxes rather than squeezed inside one.
 * Only the front slot ever reaches this panel — StackBox (index 1/2) has no equivalent.
 * The very next suggested location (`locations[0]`) is still a button — tapping it opens
 * the reject/hold flow rather than staging anything, unchanged from #77.
 */
function LocationsPanel({ height }: { height?: number }) {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const { stacks, updateStack, resetStackAfterStage, addLogEntry, bumpDataVersion, dataVersion, master } = useStaging();
  const front = stacks[0];
  // Resolved Aisle/StorageCode/Size for the front slot (issue #99) — location lookup and
  // staging both need whichever value is actually in effect, inherited or overridden.
  const frontEffective = effectiveStack(front, master);

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
    if (!frontEffective.aisle || !frontEffective.storageCode || !frontEffective.size || !qty || qty <= 0) {
      // Fix STG#01: a valid→invalid transition (e.g. Quantity cleared) must clear stale
      // bubbles too, not just skip fetching new ones — this guard used to only handle the
      // empty→valid direction.
      if (front.locations.length > 0 || front.shortfall > 0) {
        updateStack(0, { locations: [], shortfall: 0 });
      }
      return;
    }
    let cancelled = false;
    fetchStagingLocations(token!, frontEffective.aisle, frontEffective.storageCode, frontEffective.size, qty, frontEffective.zone)
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
  }, [frontEffective.aisle, frontEffective.storageCode, frontEffective.size, frontEffective.zone, front.quantity, dataVersion]);

  const qty = parseInt(front.quantity, 10) || 0;
  const canStage = !!frontEffective.aisle && !!frontEffective.storageCode && !!frontEffective.size && qty > 0 && front.locations.length > 0;

  /** Submits the front slot's assigned locations via POST /api/staging/stage, logs the outcome, and resets/compacts the queue on success. */
  async function handleStage() {
    if (!canStage || loading) return;
    setLoading(true);
    try {
      const result = await apiFetch<StageResult>('/api/staging/stage', token!, {
        method: 'POST',
        body: JSON.stringify({
          aisle: parseInt(frontEffective.aisle, 10),
          storageCode: frontEffective.storageCode,
          size: frontEffective.size,
          ...(frontEffective.zone && { zone: parseInt(frontEffective.zone, 10) }),
          locationIds: front.locations,
        }),
      });

      const nextText = result.nextLocation ? fmtLocation(result.nextLocation) : 'no further locations';
      addLogEntry(`${result.staged.length} pallets staged in Aisle ${frontEffective.aisle} → next location ${nextText}`);

      if (result.shortfall > 0) {
        playAlert('warning');
        const requested = result.staged.length + result.shortfall;
        addLogEntry(
          `Warning: ${result.staged.length} of ${requested} locations available in Aisle ${frontEffective.aisle} — ${result.shortfall} pallets have no location`,
          true,
        );
        setMessage({ type: 'warning', text: `Staged ${result.staged.length} of ${requested} — ${result.shortfall} pallets unplaced` });
      } else {
        playAlert('info');
        setMessage({ type: 'success', text: `${result.staged.length} pallets staged in Aisle ${frontEffective.aisle}` });
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

  // Dynamic bubble sizing (the open STG checklist item): more pallets → smaller bubbles, so
  // more of the queue stays visible without scrolling; fewer pallets → larger, easier-to-tap
  // bubbles. Column count is bucketed off the total count (1 up to 4, 2 up to 8, else 3 —
  // per the checklist's own thresholds), and each bubble's width/height is the container's
  // own measured content-box size (`useElementSize`, padding already excluded), *minus* the
  // gap space the columns/rows actually consume (see below), divided by columns/rows, and
  // clamped to the checklist's stated min/max fractions of that same gap-adjusted space:
  // width in [1/3, 1/2], height in [1/5, 1/3]. A fixed 112×32px fallback covers the first
  // render, before ResizeObserver has reported a real measurement.
  //
  // BUG (found live, 3+ pallets): this panel's own outer height was never externally fixed —
  // it only got a height via the row's default `items-stretch`, which (since the row itself
  // has no explicit height) computes from each sibling's own *content* height. That made this
  // panel's height partly a function of its own bubbles' height, which this effect was in turn
  // computing *from* that same measured height — a closed loop with no independent anchor, so
  // each ResizeObserver tick fed a taller number back into itself and bubbles grew without
  // bound. Fixed by having `height` come in as a prop, measured off the *left* column instead
  // (Master Control + the graphic row — genuinely content-independent, see `STGScreen`), and
  // applied as an explicit inline height below. A flex item with a definite own height no
  // longer participates in the row's content-based height computation at all, which is what
  // actually breaks the circularity (not just "it's more explicit now").
  // BUG (found live, 3+ bubbles): the width/height math below divided the container's raw
  // measured size by column/row count, ignoring the `gap-2`/`gap-1.5` (8px/6px) actually
  // rendered *between* columns/bubbles — so N columns/rows of the computed size plus their
  // gaps summed to more than the container's real size, clipping the last column/row.
  // Fixed by subtracting gap space first and sizing (and clamping) against what's actually
  // left, so `columnCount` bubbles of `bubbleWidth` plus their gaps always sum to exactly
  // the measured width (same for height/rows) — never more.
  const [bubbleAreaRef, bubbleArea] = useElementSize<HTMLDivElement>();
  const columnCount = bubbles.length <= 4 ? 1 : bubbles.length <= 8 ? 2 : 3;
  const rowCount = Math.max(1, Math.ceil(bubbles.length / columnCount));
  const COLUMN_GAP = 8; // gap-2 between columns
  const ROW_GAP = 6; // gap-1.5 between bubbles within a column
  const availableWidth = Math.max(0, bubbleArea.width - COLUMN_GAP * (columnCount - 1));
  const availableHeight = Math.max(0, bubbleArea.height - ROW_GAP * (rowCount - 1));
  const bubbleWidth = availableWidth > 0
    ? Math.min(Math.max(availableWidth / columnCount, availableWidth / 3), availableWidth / 2)
    : 112;
  const bubbleHeight = availableHeight > 0
    ? Math.min(Math.max(availableHeight / rowCount, availableHeight / 5), availableHeight / 3)
    : 32;
  // Text scales with the bubble itself (roughly the same 13px-at-32px-tall ratio the old
  // fixed-size bubbles used), clamped so it never gets small enough to be unreadable or so
  // large it overflows a narrow (1/3-width) bubble.
  const bubbleFontSize = Math.min(18, Math.max(11, Math.round(bubbleHeight * 0.4)));
  const bubbleStyle = { width: bubbleWidth, height: bubbleHeight, fontSize: bubbleFontSize };
  const columns = chunkBy(bubbles, rowCount);

  return (
    <div
      className="w-[378px] shrink-0 min-h-0 flex flex-col gap-1.5 p-2 bg-[#0A0A0A] border border-[#2A2A2A] rounded-[12px]"
      style={height ? { height } : undefined}
    >
      <span className="font-ui text-[12px] font-semibold text-[#9A9A9A] uppercase tracking-wider text-center shrink-0">
        Locations
      </span>

      {/* overflow-auto remains as a safety net — if a column ever needs more rows than fit
          even at the minimum 1/5-height bubble, it scrolls rather than overflowing the panel. */}
      <div ref={bubbleAreaRef} data-testid="location-bubbles" className="flex-1 min-h-0 overflow-auto flex items-start justify-center gap-2 p-1">
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
                    style={bubbleStyle}
                    className="px-2 flex items-center justify-center rounded-full border-2 border-[#CC0000] bg-[#2A0D0D] font-ui font-bold text-[#FF6666] text-center whitespace-nowrap"
                  >
                    No Location
                  </span>
                );
              }
              // Every real-location bubble is a tap target — tapping any of them opens the
              // reject/hold flow, not staging (issue #97, reversing #77's first/last-only
              // restriction: rejecting a bubble always triggers a full server-side re-fetch
              // of the suggestion list via handleHeld()'s bumpDataVersion(), regardless of
              // which position was rejected, so there's no queue-compaction logic tied to a
              // bubble's position that middle-bubble rejection would break). isLast (the
              // final location needed to fully satisfy the quantity) still gets the distinct
              // green styling from STG#03; every other position — including isNext, and now
              // every middle position — shares the same blue tap-target style.
              return (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setRejectTarget(b.loc)}
                  style={bubbleStyle}
                  className={`px-2 flex items-center justify-center rounded-full border-2 font-data font-bold text-center whitespace-nowrap transition-colors ${
                    b.isLast ? 'border-[#5FD18B] bg-[rgba(95,209,139,0.12)] text-[#5FD18B] hover:border-[#7FE0A8]' : 'border-[#3A6BB0] bg-[#132C4D] text-white hover:border-[#5A8BD0]'
                  }`}
                >
                  {fmtLocation(b.loc)}
                </button>
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

// Triple.png's actual pixel content (measured directly from the asset, not estimated):
// a long fork bar + 2 wheels spans x:[0,990] y:[341,422], a thin mast/"backrest" sits at
// x≈990, and the operator cab (full image height) spans x:[990,1218] y:[0,429].
//
// v1.6.6 tried a single whole-image layout twice (see this file's design log) before
// landing back here: getting the stack boxes to visually "sit on the forks" while leaving
// the fork bar itself visible requires precise, independent control over the cab's and the
// forks' own size/position — fighting that out of one `object-fill`-stretched image (whose
// internal proportions distort non-uniformly once stretched) is real complexity for no
// benefit over just cropping the two pieces independently, which is what SpriteCrop does.
const TRIPLE_IMG_W = 1218;
const TRIPLE_IMG_H = 429;
const CAB_CROP = { x0: 990, x1: 1218, y0: 0, y1: 429 };
const FORK_CROP = { x0: 0, x1: 990, y0: 341, y1: 422 };
const CAB_HEIGHT = 240;
const CAB_WIDTH = Math.round((CAB_CROP.x1 - CAB_CROP.x0) * (CAB_HEIGHT / (CAB_CROP.y1 - CAB_CROP.y0)));
const FORK_HEIGHT = 28;

/**
 * Crops an arbitrary rectangle of `src` (in source-image pixels) and stretches it to fill
 * this element's own rendered box — the standard percentage-based CSS-sprite technique.
 * `background-size`/`-position` percentages resolve against the *element's own* box, not
 * the source image, so this works whether the caller sizes it with a fixed pixel style or
 * lets it stretch fluidly (e.g. `w-full` in a flex row) — no JS measurement needed either way.
 */
function SpriteCrop({ src, imgW, imgH, crop, className, style }: {
  src: string;
  imgW: number;
  imgH: number;
  crop: { x0: number; x1: number; y0: number; y1: number };
  className?: string;
  style?: React.CSSProperties;
}) {
  const cropW = crop.x1 - crop.x0;
  const cropH = crop.y1 - crop.y0;
  const sizeX = (imgW / cropW) * 100;
  const sizeY = (imgH / cropH) * 100;
  const posX = cropW === imgW ? 0 : (crop.x0 / (imgW - cropW)) * 100;
  const posY = cropH === imgH ? 0 : (crop.y0 / (imgH - cropH)) * 100;
  return (
    <div
      className={className}
      style={{
        ...style,
        backgroundImage: `url(${src})`,
        backgroundSize: `${sizeX}% ${sizeY}%`,
        backgroundPosition: `${posX}% ${posY}%`,
        backgroundRepeat: 'no-repeat',
      }}
    />
  );
}

/**
 * The operator compartment + backrest/mast, undistorted (v1.6.6) — anchored to the row's
 * bottom edge (matching a vehicle sitting on the ground, and lining up with ForksStrip's
 * own bottom edge below the stack boxes). Carries the Unstage Aisle button (moved off
 * Master Control's row to make room there — Fill All stays in Master Control since it acts
 * on the stacks, not the aisle as a whole).
 */
/** `onClearForks` clears all 3 stacks' Aisle/Storage/Size/Qty (never Master Control) —
 *  available to every role, unlike Unstage Aisle (which is back in Master Control's row,
 *  see MasterControl) since clearing local, not-yet-submitted entry fields isn't
 *  destructive the way unstaging real locations is. */
function Cab({ onClearForks }: { onClearForks: () => void }) {
  return (
    <div className="relative shrink-0 h-full select-none" style={{ width: CAB_WIDTH }}>
      <SpriteCrop
        src={Triple}
        imgW={TRIPLE_IMG_W}
        imgH={TRIPLE_IMG_H}
        crop={CAB_CROP}
        className="absolute bottom-0 left-0 opacity-90 pointer-events-none"
        style={{ width: CAB_WIDTH, height: CAB_HEIGHT, transform: 'scaleX(-1)' }}
      />
      {/* Shifted ~40px (the button's own height) below vertical center, per direct
          instruction — was flush at true center, now sits noticeably lower on the cab. */}
      <div className="absolute left-2 -translate-y-1/2" style={{ top: 'calc(50% + 40px)' }}>
        <button
          type="button"
          onClick={onClearForks}
          className="h-[40px] px-4 rounded-[10px] font-ui text-[13px] font-bold bg-[#CC0000] hover:bg-[#DD0000] text-white transition-colors shadow-[0_0_20px_4px_rgba(204,0,0,0.35)]"
        >
          Clear Forks
        </button>
      </div>
    </div>
  );
}

/** The fork bar, stretched to span whatever width its flex/fluid container gives it —
 *  rendered directly below the stack-box row (in normal flex flow, not layered underneath
 *  it) so the bar stays visible as a "shelf" the pallets read as sitting on, exactly
 *  matching the space the stack boxes occupy above it. */
function ForksStrip({ className }: { className?: string }) {
  return (
    <SpriteCrop
      src={Triple}
      imgW={TRIPLE_IMG_W}
      imgH={TRIPLE_IMG_H}
      crop={FORK_CROP}
      className={`opacity-90 pointer-events-none shrink-0 ${className ?? ''}`}
      style={{ height: FORK_HEIGHT, transform: 'scaleX(-1)' }}
    />
  );
}

// ── Live info panel ───────────────────────────────────────────────────────────

/** Short inline message shown in place of a row list/summary that came back empty — the
 *  zone map (if present alongside it) keeps rendering normally either way. */
function NoMatches({ text }: { text: string }) {
  return <p className="font-ui text-[14px] text-[#555] text-center py-4">{text}</p>;
}

/** ELZ-format read-only display: physical layout grid (left, unfiltered) + a "Displaying
 *  Aisle {aisle}" header over a split right-hand column — zone summary (narrowed by
 *  whichever of storageCode/size the caller supplied) on the left half, the session's
 *  staging log (STG-only content, not part of ELZ itself) on the right half, filling what
 *  was previously wasted empty space there (v1.6.6 — expanded to match ELZ's own grid
 *  sizing/spacing exactly, `dense` dropped for the same reason). Grid + summary are
 *  read-only, per Feature 2's spec (this format is always a read-only display, matching
 *  ELZ itself) — the log half keeps its own normal tap-to-expand interaction. */
function ElzFormat({ result, label, aisle }: { result: ZoneMapResult; label: string; aisle: string }) {
  return (
    <div className="flex-1 flex gap-4 overflow-hidden px-4 py-3">
      <div className="flex-[6] overflow-hidden">
        <AisleGrid levels={result.levels} zoneBinRanges={result.zoneBinRanges} />
      </div>
      <div className="flex-[4] min-h-0 flex flex-col overflow-hidden border-l border-[#2A2A2A] pl-4">
        <span className="font-ui text-[13px] font-semibold text-white uppercase tracking-wider shrink-0 mb-2">
          Displaying Aisle {aisle}
        </span>
        <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {result.zoneSummary.length === 0 ? (
              <NoMatches text={`No open ${label} locations in this aisle`} />
            ) : (
              result.zoneSummary.map((z) => (
                <div key={z.zone} className="mb-3">
                  <span className="font-ui text-[14px] font-semibold text-white">Zone {z.zone}</span>
                  {/* One column per Storage Code, matching-color pill per Storage Code
                      (same palette AisleGrid's own cells use), each column's own badges
                      sorted largest Size first (top) down to smallest (bottom) —
                      2026-07-28, matches ELZ's own Zone Summary layout. */}
                  <div className="flex gap-2 mt-1.5">
                    {groupBreakdownByStorageCode(z.breakdown).map((col) => (
                      <div key={col.storageCode} className="flex flex-col gap-1">
                        {col.entries.map((b) => (
                          <ZoneCodeBadge key={`${b.storageCode}-${b.size}`} storageCode={b.storageCode} size={b.size} empty={b.empty} staged={b.staged} badgeSize="compact" />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-l border-[#2A2A2A] pl-3">
            <LogPanel variant="inline" />
          </div>
        </div>
      </div>
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
  // ela-mode sort state — mirrors ELA's own page exactly (same default-sort logic below,
  // same flip-on-repeat-tap handler), since this is meant to be the literal same table.
  const [sort, setSort] = useState<AisleSizeSort>({ column: 'aisle', direction: 'asc' });

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
      // Default sort matches what was actually searched for (same rule as ELA's own page):
      // the queried size's own count when one was given, otherwise Aisle number.
      setSort(size ? { column: size, direction: 'desc' } : { column: 'aisle', direction: 'asc' });
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
    // Cannot stage XS aisles (STG's open Zone-Map checklist item) — checked against the
    // grid's own cells (every location in the aisle, not the narrowed zoneSummary), since
    // an aisle mixing sizes isn't expected to exist, but this only trips when *every*
    // present location is XS rather than assuming from a single cell.
    const allCells = zoneResult.levels.flatMap((l) => l.cells);
    const isXsAisle = allCells.length > 0 && allCells.every((c) => c.size === 'XS');
    if (isXsAisle) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <p className="font-ui text-[18px] font-semibold text-[#CC4444]">Cannot stage XS aisles</p>
        </div>
      );
    }
    const label = storageCode && size ? `${storageCode}-${size}` : storageCode || size || '';
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <ElzFormat result={zoneResult} label={label} aisle={aisle} />
      </div>
    );
  }

  if (!aisleRows) return null;
  // Same "always show a header" rule as the ELZ-mode branch above (the open STG checklist
  // item — "the bottom container should always maintain a header... to avoid confusion from
  // multiple selections"), which this ELA-mode branch never carried before.
  const elaLabel = storageCode && size ? `${storageCode}-${size}` : storageCode || size;
  return (
    <div className="flex-1 min-h-0 flex flex-col px-4 py-3 gap-2">
      <span className="font-ui text-[13px] font-semibold text-white uppercase tracking-wider shrink-0">
        Displaying {elaLabel}
      </span>
      {/* The literal same table ELA's own page uses (shared `AisleSizeTable` — sortable
          Aisle/Size columns, tap a header to sort, tap a row to select), not a STG-specific
          re-derivation — tapping a row commits straight to Master Control's Aisle instead
          of ELA's own toggle-then-separate-button flow, since there's no second screen to
          navigate to here. */}
      {aisleRows.length === 0 ? (
        <NoMatches text={`No empty or staged locations found for ${storageCode}${size ? ` — ${size}` : ''}`} />
      ) : (
        <div className="flex-1 min-h-0 flex flex-col border border-[#2A2A2A] rounded-[12px] overflow-hidden">
          <AisleSizeTable
            rows={aisleRows}
            sort={sort}
            onSortChange={(column) => setSort((prev) => (prev.column === column
              ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
              : { column, direction: column === 'aisle' ? 'asc' : 'desc' }))}
            onSelectAisle={(a) => setMaster({ aisle: String(a) })}
          />
        </div>
      )}
    </div>
  );
}

// ── Log panel ────────────────────────────────────────────────────────────────

/** The full scrollable log history, shared by both LogPanel variants below — a tap on
 *  either preview opens this same modal. */
function LogExpandedModal({ onClose }: { onClose: () => void }) {
  const { log } = useStaging();
  return (
    <div className="absolute inset-0 bg-black/90 z-40 flex flex-col" onClick={onClose}>
      <div
        className="mx-auto mt-6 w-[900px] max-h-[80%] bg-[#0D0D0D] border border-[#2A2A2A] rounded-[16px] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#2A2A2A]">
          <span className="font-ui text-[16px] font-semibold text-white">Staging Log</span>
          <button type="button" onClick={onClose} className="font-ui text-[14px] text-[#9A9A9A] hover:text-white">
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
  );
}

/**
 * Preview of the session's staging log; tap opens the full scrollable modal
 * (`LogExpandedModal`) for anything beyond what's visible. Two variants (v1.6.6):
 * - `bottom` (default) — fixed-height, 3-column-by-3-line strip pinned to the bottom of the
 *   content slot; used whenever Master Control's Aisle is empty (nothing for `inline` to
 *   sit beside).
 * - `inline` — a single-column list filling whatever height its own flex slot gives it,
 *   used inside `ElzFormat`'s zone-summary column once an Aisle is entered, so the log
 *   moves into space that would otherwise sit empty next to the zone summary rather than
 *   also rendering at the bottom.
 */
function LogPanel({ variant = 'bottom' }: { variant?: 'bottom' | 'inline' }) {
  const { log, logExpanded, setLogExpanded } = useStaging();

  if (variant === 'inline') {
    const recent = log.slice(0, 9);
    return (
      <>
        <button
          type="button"
          onClick={() => setLogExpanded(!logExpanded)}
          className="flex-1 min-h-0 flex flex-col gap-1 overflow-y-auto text-left hover:bg-[#0D0D0D] transition-colors rounded-[8px]"
        >
          {recent.length === 0 ? (
            <span className="font-ui text-[13px] text-[#555]">No staging activity this session</span>
          ) : (
            recent.map((entry) => (
              <span
                key={entry.id}
                className={`font-ui text-[13px] truncate ${entry.warning ? 'text-[#AA8800]' : 'text-[#9A9A9A]'}`}
              >
                {entry.text}
              </span>
            ))
          )}
        </button>
        {logExpanded && <LogExpandedModal onClose={() => setLogExpanded(false)} />}
      </>
    );
  }

  const columns = chunkBy(log.slice(0, 9), 3);
  return (
    <div className="shrink-0 border-t border-[#1C1C1C]">
      <button
        type="button"
        onClick={() => setLogExpanded(!logExpanded)}
        className="w-full h-[76px] flex items-center gap-5 px-5 py-2 hover:bg-[#0D0D0D] transition-colors text-left overflow-hidden"
      >
        {log.length === 0 ? (
          <span className="font-ui text-[13px] text-[#555]">No staging activity this session — tap to expand</span>
        ) : (
          columns.map((col, ci) => (
            <div key={ci} className="flex-1 min-w-0 flex flex-col gap-1 leading-tight">
              {col.map((entry) => (
                <span
                  key={entry.id}
                  className={`font-ui text-[13px] truncate ${entry.warning ? 'text-[#AA8800]' : 'text-[#9A9A9A]'}`}
                >
                  {entry.text}
                </span>
              ))}
            </div>
          ))
        )}
      </button>
      {logExpanded && <LogExpandedModal onClose={() => setLogExpanded(false)} />}
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

  /** Clamps a raw typed value to a row's max, defaulting to 0 for empty/invalid input. */
  function clampQuantity(raw: string, max: number): number {
    const n = parseInt(raw, 10);
    return !raw || isNaN(n) ? 0 : Math.min(n, max);
  }

  /** Sets a row's quantity, clamping to that row's max — used by the numpad submit, Max, and Clear Restage. */
  function setQuantity(key: string, raw: string, max: number) {
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], quantity: String(clampQuantity(raw, max)) } }));
  }

  /** Submits the active rows' quantities via POST /api/staging/restage and reports a per-type summary. */
  async function apply() {
    if (!types || applying || loading) return;
    setApplying(true);
    setTimeout(() => setApplying(false), 1000);
    const aisleNum = parseInt(aisle, 10);
    // Fix STG#02: read each row's *live* qtyField value (not just the already-committed
    // `rows` state) — a typed-but-unconfirmed digit sequence (no Enter/OK pressed yet)
    // only ever lands in the field itself, so relying on `rows` alone silently dropped it.
    const activeTypes = types
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => rows[typeKey(t)]?.active);
    try {
      const { results } = await apiFetch<RestageResponse>('/api/staging/restage', token!, {
        method: 'POST',
        body: JSON.stringify({
          aisle: aisleNum,
          types: activeTypes.map(({ t, i }) => ({
            storageCode: t.storageCode,
            size: t.size,
            quantity: clampQuantity(qtyFields[i]?.value ?? rows[typeKey(t)]?.quantity ?? '0', t.max),
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
                  {/* STG#07 + the MASTER-CHECKLIST follow-up refining it: the type bubble
                      itself is the active/inactive toggle — no separate checkbox — starting
                      selected (red background, white text) and "clicking off" to a
                      transparent background, not a separate dark-gray inactive fill. Kept
                      outside the row's opacity/pointer-events wrapper below so it stays
                      clickable even while the rest of the row dims/disables. */}
                  <button
                    type="button"
                    onClick={() => toggleActive(key)}
                    aria-pressed={row.active}
                    aria-label={`${row.active ? 'Deactivate' : 'Activate'} ${key}`}
                    className={`shrink-0 w-[100px] h-[40px] rounded-full border-2 flex items-center justify-center font-data text-[16px] font-semibold transition-colors ${
                      row.active ? 'border-[#CC0000] bg-[#CC0000] text-white' : 'border-[#3A3A3A] bg-transparent text-[#666] hover:border-[#555]'
                    }`}
                  >
                    {key}
                  </button>
                  <div className={`flex-1 flex items-center gap-4 transition-opacity ${row.active ? '' : 'opacity-60 pointer-events-none'}`}>
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

/**
 * Top control bar, labeled "Master Control" (v1.6.6). Three elements spaced
 * `justify-between` below the label — (IM+) Unstage Aisle, the shared Aisle/StorageCode/
 * Size fields, and Refresh. Refresh sits here (not in its own row above the Locations
 * panel) specifically so it lands immediately left of the Locations column — Master
 * Control's row ends exactly where that column begins, so the last `justify-between`
 * element reads as "against the Locations box" without needing its own dedicated space
 * that would otherwise eat into Locations' height. `justify-between` (not a
 * `grid-cols-3`) per direct instruction — the field group's position now depends on the
 * other two elements' actual widths rather than always centering against the row's own
 * full width regardless of them. Fill All was removed in issue #99 — every stack's
 * Aisle/StorageCode/Size now inherits these fields' current values live unless a worker
 * explicitly overrides one (see StackBox), so there's no separate "push to the stacks"
 * step left to trigger; the left-hand button group is simply empty for non-IM+ roles now.
 */
function MasterControl({ isIM, onUnstage, onRefresh }: {
  isIM: boolean;
  onUnstage: () => void;
  onRefresh: () => void;
}) {
  const { master, setMaster } = useStaging();
  const { hidePanel } = useNumpad();
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  // Fixed 3-character field, existence-checked (issue #161 — previously this field had no
  // validation at all, an inconsistency with the per-stack override's own `handleAisleConfirm`
  // below, which already checked). Auto-commits like every other screen's Aisle field
  // (ELZ/SDP/LocationEntryFields), which Feature 2's live info panel relies on for its "no
  // explicit submit step" behavior, same reasoning as the Storage Code field below. Commits
  // to shared `master` state regardless of validity (via `onConfirm`) — `invalid` only
  // washes the box and drives the message bar; `InfoPanel` already shows its own "no data"
  // state for a bad aisle independently of this field's own wash.
  const aisleFields = useAisleField({
    fetch: useCallback((aisle) => apiFetch<{ exists: boolean }>(`/api/locations/aisle-exists?aisle=${aisle}`, token!), [token]),
    onConfirm: useCallback((v) => { setMaster({ aisle: v }); hidePanel(); }, [setMaster, hidePanel]),
    onNotFound: useCallback(() => {
      playAlert('error');
      setMessage({ type: 'error', text: 'Master Control - Aisle - Invalid Entry' });
    }, [setMessage]),
  });

  useEffect(() => { aisleFields.field.set(master.aisle); }, [master.aisle]); // eslint-disable-line react-hooks/exhaustive-deps

  // StorageCodeField/SizeField now own their own aisle-narrowing internally (Feature 10)
  // — passing `aisle` below is all that's needed; `strictToAisle`/no-narrowing-toggle
  // equivalent isn't needed for Size (it has no such toggle, always validates narrowed)
  // and is explicitly turned on for Storage (matching STG's own established intent — a
  // typed value must actually resolve within this aisle to count as valid here, unlike
  // ELZ's read-only-report use of the same field).
  const aisleNum = parseInt(master.aisle, 10);
  const masterAisle = isNaN(aisleNum) ? null : aisleNum;

  /** Reacts to the field's own reactive validity (Feature 10) — the wash itself is now
   *  automatic; this only drives the message-bar/alert side effect, same text as before. */
  const handleStorageValidityChange = useCallback((inv: boolean) => {
    if (inv) {
      playAlert('error');
      setMessage({ type: 'error', text: 'Master Control - Storage Code - Invalid Entry' });
    }
  }, [setMessage]);
  const handleSizeValidityChange = useCallback((inv: boolean) => {
    if (inv) {
      playAlert('error');
      setMessage({ type: 'error', text: 'Master Control - Size - Invalid Entry' });
    }
  }, [setMessage]);

  return (
    <div className="pt-3 pb-4 border-b border-[#1C1C1C] shrink-0 px-4">
      <div className="text-center">
        <span className="font-ui text-[24px] font-bold text-[#9A9A9A] uppercase tracking-wider">
          Master Control
        </span>
      </div>
      {/* Three elements spaced space-between (v1.6.6) — Unstage, the field group, and
          Refresh — rather than a grid's guaranteed true-centering; the field group's
          position now depends on the other two elements' widths, per direct instruction. */}
      <div className="flex items-end justify-between mt-2">
        <div className="flex items-end gap-2">
          {isIM && (
            // Red outline (v1.6.6 — swapped with Clear Forks' solid fill, see Cab) — its
            // destructive nature (clears staged locations) should still stand out, sized to
            // match Fill All rather than larger, per direct instruction.
            <button
              type="button"
              onClick={onUnstage}
              className="h-[44px] px-5 rounded-[10px] font-ui text-[14px] font-bold border border-[#CC0000] text-[#CC0000] hover:bg-[#CC0000] hover:text-white transition-colors"
            >
              Unstage Aisle
            </button>
          )}
        </div>

        <div className="flex items-end gap-4">
          <StorageCodeField
            value={master.storageCode}
            onChange={(v) => setMaster({ storageCode: v })}
            aisle={masterAisle}
            strictToAisle
            size="compact"
            strict
            onValidityChange={handleStorageValidityChange}
          />
          <FieldDisplay label="Aisle" value={aisleFields.field.value} onFocus={aisleFields.focusField} active={aisleFields.field.isActive} invalid={aisleFields.invalid} width="w-[120px]" />
          <SizeField
            value={master.size}
            onChange={(v) => setMaster({ size: v })}
            aisle={masterAisle}
            storageCode={master.storageCode}
            size="compact"
            ariaLabel="Master Size"
            strict
            onValidityChange={handleSizeValidityChange}
          />
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

  // Left column's own measured height (Master Control + the graphic row) — genuinely
  // content-independent (the graphic row is hard-pinned to 270px, Master Control's height
  // never depends on the fork queue), so it's a safe, non-circular anchor for LocationsPanel's
  // own height. See LocationsPanel's own comment for why measuring *its own* content instead
  // caused a runaway bubble-growth loop.
  const [leftColRef, leftColSize] = useElementSize<HTMLDivElement>();

  // Pre-population from ELA "Stage Aisle" / ELZ "Stage Aisle" — see STG.md's
  // Pre-population section. Only applies to Master Control, never the fork/stack slots
  // directly — every stack inherits Master Control's values live unless individually
  // overridden (issue #99), so there's no separate "push to the stacks" step needed
  // anymore. Only applied once per navigation (route state is consumed, not re-applied on
  // every render) — Master Control's own empty aisle is used as the "not yet applied" signal.
  useEffect(() => {
    const state = routerLocation.state as NavState | null;
    if (!state?.aisle || master.aisle) return;
    // ELZ only ever supplies storageCode (no Size concept on that screen); ELA supplies
    // both. Apply whichever fields are present rather than requiring both together.
    setMaster({
      aisle: String(state.aisle),
      ...(state.storageCode ? { storageCode: state.storageCode, ...(state.size ? { size: state.size } : {}) } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state]);

  /** Clears all 3 stacks' Aisle/Storage/Size/Qty (and any active overrides or computed
   *  locations/shortfall) — Master Control is untouched. Available to every role, unlike
   *  Unstage Aisle (which acts on real, already-staged locations — this only clears local,
   *  unsubmitted entry). */
  function clearForks() {
    ([0, 1, 2] as const).forEach((i) => updateStack(i, {
      aisle: '', storageCode: '', size: '', quantity: '', locations: [], shortfall: 0,
      aisleOverride: false, storageCodeOverride: false, sizeOverride: false,
    }));
  }

  /** Manual Refresh (issue #76): reloads the live info panel and the front slot's suggestion without changing any field. */
  function handleRefresh() {
    bumpDataVersion();
    setMessage({ type: 'info', text: 'Refreshed' });
  }

  return (
    <div className="absolute inset-0 flex flex-col select-none">
      {/* v1.6.6: Locations pulled out of the graphic row into its own right-hand column,
          spanning the combined height of Master Control + the graphic row. Explicitly
          measured (`leftColRef`/`leftColSize`) and passed down as `height` rather than left
          to the row's default `items-stretch` — stretch alone let LocationsPanel's own
          (bubble-count-dependent) content height feed back into the row's own height
          computation, which caused a real runaway bubble-growth bug at 3+ pallets; see
          LocationsPanel's own comment. Refresh renders inside Master Control's own row
          (right-justified) rather than above Locations, so it lands immediately left of the
          Locations column without eating into Locations' height. */}
      <div className="flex gap-3 mx-4 mt-3">
        <div ref={leftColRef} className="flex-1 min-w-0 flex flex-col">
          <MasterControl
            isIM={isIM}
            onUnstage={() => setUnstageOpen(true)}
            onRefresh={handleRefresh}
          />

          {/* Explicit height (not just items-stretch) so each stack box's internal
              flex-1/min-h-0 chain has a real bound to shrink against — matching the old
              ForkGraphicArea's `top-0 bottom-[20%]` absolute-positioning trick, which gave
              its StackPanel children the same kind of implicit bounded height. Without
              this, content overflows past 270px and gets hidden under the bottom-right
              Numpad panel. */}
          {/* No gap between Cab and the stacks/forks column (v1.6.6) — ForksStrip's left
              edge butts directly against Cab's right edge so the two crops read as one
              continuous graphic instead of two visibly separate pieces. */}
          <div className="flex items-stretch mt-3 h-[270px]">
            <Cab onClearForks={clearForks} />
            {/* Stacks sit above ForksStrip, not layered over a stretched whole-image — see
                this file's Fork graphic section for why. The strip's w-full spans exactly
                this column's width, i.e. exactly the space the three stacks occupy above
                it, so it reads as the shelf they're resting on. Issue #81's stack ordering
                is unchanged: index 2 (back, closest to the mast) renders leftmost, index 0
                (front, "the end of the forks") renders rightmost. */}
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex-1 min-h-0 flex gap-2">
                <StackBox index={2} />
                <StackBox index={1} />
                <StackBox index={0} />
              </div>
              <ForksStrip className="w-full" />
            </div>
          </div>
        </div>

        <LocationsPanel height={leftColSize.height || undefined} />
      </div>

      <div className="flex-1 flex flex-col overflow-y-auto border-t border-[#1C1C1C] mt-3">
        <InfoPanel aisle={master.aisle} storageCode={master.storageCode} size={master.size} />
      </div>

      {/* Fixed-height, pinned to the bottom of the content slot (i.e. right above the
          Footer) rather than sharing InfoPanel's scroll area — v1.6.6. Only rendered here
          while Master Control's Aisle is empty; once an Aisle is entered, ElzFormat renders
          an `inline` LogPanel of its own inside the zone-summary column instead, so the log
          doesn't render twice. */}
      {!master.aisle && <LogPanel />}

      {unstageOpen && (
        <UnstageModal aisle={master.aisle || effectiveStack(stacks[0], master).aisle} onClose={() => setUnstageOpen(false)} />
      )}
    </div>
  );
}

/** STG — Stage Aisle. StagingProvider (fork-state store) is mounted once, app-wide,
 *  in App.tsx — not here — so fork state survives navigating away and back. */
export function STGPage() {
  return <STGScreen />;
}
