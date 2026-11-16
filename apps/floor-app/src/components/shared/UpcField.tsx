import { NumpadFieldBox, type NumpadFieldBoxSize } from './NumpadFieldBox';
import type { useUpcField } from '../../lib/useUpcField';

/**
 * The UPC entry box (#216). `useUpcField` owns the state and lookup; this component owns
 * the rendering — value, caret, focus and the invalid wash.
 */
export function UpcField<T>({
  fields, label, width, size, disabled, centered, boxClass, valueClass, caretClass,
}: {
  fields: ReturnType<typeof useUpcField<T>>;
  label?: string;
  width?: string;
  size?: NumpadFieldBoxSize;
  disabled?: boolean;
  centered?: boolean;
  boxClass?: string;
  valueClass?: string;
  caretClass?: string;
}) {
  return (
    <NumpadFieldBox
      value={fields.field.value}
      onFocus={fields.focusField}
      active={fields.field.isActive}
      invalid={fields.upcInvalid}
      label={label}
      width={width}
      size={size}
      disabled={disabled}
      centered={centered}
      boxClass={boxClass}
      valueClass={valueClass}
      caretClass={caretClass}
    />
  );
}
