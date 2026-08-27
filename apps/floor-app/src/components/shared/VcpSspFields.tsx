import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { MessageBarState } from '../../context/MessageBarContext';
import { INVALID_WASH } from '../../lib/invalidWash';
import { useNumpadField } from '../../lib/useNumpadField';
import { checkVcpSspRatio } from '../../lib/vcpSspValidation';
import { NumpadFieldBox } from './NumpadFieldBox';

export interface VcpSspFieldsHandle {
  vcpFieldId: string;
  sspFieldId: string;
  focusVcp: () => void;
  focusSsp: () => void;
  /** Set both field values externally (PII edit-mode initialization). */
  set: (vcp: string, ssp: string) => void;
  /** Mark the pair as invalid from an external source (server-side validation). */
  markInvalid: () => void;
}

export interface VcpSspFieldsProps {
  /** Called after SSP is confirmed; receives the current sspPerCarton. */
  onSspConfirm?: (sspPerCarton: number | null) => void;
  /** Called whenever either field's value changes (on confirm). Lifts reactive
   *  state to the parent for downstream consumers (e.g. loose-SSP cap checks,
   *  submit bodies). */
  onChange?: (state: { vcpValue: string; sspValue: string; sspPerCarton: number | null; invalid: boolean }) => void;
  /** Status bar message setter. */
  setMessage: (msg: MessageBarState) => void;
  /** Optional alert sound on validation failure. */
  playAlert?: (type: 'error' | 'warning') => void;
  /** NumpadFieldBox box dimension class (height/padding/radius). */
  boxClass?: string;
  /** NumpadFieldBox value text class. */
  valueClass?: string;
  /** NumpadFieldBox caret dimension class. */
  caretClass?: string;
  /** Center value/caret within the box. */
  centered?: boolean;
  /** Label above VCP box; omit for no label. */
  vcpLabel?: string;
  /** Label above SSP box; omit for no label. */
  sspLabel?: string;
  /** Width class for VCP box. */
  vcpWidth?: string;
  /** Width class for SSP box. */
  sspWidth?: string;
  /** Content between VCP and SSP boxes (e.g. a "/" separator). */
  separator?: React.ReactNode;
  /** Flex classes for the group-wash wrapper div. */
  wrapperClass?: string;
}

export const VcpSspFields = forwardRef<VcpSspFieldsHandle, VcpSspFieldsProps>(function VcpSspFields({
  onSspConfirm,
  onChange,
  setMessage,
  playAlert: playAlertFn,
  boxClass = 'h-[54px] px-4 rounded-[10px]',
  valueClass = 'text-[20px] font-medium',
  caretClass = 'w-[2px] h-[20px]',
  centered = false,
  vcpLabel,
  sspLabel,
  vcpWidth = 'w-[126px]',
  sspWidth = 'w-[126px]',
  separator,
  wrapperClass = 'flex items-end gap-4',
}, ref) {
  const vcpField = useNumpadField();
  const sspField = useNumpadField();
  const [invalid, setInvalid] = useState(false);

  const vcpValueRef = useRef('');
  const sspValueRef = useRef('');
  const onSspConfirmRef = useRef(onSspConfirm);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onSspConfirmRef.current = onSspConfirm; });
  useEffect(() => { onChangeRef.current = onChange; });

  const runCheck = useCallback((vcp: string, ssp: string) => {
    const { ratioInvalid, sspPerCarton } = checkVcpSspRatio(vcp, ssp);
    setInvalid(ratioInvalid);
    if (ratioInvalid) {
      setMessage({ type: 'error', text: 'SSP must divide evenly into VCP' });
      playAlertFn?.('warning');
    }
    onChangeRef.current?.({ vcpValue: vcp, sspValue: ssp, sspPerCarton, invalid: ratioInvalid });
    return sspPerCarton;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMessage]);

  function handleVcpConfirm(value: string) {
    const v = value.trim();
    vcpField.set(v);
    vcpValueRef.current = v;
    runCheck(v, sspValueRef.current);
    setTimeout(() => focusSsp(), 50);
  }

  function handleSspConfirm(value: string) {
    const v = value.trim();
    sspField.set(v);
    sspValueRef.current = v;
    const spc = runCheck(vcpValueRef.current, v);
    onSspConfirmRef.current?.(spc);
  }

  function focusVcp() { vcpField.focus(handleVcpConfirm); }
  function focusSsp() { sspField.focus(handleSspConfirm); }

  useImperativeHandle(ref, () => ({
    vcpFieldId: vcpField.fieldId,
    sspFieldId: sspField.fieldId,
    focusVcp,
    focusSsp,
    set(vcp: string, ssp: string) {
      vcpField.set(vcp);
      sspField.set(ssp);
      vcpValueRef.current = vcp;
      sspValueRef.current = ssp;
      const { sspPerCarton, ratioInvalid } = checkVcpSspRatio(vcp, ssp);
      setInvalid(ratioInvalid);
      onChangeRef.current?.({ vcpValue: vcp, sspValue: ssp, sspPerCarton, invalid: ratioInvalid });
    },
    markInvalid() {
      setInvalid(true);
      onChangeRef.current?.({
        vcpValue: vcpValueRef.current, sspValue: sspValueRef.current,
        sspPerCarton: checkVcpSspRatio(vcpValueRef.current, sspValueRef.current).sspPerCarton,
        invalid: true,
      });
    },
  }));

  return (
    <div className={`rounded-[10px] ${invalid ? `${INVALID_WASH} border-2 p-1` : ''} ${wrapperClass}`}>
      <NumpadFieldBox
        label={vcpLabel}
        value={vcpField.value}
        onFocus={focusVcp}
        active={vcpField.isActive}
        width={vcpWidth}
        centered={centered}
        boxClass={boxClass}
        valueClass={valueClass}
        caretClass={caretClass}
      />
      {separator}
      <NumpadFieldBox
        label={sspLabel}
        value={sspField.value}
        onFocus={focusSsp}
        active={sspField.isActive}
        width={sspWidth}
        centered={centered}
        boxClass={boxClass}
        valueClass={valueClass}
        caretClass={caretClass}
      />
    </div>
  );
});
