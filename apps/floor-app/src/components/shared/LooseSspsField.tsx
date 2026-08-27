import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { MessageBarState } from '../../context/MessageBarContext';
import { useNumpadField } from '../../lib/useNumpadField';
import { checkSspCap } from '../../lib/vcpSspValidation';
import { NumpadFieldBox } from './NumpadFieldBox';

export interface LooseSspsFieldHandle {
  fieldId: string;
  focus: () => void;
  set: (value: string) => void;
  clear: () => void;
  /** Mark the field as invalid from an external source (server-side validation). */
  markInvalid: () => void;
}

export interface LooseSspsFieldProps {
  sspPerCarton: number | null;
  /** Called after the field is confirmed; receives the trimmed value. */
  onConfirm?: (value: string) => void;
  /** Called whenever the field's value or invalid state changes (on confirm/set/clear). */
  onChange?: (state: { value: string; invalid: boolean }) => void;
  setMessage: (msg: MessageBarState) => void;
  playAlert?: (type: 'error' | 'warning') => void;
  label?: string;
  width?: string;
  boxClass?: string;
  valueClass?: string;
  caretClass?: string;
  centered?: boolean;
}

export const LooseSspsField = forwardRef<LooseSspsFieldHandle, LooseSspsFieldProps>(function LooseSspsField({
  sspPerCarton,
  onConfirm,
  onChange,
  setMessage,
  playAlert: playAlertFn,
  label,
  width = 'w-[144px]',
  boxClass = 'h-[54px] px-4 rounded-[10px]',
  valueClass = 'text-[20px] font-medium',
  caretClass = 'w-[2px] h-[20px]',
  centered = false,
}, ref) {
  const field = useNumpadField();
  const [invalid, setInvalid] = useState(false);

  const sspPerCartonRef = useRef(sspPerCarton);
  const onConfirmRef = useRef(onConfirm);
  const onChangeRef = useRef(onChange);
  useEffect(() => { sspPerCartonRef.current = sspPerCarton; });
  useEffect(() => { onConfirmRef.current = onConfirm; });
  useEffect(() => { onChangeRef.current = onChange; });

  function handleConfirm(value: string) {
    const v = value.trim();
    field.set(v);
    const spc = sspPerCartonRef.current;
    const bad = checkSspCap(spc, v);
    setInvalid(bad);
    if (bad) {
      setMessage({ type: 'error', text: `SSPs must be less than a full carton (${spc} per carton)` });
      playAlertFn?.('warning');
    }
    onChangeRef.current?.({ value: v, invalid: bad });
    onConfirmRef.current?.(v);
  }

  function focusField() { field.focus(handleConfirm); }

  useImperativeHandle(ref, () => ({
    fieldId: field.fieldId,
    focus: focusField,
    set(value: string) {
      field.set(value);
      const bad = checkSspCap(sspPerCartonRef.current, value);
      setInvalid(bad);
      onChangeRef.current?.({ value, invalid: bad });
    },
    clear() {
      field.clear();
      setInvalid(false);
      onChangeRef.current?.({ value: '', invalid: false });
    },
    markInvalid() {
      setInvalid(true);
      onChangeRef.current?.({ value: field.value, invalid: true });
    },
  }));

  return (
    <NumpadFieldBox
      label={label}
      value={field.value}
      onFocus={focusField}
      active={field.isActive}
      invalid={invalid}
      width={width}
      centered={centered}
      boxClass={boxClass}
      valueClass={valueClass}
      caretClass={caretClass}
    />
  );
});
