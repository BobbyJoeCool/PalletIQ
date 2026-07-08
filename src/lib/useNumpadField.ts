import { useCallback, useId, useRef, useState } from 'react';
import { useNumpad } from '../context/NumpadContext';

/**
 * Manages a single numpad-driven input field. The handler accumulates characters
 * from numpad/keyboard/scanner keystrokes. Call `focus(onSubmit)` when the field
 * becomes active to register the handler and open the numpad.
 *
 * @param panel - Which on-screen panel this field opens when focused
 * @param maxLength - When set, submits automatically the instant typed input reaches this
 *   length instead of waiting for an explicit OK/Enter — use only for fields with a genuine
 *   fixed length (e.g. a 2-digit Level), not variable-length ones (Pallet ID, free-form Aisle).
 *   Ignored while a scan is being injected (see NumpadContext's isScanningRef), so a longer
 *   scanner override value isn't cut short mid-injection by a shorter field's own maxLength.
 */
export function useNumpadField(panel: 'numpad' | 'keyboard' = 'numpad', maxLength?: number) {
  const { setKeyHandler, showNumpad, showKeyboard, activeFieldId, isScanningRef } = useNumpad();
  const fieldId = useId();
  const isActive = activeFieldId === fieldId;
  const [value, setValue] = useState('');
  const valueRef = useRef('');
  const submitRef = useRef<((v: string) => void) | null>(null);
  // True immediately after focus(), until the first key event of that focus session.
  // Lets a fresh focus on a field that still holds a previous value start clean on the
  // very next keystroke, instead of appending onto stale content (issue #2) — but only
  // once the worker actually types; tapping the field and walking away leaves the old
  // value visible, matching the issue's "only if the user actually types" requirement.
  const freshFocusRef = useRef(false);

  /** Applies a single key event to the accumulated value: backspace, clear, submit, or append. */
  const handler = useCallback((key: string) => {
    if (key === '⌫' || key === 'Backspace') {
      freshFocusRef.current = false;
      const next = valueRef.current.slice(0, -1);
      valueRef.current = next;
      setValue(next);
    } else if (key === 'CLEAR') {
      freshFocusRef.current = false;
      valueRef.current = '';
      setValue('');
    } else if (key === 'Enter' || key === 'OK') {
      freshFocusRef.current = false;
      submitRef.current?.(valueRef.current);
    } else if (key.length === 1) {
      const base = freshFocusRef.current ? '' : valueRef.current;
      freshFocusRef.current = false;
      const next = base + key;
      valueRef.current = next;
      setValue(next);
      if (maxLength != null && next.length >= maxLength && !isScanningRef.current) {
        submitRef.current?.(next);
      }
    }
  }, [maxLength, isScanningRef]);

  /** Registers this field as the active numpad/keyboard target and opens the matching panel. */
  const focus = useCallback(
    (onSubmit: (v: string) => void) => {
      freshFocusRef.current = true;
      submitRef.current = onSubmit;
      setKeyHandler(handler, fieldId);
      if (panel === 'keyboard') showKeyboard();
      else showNumpad();
    },
    // fieldId from useId() is stable for the lifetime of this hook instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handler, panel, setKeyHandler, showNumpad, showKeyboard],
  );

  /** Resets the field's value to empty. */
  const clear = useCallback(() => {
    valueRef.current = '';
    setValue('');
  }, []);

  /** Sets the field's value directly, bypassing key-by-key input (e.g. for pre-population). */
  const set = useCallback((v: string) => {
    valueRef.current = v;
    setValue(v);
  }, []);

  return { value, focus, clear, set, isActive };
}
