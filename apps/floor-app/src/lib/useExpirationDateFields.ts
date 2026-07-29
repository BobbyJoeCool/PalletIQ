import { useCallback, useRef, useState } from 'react';
import { useNumpadField } from './useNumpadField';
import { useNumpad } from '../context/NumpadContext';

interface UseExpirationDateFieldsOpts {
  onChange: (iso: string) => void;
  /** Also runs the "at least 1 month out" business-rule check as a group-level invalid
   *  state once the chain completes — PAR's own behavior. Off by default: PII
   *  deliberately omits this client-side check, relying on the server's
   *  `EXPIRATION_NEEDS_CONFIRM` confirm-popup round trip instead (see PIIPage.tsx's own
   *  comment on why — the "too soon" rule is a business check, not a format one, and
   *  PII already surfaces it separately). */
  checkTooSoon?: boolean;
  /** Fires whenever the too-soon group state changes — only meaningful when
   *  `checkTooSoon` is true. */
  onTooSoonChange?: (invalid: boolean) => void;
  /** Fires once Year commits (the chain's terminal step) — e.g. PAR's own screen-wide
   *  auto-advance to the next field. PII has no equivalent next step and can omit this. */
  onComplete?: () => void;
}

/**
 * Shared Month/Day/Year expiration-date chain (Feature 10 / issue #163) — extracted from
 * PAR and PII, which independently implemented the identical chain (including a
 * copy-pasted days-in-month/leap-year helper; PII's own prior comment admitted it was
 * "matching PAR's exact format"). Chrome (box component, layout, labels) stays with each
 * caller — PAR uses `FieldBox` in a dedicated row, PII uses `EditBox` inline in its
 * detail-row layout — only the field behavior is shared here, mirroring how
 * `useCodePickerField` already separates behavior from chrome for `CodePickerField` vs.
 * STG's differently-skinned `PalletCodePicker`.
 *
 * Uses `monthValueRef`/`dayValueRef` (not `monthField.value`/`dayField.value` read
 * directly inside later handlers) for the same reason PAR's own v1.6.11 fix needed
 * them: `handleDayConfirm`/`handleYearConfirm` are registered via a chain frozen at
 * whenever Month was first tapped (before Month/Day had values), so a direct `.value`
 * read inside those handlers never sees later updates — this was the exact cause of a
 * direct PAR bug report ("entering 10/24/2027 submitted //2027"). PII's pre-extraction
 * implementation read `.value` directly in the same shape and very likely carried the
 * identical latent bug, just never reported — the ref-based fix here closes it for both.
 */
