import { INVALID_WASH } from '../../lib/invalidWash';
import type { useDpciFields } from '../../lib/useDpciFields';
import { NumpadFieldBox, type NumpadFieldBoxSize } from './NumpadFieldBox';

/**
 * The three-box DPCI entry (Dept – Class – Item) (#216). `useDpciFields` owns the state
 * and lookup; this component owns the rendering — the three boxes, their separators,
 * focus wiring, and the whole-group invalid wash. Replaces four hand-built copies (IID and
 * ISI rendered raw buttons that the Tab sequence couldn't see; PAR and PII re-wired the
 * hook onto their own box wrappers).
 */
export function DpciEntry({
  fields, widths, size, boxClass, valueClass, caretClass, centered, gapClass = 'gap-2', separatorClass = 'text-[#555]',
}: {
  fields: ReturnType<typeof useDpciFields>;
  /** Width classes for the Dept, Class and Item boxes. */
  widths: [string, string, string];
  size?: NumpadFieldBoxSize;
  boxClass?: string;
  valueClass?: string;
  caretClass?: string;
  centered?: boolean;
  gapClass?: string;
  separatorClass?: string;
}) {
  const box = { size, boxClass, valueClass, caretClass, centered };
  return (
    <div className={`flex items-center ${gapClass} rounded-[10px] ${fields.dpciInvalid ? `${INVALID_WASH} border-2 p-1` : ''}`}>
      <NumpadFieldBox {...box} ariaLabel="Dept" value={fields.deptField.value} onFocus={fields.focusDeptField} active={fields.deptField.isActive} width={widths[0]} />
      <span className={separatorClass}>-</span>
      <NumpadFieldBox {...box} ariaLabel="Class" value={fields.classField.value} onFocus={fields.focusClassField} active={fields.classField.isActive} width={widths[1]} />
      <span className={separatorClass}>-</span>
      <NumpadFieldBox {...box} ariaLabel="Item" value={fields.itemField.value} onFocus={fields.focusItemField} active={fields.itemField.isActive} width={widths[2]} />
    </div>
  );
}
