import { useWorkstations } from '../../lib/useWorkstations';
import { CodePickerField } from './CodePickerField';

interface WorkstationFieldProps {
  value: string;
  onChange: (value: string) => void;
  size?: 'compact' | 'default';
  /** Overrides the width Tailwind class `size` would otherwise pick — see CodePickerField. */
  width?: string;
  label?: string;
  disabled?: boolean;
  /** See CodePickerField's own doc — rejects a typed value not present in the workstation
   *  list instead of committing it. */
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
 * Shared Workstation entry field (GitHub #124) — keyboard-driven, uppercases, fetches the
 * `GET /api/workstations` list itself via `useWorkstations` rather than the caller fetching
 * and handing down `options` (Feature 10, matching StorageCodeField's own internal-fetch
 * shape). Mechanical extraction of ELA's original inline `CodePickerField` usage — no
 * behavior change, since ELA's field already owned its validity internally through
 * `CodePickerField`; this just gives it a named, reusable component for consistency with
 * every other entry field in the app.
 */
export function WorkstationField({ value, onChange, size = 'default', width, label = 'Workstation', disabled = false, strict = false, onInvalid, onValidityChange, invalid = false }: WorkstationFieldProps) {
  const workstations = useWorkstations();
  const options = (workstations ?? []).map((w) => ({ code: w.id, desc: w.name }));

  return (
    <CodePickerField
      value={value}
      onChange={onChange}
      options={options}
      optionsLoading={workstations === null}
      panel="keyboard"
      maxLength={4}
      transform={(v) => v.toUpperCase()}
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
