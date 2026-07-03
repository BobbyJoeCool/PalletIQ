import { useEffect } from 'react';
import { useNumpad } from '../../context/NumpadContext';
import { useNumpadField } from '../../lib/useNumpadField';

interface LocationEntryFieldsProps {
  /** Called once a full 8-digit Aisle+Bin+Level location is resolved, either by a full
   *  barcode scan (in any field) or by completing all three manual fields in sequence. */
  onResolved: (locationId: string) => void;
  /** Auto-focuses the Aisle field on mount — off by default so callers with their own
   *  entry-point logic (e.g. pre-populated from a scan) can opt out. */
  autoFocus?: boolean;
}

/**
 * Shared three-field Aisle/Bin/Level entry with auto-advance, plus an always-on full
 * 8-digit barcode scan — used identically by LII and WLH per their screen specs ("same
 * three-field auto-advance pattern as LII"). A worker can either type Aisle → Bin →
 * Level in sequence, or scan a full 8-digit barcode into whichever field currently has
 * focus; an 8-digit confirmed value in any field is treated as a complete override and
 * resolves immediately, regardless of what's already been typed into the other fields.
 */
export function LocationEntryFields({ onResolved, autoFocus = true }: LocationEntryFieldsProps) {
  const { hidePanel } = useNumpad();
  const aisleField = useNumpadField();
  const binField = useNumpadField();
  const levelField = useNumpadField();

  function focusAisleField() {
    aisleField.focus(handleAisleConfirm);
  }
  function focusBinField() {
    binField.focus(handleBinConfirm);
  }
  function focusLevelField() {
    levelField.focus(handleLevelConfirm);
  }

  function handleAisleConfirm(value: string) {
    const v = value.trim();
    if (v.length === 8) {
      hidePanel();
      onResolved(v);
      return;
    }
    if (v.length !== 3) return;
    setTimeout(() => focusBinField(), 50);
  }

  function handleBinConfirm(value: string) {
    const v = value.trim();
    if (v.length === 8) {
      hidePanel();
      onResolved(v);
      return;
    }
    if (v.length !== 3) return;
    setTimeout(() => focusLevelField(), 50);
  }

  function handleLevelConfirm(value: string) {
    const v = value.trim();
    if (v.length === 8) {
      hidePanel();
      onResolved(v);
      return;
    }
    if (v.length !== 2) return;
    hidePanel();
    onResolved(aisleField.value.trim() + binField.value.trim() + v);
  }

  useEffect(() => {
    if (!autoFocus) return;
    const id = setTimeout(() => focusAisleField(), 50);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  return (
    <div className="flex gap-3">
      <div className="flex flex-col gap-1 w-[120px]">
        <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Aisle</span>
        <button type="button" onClick={focusAisleField} className="flex items-center h-[56px] px-4 rounded-[10px] bg-[#0D0D0D] border-2 border-[#3A3A3A] hover:border-[#555] transition-colors">
          <span className="font-data text-[22px] font-medium text-white">{aisleField.value || <span className="text-[#444]">—</span>}</span>
          {aisleField.isActive && <span className="inline-block w-[2px] h-[20px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
        </button>
      </div>
      <div className="flex flex-col gap-1 w-[120px]">
        <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Bin</span>
        <button type="button" onClick={focusBinField} className="flex items-center h-[56px] px-4 rounded-[10px] bg-[#0D0D0D] border-2 border-[#3A3A3A] hover:border-[#555] transition-colors">
          <span className="font-data text-[22px] font-medium text-white">{binField.value || <span className="text-[#444]">—</span>}</span>
          {binField.isActive && <span className="inline-block w-[2px] h-[20px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
        </button>
      </div>
      <div className="flex flex-col gap-1 w-[100px]">
        <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Level</span>
        <button type="button" onClick={focusLevelField} className="flex items-center h-[56px] px-4 rounded-[10px] bg-[#0D0D0D] border-2 border-[#3A3A3A] hover:border-[#555] transition-colors">
          <span className="font-data text-[22px] font-medium text-white">{levelField.value || <span className="text-[#444]">—</span>}</span>
          {levelField.isActive && <span className="inline-block w-[2px] h-[20px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
        </button>
      </div>
    </div>
  );
}
