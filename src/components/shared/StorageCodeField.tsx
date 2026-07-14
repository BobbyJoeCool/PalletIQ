import { useStorageCodes } from '../../lib/useStorageCodes';
import { CodePickerField, type CodeOption } from './CodePickerField';

interface StorageCodeFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Narrowed list of codes actually available in the current context (e.g. present in an
   *  already-entered aisle) — issue #80. Omit to show the full reference list, fetched
   *  from `GET /api/storage-codes`. */
  options?: CodeOption[];
  /** `compact` matches STG's Master Control bar; `default` matches full-screen filter bars
   *  (ELA/ELZ/LII). Styling is variant-based, not free className passthrough (issue #78). */
  size?: 'compact' | 'default';
  /** Overrides the width Tailwind class `size` would otherwise pick — see CodePickerField. */
  width?: string;
  label?: string;
  disabled?: boolean;
}

/**
 * Shared 2-character Storage Code entry field (issue #78) — keyboard-driven, uppercases and
 * auto-commits at 2 characters via useNumpadField's maxLength, matching the fixed-length
 * field convention already used identically across ELA/ELZ/STG/SDP/LII. A helper button
 * opens a dropdown popup of available codes with full names (issue #80) — narrowed to
 * what's actually present when the caller knows enough context to narrow, or the full
 * `GET /api/storage-codes` reference list otherwise.
 */
export function StorageCodeField({ value, onChange, options, size = 'default', width, label = 'Storage Code', disabled = false }: StorageCodeFieldProps) {
  // Always called (Rules of Hooks) — its cached result is simply unused once the caller
  // supplies a narrowed `options` list.
  const fullList = useStorageCodes();

  return (
    <CodePickerField
      value={value}
      onChange={onChange}
      options={options ?? fullList ?? []}
      optionsLoading={!options && fullList === null}
      panel="keyboard"
      maxLength={2}
      transform={(v) => v.toUpperCase()}
      size={size}
      width={width}
      label={label}
      ariaLabel={label}
      disabled={disabled}
    />
  );
}
