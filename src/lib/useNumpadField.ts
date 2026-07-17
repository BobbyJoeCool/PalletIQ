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
 * @param earlyCommit - Optional predicate checked against the accumulated value after every
 *   keystroke; returning true auto-submits immediately (same as reaching `maxLength`,
 *   `explicit: false`) even though `maxLength` hasn't been reached yet — e.g. Size's field
 *   passes `(v) => ['S','M','L'].includes(v)` so a single-letter code commits right away
 *   instead of waiting for a 2nd character or a refocus-triggered Blur, while a first
 *   character that could still extend into a longer code (e.g. "X" → "XS") keeps waiting.
 *

 * onSubmit's second argument, `explicit`, is true when the value was committed by an
 * actual Enter/OK key (a scan's trailing synthetic Enter, or a synthetic Blur that had
 * something newly typed to submit — see the 'Blur' handling below), false when it was
 * committed by typing reaching `maxLength` automatically. Lets a caller distinguish "the
 * worker (or a scan) said they're done with this field" from "the field just happens to
 * be full" — e.g. CodePickerField uses it to only close the input panel on an explicit
 * confirm, not on every maxLength auto-submit while the worker might still be about to
 * retype.
 *
 * Confirm and defocus are deliberately decoupled: NumpadContext dispatches a synthetic
 * 'Blur' (not 'Enter') at whichever field is being left when focus moves to a different
 * one, or the panel closes — this only submits if the worker actually typed something
 * during that focus session (see freshFocusRef below), so tapping away from a field that
 * still holds an untouched, previously-committed value (e.g. a Pallet ID left visible
 * after a failed submission specifically so the worker can go fix another field and
 * retry) doesn't silently resubmit it.
 */
export function useNumpadField(panel: 'numpad' | 'keyboard' = 'numpad', maxLength?: number, padOnSubmit?: boolean, earlyCommit?: (value: string) => boolean) {
  const { setKeyHandler, showNumpad, showKeyboard, activeFieldId, isScanningRef } = useNumpad();
  const fieldId = useId();
  const isActive = activeFieldId === fieldId;
  const [value, setValue] = useState('');
  const valueRef = useRef('');
  const submitRef = useRef<((v: string, explicit: boolean) => void) | null>(null);
  // True immediately after focus(), until the first key event of that focus session.
  // Lets a fresh focus on a field that still holds a previous value start clean on the
  // very next keystroke, instead of appending onto stale content (issue #2) — but only
  // once the worker actually types; tapping the field and walking away leaves the old
  // value visible, matching the issue's "only if the user actually types" requirement.
  const freshFocusRef = useRef(false);
  // True for the duration of a submitRef.current(...) call (either branch below) — guards
  // against a specific reentrancy: a caller's onSubmit callback commonly calls hidePanel()
  // as its own cleanup step once it has what it needs (e.g. LocationEntryFields, once its
  // last box resolves). hidePanel() → NumpadContext's setKeyHandler(null) sees this same
  // field as still "previously active" and fires a synthetic 'Blur' at it *before it has
  // even returned from processing the original key event* — without this guard, that
  // reentrant Blur sees freshFocusRef already false (real typing happened) and resubmits
  // the exact same value a second time, calling onSubmit (and whatever it does — e.g. an
  // API request) twice for one worker action. Distinct from freshFocusRef: this guards a
  // field against re-entering *itself* mid-submit, not against a stale untouched value.
  const submittingRef = useRef(false);

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
    } else if (key === 'Enter' || key === 'OK' || key === 'Blur') {
      // 'Blur' is the synthetic event NumpadContext dispatches at the field being left
      // when focus moves elsewhere (or the panel closes) — decoupled from an actual
      // Enter/OK press so defocusing doesn't always imply confirming. It only counts as
      // a confirm if the worker typed something during *this* focus session
      // (freshFocusRef already false) and this field isn't already mid-submit
      // (submittingRef already false — see its own comment); if the field was merely
      // refocused and left untouched — e.g. a stale value intentionally kept after a
      // failed submission so a retry doesn't require retyping it — a Blur does nothing,
      // leaving the value as-is for later. A real Enter/OK press always submits
      // regardless, so explicitly confirming an untouched/prefilled value on purpose
      // still works.
      if (key === 'Blur' && (freshFocusRef.current || submittingRef.current)) return;
      freshFocusRef.current = false;
      const v = valueRef.current;
      const padded = padOnSubmit && maxLength != null && v.length > 0 && v.length < maxLength
        ? v.padStart(maxLength, '0')
        : v;
      if (padded !== v) {
        valueRef.current = padded;
        setValue(padded);
      }
      submittingRef.current = true;
      try {
        submitRef.current?.(padded, true);
      } finally {
        submittingRef.current = false;
      }
    } else if (key.length === 1) {
      const base = freshFocusRef.current ? '' : valueRef.current;
      freshFocusRef.current = false;
      const next = base + key;
      valueRef.current = next;
      setValue(next);
      const reachedMaxLength = maxLength != null && next.length >= maxLength;
      if ((reachedMaxLength || earlyCommit?.(next)) && !isScanningRef.current) {
        submittingRef.current = true;
        try {
          submitRef.current?.(next, false);
        } finally {
          submittingRef.current = false;
        }
      }
    }
  }, [maxLength, padOnSubmit, earlyCommit, isScanningRef]);

  /** Registers this field as the active numpad/keyboard target and opens the matching panel. */
  const focus = useCallback(
    (onSubmit: (v: string, explicit: boolean) => void) => {
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
