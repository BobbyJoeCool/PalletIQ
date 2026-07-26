import { forwardRef } from 'react';
import { SIZES, SIZE_NAMES } from '../../lib/sizes';
import { CodePickerField, type CodeOption, type CodePickerFieldHandle } from './CodePickerField';

const FULL_SIZE_OPTIONS: CodeOption[] = SIZES.map((s) => ({ code: s, desc: SIZE_NAMES[s] }));

interface SizeFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Narrowed list of sizes actually available in the current context (e.g. present in an
   *  already-entered aisle + Storage Code) — issue #80. Omit to show the full XS–L
   *  reference list. */
  options?: CodeOption[];
  /** `compact` matches STG's per-stack pallet-box styling; `default` matches full-screen
   *  filter bars (ELA). Styling is variant-based, not free className passthrough (issue #78). */
  size?: 'compact' | 'default';
  /** Overrides the width Tailwind class `size` would otherwise pick — see CodePickerField. */
  width?: string;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** See CodePickerField's own doc — rejects a typed value not present in `options`
   *  (or the full XS–L list, if `options` is omitted) instead of committing it. */
  strict?: boolean;
  onInvalid?: (code: string) => void;
  /** See CodePickerField's own doc — applies the app-wide red-wash treatment. */
  invalid?: boolean;
}

/** A single-letter code is already a complete, unambiguous Size — "X" and "H" are held
 *  back since they could still extend into "XS"/"HS". */
function isCompleteSingleLetterSize(v: string): boolean {
  return ['S', 'M', 'L'].includes(v.toUpperCase());
}

/**
 * Shared Size entry field (issue #78; converted from a native `<select>` to free-text +
 * dropdown-helper-popup per issue #80) — the fixed XS/HS/S/M/L set used identically by
 * ELA/STG/SDP. A worker can type a size they know: two-letter codes ("XS"/"HS") auto-commit
 * at 2 characters same as Storage Code, and single-letter codes ("S"/"M"/"L") commit
 * immediately after that one character (v1.6.5) rather than waiting for a 2nd keystroke or
 * a refocus-triggered Blur — or tap the helper button to pick from a popup showing each
 * code's full name. Narrowed to what's actually available when the caller knows enough
 * context (e.g. an aisle + Storage Code already entered), or the full list otherwise — Size
 * has no lookup table to fetch from, so the un-narrowed case is just this static list.
 */
export const SizeField = forwardRef<CodePickerFieldHandle, SizeFieldProps>(function SizeField({ value, onChange, options, size = 'default', width, label = 'Size', ariaLabel, disabled = false, strict = false, onInvalid, invalid = false }, ref) {
  return (
    <CodePickerField
      ref={ref}
      value={value}
      onChange={onChange}
      options={options ?? FULL_SIZE_OPTIONS}
      panel="keyboard"
      maxLength={2}
      earlyCommit={isCompleteSingleLetterSize}
      transform={(v) => v.toUpperCase()}
      size={size}
      width={width}
      label={label}
      ariaLabel={ariaLabel ?? label}
      disabled={disabled}
      strict={strict}
      onInvalid={onInvalid}
      invalid={invalid}
    />
  );
});
