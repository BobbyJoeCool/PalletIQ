import { useNumpadField } from './useNumpadField';

interface UseLocationRangeFieldsOpts {
  /** Fires once End Bin completes (exactly 3 digits) — the chain's terminal required
   *  step. WLH passes its own `hidePanel`. */
  onEndBinComplete?: () => void;
}

/**
 * Shared Start/End Bin + optional Start/End Level range fields (Feature 10) — extracted
 * from WLH's Range Hold panel, its only current consumer. Deliberately extracted despite
 * having no cross-screen duplication yet (Feature 10's own contract: single-use fields
 * aren't exempt, consistency is the point, not just deduplication of existing repetition)
 * — ready for a second consumer without a rewrite, and keeps the range-validity rule in
 * one place rather than inline in the screen.
 *
 * Deliberately does **not** own Aisle — WLH's Aisle field is a separate, bare-filter
 * field (issue #161's own scope), not part of this range shape. Callers combine this
 * hook's own `rangeValid` with their own Aisle validity for the final gate.
 */
export function useLocationRangeFields(opts: UseLocationRangeFieldsOpts = {}) {
  const startBinField = useNumpadField('numpad', 3, true);
  const endBinField = useNumpadField('numpad', 3, true);
  // Level range is optional, 2-digit like every other Level field in the app — left
  // blank on both ends means "every level" (the original single-aisle-and-bins-only
  // design's default).
  const startLevelField = useNumpadField('numpad', 2, true);
  const endLevelField = useNumpadField('numpad', 2, true);

  function focusStartBin() { startBinField.focus(handleStartBin); }
  function focusEndBin() { endBinField.focus(handleEndBin); }
  /** No auto-advance chain for Level — the range is optional and either box may be
   *  filled independently. */
  function focusStartLevel() { startLevelField.focus(() => {}); }
  function focusEndLevel() { endLevelField.focus(() => {}); }
  /** Start Bin submit: advances to End Bin once exactly 3 digits are entered. */
  function handleStartBin(v: string) { if (v.trim().length === 3) setTimeout(() => focusEndBin(), 50); }
  /** End Bin submit: fires `onEndBinComplete` once exactly 3 digits are entered — the
   *  last field in the required chain. */
  function handleEndBin(v: string) { if (v.trim().length === 3) opts.onEndBinComplete?.(); }

  const startBin = startBinField.value ? parseInt(startBinField.value, 10) : NaN;
  const endBin = endBinField.value ? parseInt(endBinField.value, 10) : NaN;
  const startLevel = startLevelField.value ? parseInt(startLevelField.value, 10) : NaN;
  const endLevel = endLevelField.value ? parseInt(endLevelField.value, 10) : NaN;
  const hasLevelRange = startLevelField.value !== '' && endLevelField.value !== '';
  // Either both Level boxes are blank (no filter) or both are filled with a valid
  // Start<=End pair — one filled and the other blank is treated as invalid, same as any
  // half-entered range.
  const levelRangeValid = startLevelField.value === '' && endLevelField.value === ''
    ? true
    : hasLevelRange && Number.isInteger(startLevel) && Number.isInteger(endLevel) && startLevel <= endLevel;
  const binRangeValid = Number.isInteger(startBin) && Number.isInteger(endBin) && startBin <= endBin;
  /** Combined validity for the Bin+Level range this hook owns — does not include Aisle,
   *  see this file's own top doc for why. */
  const rangeValid = binRangeValid && levelRangeValid;

  function clear() {
    startBinField.clear();
    endBinField.clear();
    startLevelField.clear();
    endLevelField.clear();
  }

  return {
    startBinField, endBinField, startLevelField, endLevelField,
    focusStartBin, focusEndBin, focusStartLevel, focusEndLevel,
    startBin, endBin, startLevel, endLevel, hasLevelRange, levelRangeValid, rangeValid,
    clear,
  };
}
