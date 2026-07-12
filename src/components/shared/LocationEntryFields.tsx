import { useEffect, useRef } from 'react';
import { useNumpad } from '../../context/NumpadContext';
import { useNumpadField } from '../../lib/useNumpadField';

interface LocationEntryFieldsProps {
  /** Called once a full 8-digit Aisle+Bin+Level location is resolved, either by a full
   *  barcode scan (in any field) or by completing all three manual fields in sequence. */
  onResolved: (locationId: string) => void;
  /** Auto-focuses the Aisle field on mount — off by default so callers with their own
   *  entry-point logic (e.g. pre-populated from a scan) can opt out. */
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
}

/**
 * Shared three-field Aisle/Bin/Level entry with auto-advance, plus an always-on full
 * 8-digit barcode scan — used identically by LII and WLH per their screen specs ("same
 * three-field auto-advance pattern as LII"). A worker can either type Aisle → Bin →
 * Level in sequence, or scan a full 8-digit barcode into whichever field currently has
 * focus; an 8-digit confirmed value in any field is treated as a complete override and
 * resolves immediately, regardless of what's already been typed into the other fields.
 */
export function LocationEntryFields({ onResolved, autoFocus = true, value, highlight = false }: LocationEntryFieldsProps) {
  const { hidePanel } = useNumpad();
  // maxLength auto-advances once the fixed-length manual entry is complete (3/3/2 digits);
  // a full 8-digit scanner override still lands correctly since NumpadContext's
  // isScanningRef suppresses maxLength auto-submit while deliverScan is mid-injection.
  const aisleField = useNumpadField('numpad', 3);
  const binField = useNumpadField('numpad', 3);
  const levelField = useNumpadField('numpad', 2);

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
      onResolved(v);
      return;
    }
    if (v.length !== 3) return;
    aisleValueRef.current = v;
    setTimeout(() => focusBinField(), 50);
  }

  /** Bin field submit: an 8-digit value is a full-barcode override (resolves immediately); a 3-digit value advances to Level. */
  function handleBinConfirm(value: string) {
    const v = value.trim();
    if (v.length === 8) {
      hidePanel();
      onResolved(v);
      return;
    }
    if (v.length !== 3) return;
    binValueRef.current = v;
    setTimeout(() => focusLevelField(), 50);
  }

  /** Level field submit: an 8-digit value is a full-barcode override; a 2-digit value completes Aisle+Bin+Level and resolves. */
  function handleLevelConfirm(value: string) {
    const v = value.trim();
    if (v.length === 8) {
      hidePanel();
      onResolved(v);
      return;
    }
    if (v.length !== 2) return;
    hidePanel();
    onResolved(aisleValueRef.current + binValueRef.current + v);
  }

  useEffect(() => {
    if (!autoFocus) return;
    const id = setTimeout(() => focusAisleField(), 50);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

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
        <button type="button" onClick={focusAisleField} className={`flex items-center h-[56px] px-4 rounded-[10px] bg-[#0D0D0D] border-2 transition-colors ${boxBorder(aisleField.isActive)}`}>
          <span className="font-data text-[22px] font-medium text-white">{aisleField.value || <span className="text-[#444]">—</span>}</span>
          {aisleField.isActive && <span className="inline-block w-[2px] h-[20px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
        </button>
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
        <button type="button" onClick={focusLevelField} className={`flex items-center h-[56px] px-4 rounded-[10px] bg-[#0D0D0D] border-2 transition-colors ${boxBorder(levelField.isActive)}`}>
          <span className="font-data text-[22px] font-medium text-white">{levelField.value || <span className="text-[#444]">—</span>}</span>
          {levelField.isActive && <span className="inline-block w-[2px] h-[20px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
        </button>
      </div>
    </div>
  );
}
