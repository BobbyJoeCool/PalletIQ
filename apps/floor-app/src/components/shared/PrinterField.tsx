import { forwardRef } from 'react';
import { printerTypeOf } from '../../lib/printerPrefixes';
import { usePrinters } from '../../lib/usePrinters';
import { CodePickerField, type CodePickerFieldHandle } from './CodePickerField';

interface PrinterFieldProps {
  value: string;
  onChange: (value: string) => void;
  size?: 'compact' | 'default';
  width?: string;
  label?: string;
  disabled?: boolean;
  /** Fires whenever the field's own validity changes (invalid = not an active printer). */
  onValidityChange?: (invalid: boolean) => void;
}

/**
 * Shared Printer field (#168): a 4-character keyboard-entry code with a pick list, strictly
 * validated against the active printers in the Printer table (`GET /api/printers`). Each
 * option is described by name plus the type its prefix encodes (`lib/printerPrefixes.ts`).
 * Same type-or-pick shape as WorkstationField / StorageCodeField.
 */
export const PrinterField = forwardRef<CodePickerFieldHandle, PrinterFieldProps>(function PrinterField(
  { value, onChange, size = 'default', width, label = 'Printer', disabled = false, onValidityChange }, ref,
) {
  const printers = usePrinters();
  const options = (printers ?? []).map((p) => {
    const type = printerTypeOf(p.code);
    return { code: p.code, desc: type ? `${p.name} · ${type}` : p.name };
  });

  return (
    <CodePickerField
      ref={ref}
      value={value}
      onChange={onChange}
      options={options}
      optionsLoading={printers === null}
      panel="keyboard"
      maxLength={4}
      transform={(v) => v.toUpperCase()}
      size={size}
      width={width}
      label={label}
      ariaLabel={label}
      disabled={disabled}
      strict
      onValidityChange={onValidityChange}
    />
  );
});
