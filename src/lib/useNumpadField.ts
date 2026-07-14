import { useCallback, useId, useMemo, useRef, useState } from 'react';
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
 * @param padOnSubmit - When true (and maxLength is set), an explicit OK/Enter submit with
 *   fewer digits than maxLength is left-zero-padded to maxLength before being passed to
 *   onSubmit — e.g. typing "80" and pressing OK on a 3-digit Bin box submits "080". Only
 *   applies to an explicit confirm (auto-submit at maxLength is already full-length by
 *   definition); use for fixed-width numeric codes (Aisle/Bin/Level) where a worker
 *   shouldn't have to type leading zeros, not for fields where a short value has its own
 *   distinct meaning.
 */
export function useNumpadField(panel: 'numpad' | 'keyboard' = 'numpad', maxLength?: number, padOnSubmit?: boolean) {
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
      const v = valueRef.current;
      const padded = padOnSubmit && maxLength != null && v.length > 0 && v.length < maxLength
        ? v.padStart(maxLength, '0')
        : v;
      if (padded !== v) {
        valueRef.current = padded;
        setValue(padded);
      }
      submitRef.current?.(padded);
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
  }, [maxLength, padOnSubmit, isScanningRef]);

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

  // Memoized so consumers that depend on the whole returned object (e.g. a useCallback
  // with `[fieldObject]` in its deps, rather than `[fieldObject.focus]`) get a stable
  // reference across renders where nothing actually changed — without this, every render
  // produces a new object literal, making any such callback (and anything memoized off
  // it, like a demo-button JSX slot) recompute every render, which can cascade into a
  // render loop if that recomputed value flows back into shared state (see PIP's
  // pre-existing "Maximum update depth exceeded" bug, root-caused to exactly this).
  return useMemo(
    () => ({ value, focus, clear, set, isActive }),
    [value, focus, clear, set, isActive],
  );
}
