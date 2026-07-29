import { CodePickerField, type CodeOption } from './CodePickerField';

const ZONE_OPTIONS: CodeOption[] = [1, 2, 3, 4].map((z) => ({ code: String(z), desc: `Zone ${z}` }));

interface ZoneFieldProps {
  value: number | null;
  onChange: (value: number | null) => void;
  size?: 'compact' | 'default';
  /** Overrides the width Tailwind class `size` would otherwise pick — see CodePickerField. */
  width?: string;
  label?: string;
  disabled?: boolean;
  /** See CodePickerField's own doc — rejects a typed value outside 1-4 instead of
   *  committing it. Off by default, matching every other field's own default. */
  strict?: boolean;
  onInvalid?: (code: string) => void;
  /** See `useCodePickerField`'s own doc — fires reactively on the field's own computed
   *  validity, independent of `strict` (Feature 10). */
  onValidityChange?: (invalid: boolean) => void;
  /** See CodePickerField's own doc — forces the wash on top of the field's own internal
   *  value-vs-options check; not needed for the ordinary case (Feature 10). */
  invalid?: boolean;
}

/**
 * Shared single-digit Zone entry field — free-text + dropdown-helper, matching Storage
 * Code/Size (issue #80). Previously SDP's Zone override was a plain native `<select>`
 * (Zones have no full name to disambiguate, unlike Storage Code/Size), which read as
 * inconsistent next to those two fields; converted to match. Always lists all 4 zones —
 * never narrowed by aisle context, unlike Storage Code/Size. `strict`/`invalid`/
 * `onInvalid`/`onValidityChange` added (Feature 10) — previously missing entirely, so
 * this field could never wash even though `CodePickerField` already supported it.
 */
export function ZoneField({ value, onChange, size = 'default', width, label = 'Zone', disabled = false, strict = false, onInvalid, onValidityChange, invalid = false }: ZoneFieldProps) {
  return (
    <CodePickerField
      value={value != null ? String(value) : ''}
      onChange={(v) => onChange(v ? parseInt(v, 10) : null)}
      options={ZONE_OPTIONS}
      panel="numpad"
      maxLength={1}
      size={size}
      width={width}
      label={label}
      ariaLabel={label}
      disabled={disabled}
      strict={strict}
      onInvalid={onInvalid}
      onValidityChange={onValidityChange}
      invalid={invalid}
    />
  );
}
