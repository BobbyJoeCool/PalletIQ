import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useNumpadField } from '../../lib/useNumpadField';
import { useDemoSlot } from '../../context/FooterDemoContext';
import { NumpadFieldBox } from './NumpadFieldBox';
import { ContainerDemoScannerBar } from './ContainerDemoScannerBar';
import { isValidCidFormat, expandCid, type CidTypeCode } from '@shared/index';

interface ContainerIdFieldProps {
  value: string;
  onChange: (value: string) => void;
  onLookup?: (canonicalCid: string, type: CidTypeCode) => void;
  label?: string;
  disabled?: boolean;
  invalid?: boolean;
  onActiveChange?: (active: boolean) => void;
  demoScanner?: boolean;
  /** Pull function filter for the demo scanner (PIP-style). Omit for CII (accepts any). */
  demoFn?: string;
}

export interface ContainerIdFieldHandle {
  focus: () => void;
}

export const ContainerIdField = forwardRef<ContainerIdFieldHandle, ContainerIdFieldProps>(function ContainerIdField({
  value, onChange, onLookup, label = 'Container ID', disabled = false, invalid = false, onActiveChange, demoScanner = false, demoFn,
}, ref) {
  const field = useNumpadField('numpad');
  useEffect(() => { field.set(value); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onActiveChange?.(field.isActive); }, [field.isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(v: string) {
    const trimmed = v.trim();
    onChange(trimmed);
    if (trimmed && isValidCidFormat(trimmed)) {
      const canonical = expandCid(trimmed);
      if (canonical) {
        const typeCode = canonical.slice(0, 2) as CidTypeCode;
        onLookup?.(canonical, typeCode);
      }
    }
  }

  function focusField() {
    field.focus(handleSubmit);
  }

  useImperativeHandle(ref, () => ({ focus: focusField }));

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onLookupRef = useRef(onLookup);
  onLookupRef.current = onLookup;
  const fillFromDemo = useCallback((v: string) => {
    onChangeRef.current(v);
    if (isValidCidFormat(v)) {
      const canonical = expandCid(v);
      if (canonical) {
        onLookupRef.current?.(canonical, canonical.slice(0, 2) as CidTypeCode);
      }
    }
  }, []);

  const demoSlot = useMemo(
    () => (demoScanner && field.isActive
      ? <ContainerDemoScannerBar onFill={fillFromDemo} fn={demoFn ?? ''} />
      : null),
    [demoScanner, field.isActive, fillFromDemo, demoFn],
  );
  useDemoSlot(demoSlot);

  return (
    <NumpadFieldBox
      label={label}
      value={field.value}
      onFocus={focusField}
      active={field.isActive}
      disabled={disabled}
      invalid={invalid}
      width="w-[420px]"
      boxClass="h-[64px] px-5 rounded-[12px]"
      valueClass="text-[22px] font-medium tracking-[0.02em]"
      caretClass="w-[2px] h-[28px]"
    />
  );
});
