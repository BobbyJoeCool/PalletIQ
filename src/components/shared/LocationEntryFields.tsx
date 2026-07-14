import { useEffect, useRef } from 'react';
import { useNumpad } from '../../context/NumpadContext';
import { useNumpadField } from '../../lib/useNumpadField';

interface LocationEntryFieldsProps {
  /** Called once a full 8-digit Aisle+Bin+Level location is resolved, either by a full
   *  barcode scan (in any field) or by completing every non-locked manual field in
   *  sequence. `wasScanned` is true only for the full-barcode-override path — a real
   *  hardware scan always delivers all 8 digits atomically into whichever field has
   *  focus, which manual typing structurally cannot produce (each field auto-submits at
   *  its own maxLength before 8 digits could accumulate) — so this distinction is exact,
   *  not a heuristic. */
  onResolved: (locationId: string, wasScanned: boolean) => void;
  /** Auto-focuses the first non-locked field on mount — off by default so callers with
   *  their own entry-point logic (e.g. pre-populated from a scan) can opt out. */
  autoFocus?: boolean;
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
}

/**
 * Shared three-field Aisle/Bin/Level entry with auto-advance, plus an always-on full
 * 8-digit barcode scan — used identically by LII and WLH per their screen specs ("same
 * three-field auto-advance pattern as LII"). A worker can either type Aisle → Bin →
 * Level in sequence, or scan a full 8-digit barcode into whichever field currently has
 * focus; an 8-digit confirmed value in any field is treated as a complete override and
 * resolves immediately, regardless of what's already been typed into the other fields.
 *
 * `lockedAisle`/`lockedLevel` let a caller fix either box to a known value instead of
 * requiring the worker to type it — the box still displays (disabled), and the locked
 * value is spliced into the resolved location alongside whatever was actually typed.
 */
export function LocationEntryFields({
  onResolved, autoFocus = true, value, highlight = false, onActiveChange, lockedAisle, lockedLevel,
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

  /** Aisle field submit: an 8-digit value is a full-barcode override (resolves immediately); a 3-digit value advances to Bin. */
  function handleAisleConfirm(value: string) {
    const v = value.trim();
    if (v.length === 8) {
      hidePanel();
      onResolved(v, true);
      return;
    }
    if (v.length !== 3) return;
    aisleValueRef.current = v;
    setTimeout(() => focusBinField(), 50);
  }

  /** Bin field submit: an 8-digit value is a full-barcode override (resolves immediately); a 3-digit value advances to Level, or resolves immediately if Level is locked. */
  function handleBinConfirm(value: string) {
    const v = value.trim();
    if (v.length === 8) {
      hidePanel();
      onResolved(v, true);
      return;
    }
    if (v.length !== 3) return;
    binValueRef.current = v;
    if (lockedLevel != null) {
      hidePanel();
      onResolved((lockedAisle ?? aisleValueRef.current) + v + lockedLevel, false);
      return;
    }
    setTimeout(() => focusLevelField(), 50);
  }

  /** Level field submit: an 8-digit value is a full-barcode override; a 2-digit value completes Aisle+Bin+Level and resolves. */
  function handleLevelConfirm(value: string) {
    const v = value.trim();
    if (v.length === 8) {
      hidePanel();
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

  const boxBorder = (active: boolean) =>
    highlight ? 'border-[#CC0000]' : active ? 'border-[#CC0000]' : 'border-[#3A3A3A] hover:border-[#555]';

  return (
    <div className="flex gap-3">
      <div className="flex flex-col gap-1 w-[120px]">
        <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Aisle</span>
        {lockedAisle != null ? (
          <div className="flex items-center h-[56px] px-4 rounded-[10px] bg-[#0A0A0A] border-2 border-[#222] opacity-50">
            <span className="font-data text-[22px] font-medium text-[#9A9A9A]">{lockedAisle}</span>
          </div>
        ) : (
          <button type="button" onClick={focusAisleField} className={`flex items-center h-[56px] px-4 rounded-[10px] bg-[#0D0D0D] border-2 transition-colors ${boxBorder(aisleField.isActive)}`}>
            <span className="font-data text-[22px] font-medium text-white">{aisleField.value || <span className="text-[#444]">—</span>}</span>
            {aisleField.isActive && <span className="inline-block w-[2px] h-[20px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1 w-[120px]">
        <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Bin</span>
        <button type="button" onClick={focusBinField} className={`flex items-center h-[56px] px-4 rounded-[10px] bg-[#0D0D0D] border-2 transition-colors ${boxBorder(binField.isActive)}`}>
          <span className="font-data text-[22px] font-medium text-white">{binField.value || <span className="text-[#444]">—</span>}</span>
          {binField.isActive && <span className="inline-block w-[2px] h-[20px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
        </button>
      </div>
      <div className="flex flex-col gap-1 w-[100px]">
        <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Level</span>
        {lockedLevel != null ? (
          <div className="flex items-center h-[56px] px-4 rounded-[10px] bg-[#0A0A0A] border-2 border-[#222] opacity-50">
            <span className="font-data text-[22px] font-medium text-[#9A9A9A]">{lockedLevel}</span>
          </div>
        ) : (
          <button type="button" onClick={focusLevelField} className={`flex items-center h-[56px] px-4 rounded-[10px] bg-[#0D0D0D] border-2 transition-colors ${boxBorder(levelField.isActive)}`}>
            <span className="font-data text-[22px] font-medium text-white">{levelField.value || <span className="text-[#444]">—</span>}</span>
            {levelField.isActive && <span className="inline-block w-[2px] h-[20px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
          </button>
        )}
      </div>
    </div>
  );
}
