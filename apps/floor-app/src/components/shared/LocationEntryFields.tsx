import { useEffect, useRef, useState } from 'react';
import { useNumpad } from '../../context/NumpadContext';
import { INVALID_WASH } from '../../lib/invalidWash';
import { useNumpadField } from '../../lib/useNumpadField';

interface LocationEntryFieldsProps {
  /** Called once a location is resolved, either by a barcode scan (in any field) or by
   *  completing every non-locked manual field in sequence. `wasScanned` is true only for
   *  a scanned-override path (8-digit always; 6-digit too when `levelOptional` — see its
   *  doc comment) — a scan atomically delivers a value longer than the receiving field's
   *  own maxLength, which manual typing structurally cannot produce (each field
   *  auto-submits at its own maxLength before a longer value could accumulate), so this
   *  distinction is exact, not a heuristic. `locationId` is normally a full 8-digit
   *  Aisle+Bin+Level id; when `levelOptional` is set, it may instead be a 6-digit
   *  Aisle+Bin id — either from a 6-digit scan (`wasScanned: true`) or from the worker
   *  completing Aisle+Bin manually in sequence (`wasScanned: false`). */
  onResolved: (locationId: string, wasScanned: boolean) => void;
  /** Auto-focuses the first non-locked field on mount — off by default so callers with
   *  their own entry-point logic (e.g. pre-populated from a scan) can opt out. */
  autoFocus?: boolean;
  // NOTE ON 6-DIGIT SCANS: a physical location barcode only ever encodes Aisle+Bin (see
  // SDP confirmPut's "physical barcodes only encode aisle+bin" comment) — a full 8-digit
  // scan is the exception, not the rule, for locations specifically. When `levelOptional`
  // is set, a 6-digit value landing in *any* box (Aisle, Bin, or Level) is therefore also
  // treated as a complete override — same "regardless of what's already typed elsewhere"
  // semantics as the existing 8-digit case, since manual per-box typing can never produce
  // 6 characters in one box (each box's own maxLength — 3/3/2 — caps it, unless
  // isScanningRef is suppressing that, which only happens during deliverScan).
  /**
   * Optional external prefill/clear (issue #69) — an 8-digit Aisle+Bin+Level id, or `''`
   * to clear all three boxes. One-way (parent → this component): typing still flows
   * through the internal auto-advance chain and `onResolved` as usual; this only lets a
   * caller inject or clear a value from outside without the worker typing it (PAR's demo
   * buttons, and clearing the boxes after a successful submit — Location is optional
   * there, unlike LII/WLH, which never pass this prop and are unaffected).
   */
  value?: string;
  /** Shows all three boxes with a red border (issue #69) — e.g. PAR's "location is not
   *  empty" server rejection. LII/WLH don't pass this and are unaffected. */
  highlight?: boolean;
  /** Fires whenever the aggregate active state (true if any of the three boxes currently
   *  has focus) changes — lets a caller mirror this into its own field-active tracking
   *  (e.g. PIP's demo-footer gating, which shows Location's demo buttons only while one
   *  of its boxes is focused, the same way it already gates on every other field's
   *  useNumpadField().isActive). Optional — PAR/WLH/LII don't need it and don't pass it. */
  onActiveChange?: (active: boolean) => void;
  /**
   * Locks the Aisle box to this fixed value: shown disabled (not tappable, not part of
   * the typed sequence) instead of the normal editable field. The box still renders — the
   * three-box layout stays visually consistent across callers — it just isn't something
   * the worker types. Used by PIP's hand-entered Carton Floor, where only Bin actually
   * needs verifying: pass the pallet's real Aisle so the worker sees it without retyping
   * it. A full 8-digit barcode scanned into any field still overrides everything as
   * usual, regardless of locks.
   */
  lockedAisle?: string;
  /** Locks the Level box to this fixed value — see lockedAisle. */
  lockedLevel?: string;
  /** 'large' bumps box height/width and text size a bit — used by SDP's Confirm Location
   *  panel, which has room to spare now that Unassign/Blocked Put sit beside it instead
   *  of below it. Other callers all use the default size. */
  size?: 'default' | 'large';
  /** When true, a manually-typed Aisle+Bin (no Level) is sufficient to resolve — the
   *  chain does not auto-advance into the Level box, and `onResolved` fires with a
   *  6-digit id instead of waiting for a 2-digit Level. The Level box still renders (for
   *  visual consistency with other screens) and a full 8-digit barcode scan into any
   *  field still resolves atomically as usual. Used by MNP, whose Level is confirmed
   *  separately via its own Level Confirmation modal rather than typed here. Default
   *  false — LII/WLH/PAR require the full three-box resolution and are unaffected. */
  levelOptional?: boolean;
  /** Checks whether a completed Aisle box's value is a real aisle (issue #162) — when
   *  provided, the component owns this async check internally (calling it the moment
   *  Aisle completes, before advancing to Bin) instead of a caller computing its own
   *  `aisleInvalid` externally. Mirrors `useAisleField`'s `fetch` contract (issue #161) —
   *  every current caller wires `GET /api/locations/aisle-exists`. Omit for a caller with
   *  no progressive per-box check need (LII/MNP/PIP/SDP/WLH — see this component's own
   *  `Documentation/Components/LocationEntryFields.md` for why the rollout stayed PAR-only
   *  this round); the box then just renders the external `aisleInvalid` prop below,
   *  exactly as before. Resolving a full 8-digit (or 6-digit, when `levelOptional`)
   *  barcode-scan override clears any stale internal invalid state from a prior manual
   *  attempt, same as a fresh `value` prefill. */
  checkAisle?: (aisle: string) => Promise<{ exists: boolean }>;
  /** Checks whether a completed Bin box's value is a real Aisle+Bin combination — same
   *  internal-ownership shape as `checkAisle`, one box further in; skipped automatically
   *  while the internal Aisle check is already known invalid (an Aisle+Bin combination
   *  can't meaningfully exist within an Aisle that itself doesn't). Resolve only matters
   *  for its success/failure — the resolved value itself is unused. */
  checkAisleBin?: (aisle: string, bin: string) => Promise<unknown>;
  /** Fires whenever the internal Aisle check's result changes (only meaningful when
   *  `checkAisle` is provided) — for a caller's own side effect (message-bar text),
   *  mirroring `useCodePickerField`'s `onValidityChange` convention. */
  onAisleValidityChange?: (invalid: boolean) => void;
  /** Same as `onAisleValidityChange`, one box further in — only meaningful when
   *  `checkAisleBin` is provided. */
  onBinValidityChange?: (invalid: boolean) => void;
  /** Per-box invalid-wash flags (v1.6.11) — independent of `groupInvalid`. External
   *  override for a caller with no internal `checkAisle`/`checkAisleBin` (e.g. a caller
   *  attributing a compound-submit failure to one specific box) — ignored for whichever
   *  box has its own internal check active, since the internal result drives that box's
   *  wash instead. All default false. */
  aisleInvalid?: boolean;
  binInvalid?: boolean;
  levelInvalid?: boolean;
  /** Washes all three boxes as a single group (v1.7.0 app-wide rollout — see
   *  `DevNotes/DesignPrompts/Feature-8-AppWide-Invalid-Field-Wash.md`), for a caller whose
   *  failure is a single combined check against the whole Aisle+Bin(+Level) value with no
   *  way to attribute it to one box specifically (e.g. WLH's whole-location existence
   *  lookup) — same "attribute to the smallest checkable unit" rule PAR's DPCI group wash
   *  follows. Independent of the per-box `aisleInvalid`/`binInvalid`/`levelInvalid` flags —
   *  a caller should use one or the other, not both. Distinct from the older `highlight`
   *  prop (border-only, currently unused by any caller) — this applies the actual
   *  `INVALID_WASH` treatment via a wrapping div, matching PAR/ISI/IID's DPCI pattern
   *  exactly: individual boxes keep their normal styling, the wrapper alone carries the
   *  wash. */
  groupInvalid?: boolean;
}

