import { useRef, useState } from 'react';

/**
 * Small digit-string input state (append/backspace, capped at `maxLength`) — the pressDigit/
 * backspace mechanics shared identically by MNP's `LevelModal` and PIP's
 * `LevelCorrectionDialog` before this extraction (Refactoring Audit finding F4). Each
 * dialog still owns its own confirm/cancel logic and validation; this only owns the raw
 * typed-digits state.
 *
 * A non-empty `initialValue` (MNP's own pre-filled level hint — see `LevelModal`'s doc
 * comment) is treated as "fresh" until the first digit is pressed, mirroring
 * `useNumpadField`'s own `freshFocusRef` convention: that first press *replaces* the
 * pre-filled value rather than appending to it, so a worker correcting a pre-filled level
 * (e.g. "4" pre-filled, worker actually placed it on level 1) doesn't silently end up
 * submitting a concatenated, wrong value ("41") instead. A backspace on an untouched
 * pre-fill also clears the "fresh" flag (the worker has already started editing the
 * pre-filled value at that point, so a following digit should append normally, same as
 * any other partially-typed value) — it does not itself get replaced-vs-appended
 * treatment, since removing a character is unambiguous either way.
 */
export function useDigitInput(initialValue = '', maxLength = 2) {
  const [input, setInput] = useState(initialValue);
  const freshRef = useRef(initialValue !== '');

  function pressDigit(d: string) {
    setInput((v) => {
      const base = freshRef.current ? '' : v;
      freshRef.current = false;
      return base.length >= maxLength ? base : base + d;
    });
  }

  function backspace() {
    freshRef.current = false;
    setInput((v) => v.slice(0, -1));
  }

  function reset() {
    freshRef.current = false;
    setInput('');
  }

  return { input, pressDigit, backspace, reset };
}
