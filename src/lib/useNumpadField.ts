import { useCallback, useId, useRef, useState } from 'react';
import { useNumpad } from '../context/NumpadContext';

/**
 * Manages a single numpad-driven input field. The handler accumulates characters
 * from numpad/keyboard/scanner keystrokes. Call `focus(onSubmit)` when the field
 * becomes active to register the handler and open the numpad.
 */
export function useNumpadField(panel: 'numpad' | 'keyboard' = 'numpad') {
  const { setKeyHandler, showNumpad, showKeyboard, activeFieldId } = useNumpad();
  const fieldId = useId();
  const isActive = activeFieldId === fieldId;
  const [value, setValue] = useState('');
  const valueRef = useRef('');
  const submitRef = useRef<((v: string) => void) | null>(null);

  const handler = useCallback((key: string) => {
    if (key === '⌫' || key === 'Backspace') {
      const next = valueRef.current.slice(0, -1);
      valueRef.current = next;
      setValue(next);
    } else if (key === 'CLEAR') {
      valueRef.current = '';
      setValue('');
    } else if (key === 'Enter' || key === 'OK') {
      submitRef.current?.(valueRef.current);
    } else if (key.length === 1) {
      const next = valueRef.current + key;
      valueRef.current = next;
      setValue(next);
    }
  }, []);

  const focus = useCallback(
    (onSubmit: (v: string) => void) => {
      submitRef.current = onSubmit;
      setKeyHandler(handler, fieldId);
      if (panel === 'keyboard') showKeyboard();
      else showNumpad();
    },
    // fieldId from useId() is stable for the lifetime of this hook instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handler, panel, setKeyHandler, showNumpad, showKeyboard],
  );

  const clear = useCallback(() => {
    valueRef.current = '';
    setValue('');
  }, []);

  const set = useCallback((v: string) => {
    valueRef.current = v;
    setValue(v);
  }, []);

  return { value, focus, clear, set, isActive };
}