/**
 * Shared three-field Aisle/Bin/Level entry with auto-advance, plus an always-on full
 * 8-digit barcode scan — used identically by LII and WLH per their screen specs ("same
 * three-field auto-advance pattern as LII"). A worker can either type Aisle → Bin →
 * Level in sequence, or scan a full 8-digit barcode into whichever field currently has
 * focus; an 8-digit confirmed value in any field is treated as a complete override and
 * resolves immediately, regardless of what's already been typed into the other fields.
 * When `levelOptional` is set, a 6-digit scan (a physical location barcode typically only
 * encodes Aisle+Bin, not Level) is treated the same way.
 *
 * `lockedAisle`/`lockedLevel` let a caller fix either box to a known value instead of
 * requiring the worker to type it — the box still displays (disabled), and the locked
 * value is spliced into the resolved location alongside whatever was actually typed.
 */
export function LocationEntryFields({
  onResolved, autoFocus = true, value, highlight = false, onActiveChange, lockedAisle, lockedLevel, size = 'default',
  levelOptional = false, checkAisle, checkAisleBin, onAisleValidityChange, onBinValidityChange,
  aisleInvalid: externalAisleInvalid = false, binInvalid: externalBinInvalid = false, levelInvalid = false,
  groupInvalid = false,
}: LocationEntryFieldsProps) {
  const { hidePanel } = useNumpad();
  // maxLength auto-advances once the fixed-length manual entry is complete (3/3/2 digits);
  // a full 8-digit scanner override still lands correctly since NumpadContext's
  // isScanningRef suppresses maxLength auto-submit while deliverScan is mid-injection.
  // padOnSubmit: a worker can type "80" and hit OK on the 3-digit Bin box, and it's
  // accepted as "080" instead of silently going nowhere — same for Aisle/Level.
  const aisleField = useNumpadField('numpad', 3, true);
  const binField = useNumpadField('numpad', 3, true);
  const levelField = useNumpadField('numpad', 2, true);

  const isActive = aisleField.isActive || binField.isActive || levelField.isActive;
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;
  useEffect(() => {
    onActiveChangeRef.current?.(isActive);
  }, [isActive]);

  // Internal progressive existence-check state (issue #162) — only ever populated when
  // `checkAisle`/`checkAisleBin` are provided; otherwise stays permanently false and the
  // external `aisleInvalid`/`binInvalid` props drive the wash instead (see boxClasses below).
  const [internalAisleInvalid, setInternalAisleInvalid] = useState(false);
  const [internalBinInvalid, setInternalBinInvalid] = useState(false);
  useEffect(() => { onAisleValidityChange?.(internalAisleInvalid); }, [internalAisleInvalid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onBinValidityChange?.(internalBinInvalid); }, [internalBinInvalid]); // eslint-disable-line react-hooks/exhaustive-deps
  const aisleInvalid = checkAisle ? internalAisleInvalid : externalAisleInvalid;
  const binInvalid = checkAisleBin ? internalBinInvalid : externalBinInvalid;

  // The Aisle→Bin→Level auto-advance chain below only ever registers its handlers once,
  // at mount (see the effect at the bottom) — handleBinConfirm/handleLevelConfirm are
  // therefore always the closures captured on that first render, which close over
  // aisleField/binField as they were at that render (both still ''). Reading
  // aisleField.value/binField.value directly from those stale closures would silently
  // resolve every manual entry as just the 2-digit Level value. These refs are mutated
  // in place instead, so they stay live regardless of which render's closure reads them.
  const aisleValueRef = useRef('');
  const binValueRef = useRef('');

  /** Registers the Aisle field's numpad handler and opens the panel. */
  function focusAisleField() {
    aisleField.focus(handleAisleConfirm);
  }
  /** Registers the Bin field's numpad handler and opens the panel. */
  function focusBinField() {
    binField.focus(handleBinConfirm);
  }
  /** Registers the Level field's numpad handler and opens the panel. */
  function focusLevelField() {
    levelField.focus(handleLevelConfirm);
  }

  /** A full-value scan/prefill override bypasses the interactive per-box chain entirely,
   *  so any internal invalid state left over from a prior manual attempt no longer means
   *  anything against the new value — cleared the same way a fresh external `value`
   *  prefill clears it (see that effect below). No-op when neither `checkAisle` nor
   *  `checkAisleBin` is provided. */
  function clearInternalInvalid() {
    setInternalAisleInvalid(false);
    setInternalBinInvalid(false);
  }

  /** Aisle field submit: an 8-digit value is a full-barcode override; a 6-digit value is a
   *  full Aisle+Bin override when levelOptional (see the prop's doc comment); a 3-digit
   *  value advances to Bin. */
  function handleAisleConfirm(value: string) {
    const v = value.trim();
    if (v.length === 8) {
      hidePanel();
      clearInternalInvalid();
      onResolved(v, true);
      return;
    }
    if (levelOptional && v.length === 6) {
      hidePanel();
      clearInternalInvalid();
      onResolved(v, true);
      return;
    }
    if (v.length !== 3) return;
    aisleValueRef.current = v;
    if (checkAisle) {
      setInternalBinInvalid(false);
      checkAisle(v)
        .then(({ exists }) => setInternalAisleInvalid(!exists))
        .catch(() => setInternalAisleInvalid(true));
    }
    setTimeout(() => focusBinField(), 50);
  }

  /** Bin field submit: an 8-digit value is a full-barcode override; a 6-digit value is a
   *  full Aisle+Bin override when levelOptional; a 3-digit value advances to Level, or
   *  resolves immediately if Level is locked or levelOptional. */
  function handleBinConfirm(value: string) {
    const v = value.trim();
    if (v.length === 8) {
      hidePanel();
      clearInternalInvalid();
      onResolved(v, true);
      return;
    }
    if (levelOptional && v.length === 6) {
      hidePanel();
      clearInternalInvalid();
      onResolved(v, true);
      return;
    }
    if (v.length !== 3) return;
    binValueRef.current = v;
    // Skipped entirely once Aisle is already known invalid (internally or externally) —
    // a Bin can't meaningfully exist or not within an Aisle that itself doesn't, and only
    // the top-level field actually at fault should wash (same rule PAR's own pre-existing
    // checkAisleBinExists already followed).
    if (checkAisleBin && !aisleInvalid) {
      checkAisleBin(lockedAisle ?? aisleValueRef.current, v)
        .then(() => setInternalBinInvalid(false))
        .catch(() => setInternalBinInvalid(true));
    }
    if (lockedLevel != null) {
      hidePanel();
      onResolved((lockedAisle ?? aisleValueRef.current) + v + lockedLevel, false);
      return;
    }
    if (levelOptional) {
      hidePanel();
      onResolved((lockedAisle ?? aisleValueRef.current) + v, false);
      return;
    }
    setTimeout(() => focusLevelField(), 50);
  }

  /** Level field submit: an 8-digit value is a full-barcode override; a 6-digit value is a
   *  full Aisle+Bin override when levelOptional; a 2-digit value completes Aisle+Bin+Level
   *  and resolves. */
  function handleLevelConfirm(value: string) {
    const v = value.trim();
    if (v.length === 8) {
      hidePanel();
      clearInternalInvalid();
      onResolved(v, true);
      return;
    }
    if (levelOptional && v.length === 6) {
      hidePanel();
      clearInternalInvalid();
      onResolved(v, true);
      return;
    }
    if (v.length !== 2) return;
    hidePanel();
    onResolved((lockedAisle ?? aisleValueRef.current) + binValueRef.current + v, false);
  }

  useEffect(() => {
    if (!autoFocus) return;
    const id = setTimeout(() => (lockedAisle != null ? focusBinField() : focusAisleField()), 50);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, lockedAisle]);

  // External prefill/clear (issue #69) — only acts when the caller actually passes
  // `value` (LII/WLH never do, so this is a no-op for them). `''` clears all three
  // boxes; an 8-digit string fills them directly, bypassing the normal typed-entry chain.
  useEffect(() => {
    if (value == null) return;
    clearInternalInvalid();
    if (!value) {
      aisleField.clear();
      binField.clear();
      levelField.clear();
      aisleValueRef.current = '';
      binValueRef.current = '';
      return;
    }
    if (value.length === 8) {
      aisleField.set(value.slice(0, 3));
      binField.set(value.slice(3, 6));
      levelField.set(value.slice(6, 8));
      aisleValueRef.current = value.slice(0, 3);
      binValueRef.current = value.slice(3, 6);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // `invalid` (per-box, v1.6.11) takes precedence over both `highlight` (whole-group,
  // border-only, pre-v1.6.11) and the plain active-focus border — same invalid-over-active
  // precedence every other numpad field in the app uses (see FieldBox in PARPage.tsx).
  const boxClasses = (active: boolean, invalid: boolean) =>
    invalid ? INVALID_WASH
      : (highlight || active) ? 'border-[#CC0000] bg-[#0D0D0D]'
      : 'border-[#3A3A3A] hover:border-[#555] bg-[#0D0D0D]';

  const boxHeight  = size === 'large' ? 'h-[68px]' : 'h-[56px]';
  const textSize   = size === 'large' ? 'text-[26px]' : 'text-[22px]';
  const barHeight  = size === 'large' ? 'h-[24px]' : 'h-[20px]';
  const aisleWidth = size === 'large' ? 'w-[135px]' : 'w-[120px]';
  const binWidth   = size === 'large' ? 'w-[135px]' : 'w-[120px]';
  const levelWidth = size === 'large' ? 'w-[115px]' : 'w-[100px]';

  return (
    <div className={`flex gap-3 rounded-[12px] ${groupInvalid ? `${INVALID_WASH} border-2 p-1` : ''}`}>
      <div className={`flex flex-col gap-1 ${aisleWidth}`}>
        <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Aisle</span>
        {lockedAisle != null ? (
          <div className={`flex items-center ${boxHeight} px-4 rounded-[10px] bg-[#0A0A0A] border-2 border-[#222] opacity-50`}>
            <span className={`font-data ${textSize} font-medium text-[#9A9A9A]`}>{lockedAisle}</span>
          </div>
        ) : (
          <button type="button" onClick={focusAisleField} className={`flex items-center ${boxHeight} px-4 rounded-[10px] border-2 transition-colors ${boxClasses(aisleField.isActive, aisleInvalid)}`}>
            <span className={`font-data ${textSize} font-medium text-white`}>{aisleField.value || <span className="text-[#444]">—</span>}</span>
            {aisleField.isActive && <span className={`inline-block w-[2px] ${barHeight} bg-[#CC0000] ml-2 animate-pulse rounded-sm`} />}
          </button>
        )}
      </div>
      <div className={`flex flex-col gap-1 ${binWidth}`}>
        <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Bin</span>
        <button type="button" onClick={focusBinField} className={`flex items-center ${boxHeight} px-4 rounded-[10px] border-2 transition-colors ${boxClasses(binField.isActive, binInvalid)}`}>
          <span className={`font-data ${textSize} font-medium text-white`}>{binField.value || <span className="text-[#444]">—</span>}</span>
          {binField.isActive && <span className={`inline-block w-[2px] ${barHeight} bg-[#CC0000] ml-2 animate-pulse rounded-sm`} />}
        </button>
      </div>
      <div className={`flex flex-col gap-1 ${levelWidth}`}>
        <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Level</span>
        {lockedLevel != null ? (
          <div className={`flex items-center ${boxHeight} px-4 rounded-[10px] bg-[#0A0A0A] border-2 border-[#222] opacity-50`}>
            <span className={`font-data ${textSize} font-medium text-[#9A9A9A]`}>{lockedLevel}</span>
          </div>
        ) : (
          <button type="button" onClick={focusLevelField} className={`flex items-center ${boxHeight} px-4 rounded-[10px] border-2 transition-colors ${boxClasses(levelField.isActive, levelInvalid)}`}>
            <span className={`font-data ${textSize} font-medium text-white`}>{levelField.value || <span className="text-[#444]">—</span>}</span>
            {levelField.isActive && <span className={`inline-block w-[2px] ${barHeight} bg-[#CC0000] ml-2 animate-pulse rounded-sm`} />}
          </button>
        )}
      </div>
    </div>
  );
}
