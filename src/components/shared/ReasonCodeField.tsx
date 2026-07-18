import { CodePickerField } from './CodePickerField';

export interface ReasonCode { code: string; desc: string }

interface ReasonCodeFieldProps {
  /** The fixed code list for this domain (e.g. HOLD_REASON_CODES, EDIT_REASON_CODES) — never
   *  shared across domains, since the same code string can mean different things in each. */
  codes: ReasonCode[];
  /** The resolved final code — a typed code (known or custom) or one picked from the
   *  dropdown-helper popup. Empty string means no code yet. */
  value: string;
  onChange: (value: string) => void;
  /** `compact` for denser forms (e.g. an already-a-popup confirm dialog); `default` matches
   *  HoldPanel/PII's original sizing. Styling is variant-based, not free className passthrough
   *  (issue #78). */
  size?: 'compact' | 'default';
  label?: string;
}

/**
 * Shared reason-code entry — the same entry-with-dropdown-helper pattern as Storage Code/
 * Size (`CodePickerField`), not the old dropdown-plus-"Type a code…"-escape-hatch design
 * (direct instruction: "similar to all the others... Storage Code/Size/etc"). Every
 * domain's reason codes in this app are fixed 3-character codes (1 letter + 2 digits — see
 * `holdReasonCodes.ts`/`editReasonCodes.ts`), so typing 3 characters auto-commits and
 * dismisses the keyboard, same as Storage Code's own 2-character auto-commit; a worker can
 * still type a code they already know instead of opening the popup. Replaces the previous
 * native `<select>` + conditional custom-field design entirely — free-text entry already
 * covers the old "Type a code…" escape hatch, so there's no separate OTHER state anymore.
 */
export function ReasonCodeField({ codes, value, onChange, size = 'default', label = 'Reason Code' }: ReasonCodeFieldProps) {
  return (
    <CodePickerField
      value={value}
      onChange={onChange}
      options={codes}
      panel="keyboard"
      maxLength={3}
      transform={(v) => v.toUpperCase()}
      size={size}
      label={label}
      ariaLabel={label || 'Reason Code'}
      closeOnAutoSubmit
    />
  );
}