export function useExpirationDateFields({
  onChange, checkTooSoon = false, onTooSoonChange, onComplete,
}: UseExpirationDateFieldsOpts) {
  const monthField = useNumpadField('numpad', 2, true);
  const dayField = useNumpadField('numpad', 2, true);
  const yearField = useNumpadField('numpad', 4);
  const { hidePanel } = useNumpad();
  const [monthInvalid, setMonthInvalid] = useState(false);
  const [dayInvalid, setDayInvalid] = useState(false);
  const monthValueRef = useRef('');
  const dayValueRef = useRef('');

  /** Days in a given month, 1-indexed (`month`: 1=Jan…12=Dec). `year` is optional and
   *  only affects February: omitted, February is treated permissively as 29 days (a
   *  leap-only Feb 29 isn't flagged wrong before the year is known); once Year lands,
   *  the day check re-runs with the real year for the precise leap/non-leap answer.
   *  Returns `31` for an out-of-range month — 1-12 range is `monthInvalid`'s own check. */
  const daysInMonth = useCallback((month: number, year?: number): number => {
    if (month === 2) {
      if (year == null) return 29;
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      return isLeap ? 29 : 28;
    }
    const table = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return table[month - 1] ?? 31;
  }, []);

  /** The "at least 1 month out" business-rule check — only run when `checkTooSoon`. */
  const checkTooSoonRule = useCallback((iso: string) => {
    if (!checkTooSoon) return;
    if (!iso) { onTooSoonChange?.(false); return; }
    const parsed = new Date(iso);
    const oneMonthOut = new Date();
    oneMonthOut.setMonth(oneMonthOut.getMonth() + 1);
    onTooSoonChange?.(parsed < oneMonthOut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkTooSoon]);

  function focusMonthField() { monthField.focus(handleMonthConfirm); }
  function focusDayField() { dayField.focus(handleDayConfirm); }
  function focusYearField() { yearField.focus(handleYearConfirm); }

  /** Month field submit: validates the 1-12 range and advances to Day regardless of
   *  whether the value itself was in range — length drives advance, correctness is
   *  checked separately (same convention the DPCI chain uses). */
  function handleMonthConfirm(v: string) {
    const trimmed = v.trim();
    if (trimmed.length !== 2) return;
    monthValueRef.current = trimmed;
    const n = parseInt(trimmed, 10);
    setMonthInvalid(n < 1 || n > 12);
    setTimeout(() => focusDayField(), 50);
  }

  /** Day field submit: validates the day actually exists in the entered month, skipped
   *  if Month itself is already out of range. Advances to Year regardless. */
  function handleDayConfirm(v: string) {
    const trimmed = v.trim();
    if (trimmed.length !== 2) return;
    dayValueRef.current = trimmed;
    const monthNum = parseInt(monthValueRef.current, 10);
    const dayNum = parseInt(trimmed, 10);
    const monthOk = monthNum >= 1 && monthNum <= 12;
    setDayInvalid(monthOk && (dayNum < 1 || dayNum > daysInMonth(monthNum)));
    setTimeout(() => focusYearField(), 50);
  }

  /** Year field submit: once exactly 4 digits are entered, re-checks Day against the
   *  real year (leap-year precision for a Feb 29 entered before Year was known), then
   *  composes Month+Day+Year into the ISO value and commits it via `onChange`. */
  function handleYearConfirm(v: string) {
    const trimmed = v.trim();
    if (trimmed.length !== 4) return;
    hidePanel();
    const monthNum = parseInt(monthValueRef.current, 10);
    const dayNum = parseInt(dayValueRef.current, 10);
    const yearNum = parseInt(trimmed, 10);
    const monthOk = monthNum >= 1 && monthNum <= 12;
    const dayOk = monthOk && dayNum >= 1 && dayNum <= daysInMonth(monthNum, yearNum);
    setDayInvalid(monthOk && !dayOk);
    const iso = `${trimmed}-${monthValueRef.current}-${dayValueRef.current}`;
    onChange(iso);
    if (monthOk && dayOk) {
      checkTooSoonRule(iso);
    } else {
      onTooSoonChange?.(false);
    }
    onComplete?.();
  }

  /** Clears all three boxes and their invalid state — for a caller's own form-reset. */
  function clear() {
    monthField.clear();
    dayField.clear();
    yearField.clear();
    monthValueRef.current = '';
    dayValueRef.current = '';
    setMonthInvalid(false);
    setDayInvalid(false);
    onTooSoonChange?.(false);
  }

  /** Imperatively populates all three boxes from an existing ISO date string (PII's own
   *  "enter Edit mode, pre-fill from the loaded pallet's current expirationDate" case —
   *  a one-time populate, not a continuous reactive sync, since neither caller wants
   *  typing in progress to be overwritten by an external value changing mid-entry). Also
   *  refreshes the refs so a subsequent Day/Year confirm doesn't read stale (pre-populate)
   *  values. `iso` may be `''`/malformed (no expiration date set) — clears all three. */
  function setFromIso(iso: string) {
    const [y, m, d] = iso.split('-');
    monthField.set(m ?? '');
    dayField.set(d ?? '');
    yearField.set(y ?? '');
    monthValueRef.current = m ?? '';
    dayValueRef.current = d ?? '';
    setMonthInvalid(false);
    setDayInvalid(false);
  }

  return {
    monthField, dayField, yearField,
    monthInvalid, dayInvalid,
    focusMonthField, focusDayField, focusYearField,
    clear, setFromIso,
  };
}
