import { NumpadFieldBox, type NumpadFieldBoxSize } from './NumpadFieldBox';
import type { useAisleField } from '../../lib/useAisleField';

/**
 * The Aisle entry box (#216). `useAisleField` owns the state and the aisle-exists lookup;
 * this component owns the rendering — value, caret, focus and the invalid wash — so a page
 * passes only layout props instead of re-wiring the hook's fields onto a NumpadFieldBox.
 */
export function AisleField({
  fields, label, width, size, disabled, centered, labelClass, boxClass, valueClass, caretClass,
}: {
  fields: ReturnType<typeof useAisleField>;
  label?: string;
  width?: string;
  size?: NumpadFieldBoxSize;
  disabled?: boolean;
  centered?: boolean;
  labelClass?: string;
  boxClass?: string;
  valueClass?: string;
  caretClass?: string;
}) {
  return (
    <NumpadFieldBox
      value={fields.field.value}
      onFocus={fields.focusField}
      active={fields.field.isActive}
      invalid={fields.invalid}
      label={label}
      width={width}
      size={size}
      disabled={disabled}
      centered={centered}
      labelClass={labelClass}
      boxClass={boxClass}
      valueClass={valueClass}
      caretClass={caretClass}
    />
  );
}
