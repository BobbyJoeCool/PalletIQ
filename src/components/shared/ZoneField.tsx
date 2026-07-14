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
}

/**
 * Shared single-digit Zone entry field — free-text + dropdown-helper, matching Storage
 * Code/Size (issue #80). Previously SDP's Zone override was a plain native `<select>`
 * (Zones have no full name to disambiguate, unlike Storage Code/Size), which read as
 * inconsistent next to those two fields; converted to match. Always lists all 4 zones —
 * never narrowed by aisle context, unlike Storage Code/Size.
 */
export function ZoneField({ value, onChange, size = 'default', width, label = 'Zone', disabled = false }: ZoneFieldProps) {
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
    />
  );
}
