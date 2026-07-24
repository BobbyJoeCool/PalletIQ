import { useState } from 'react';

/**
 * Small digit-string input state (append/backspace, capped at `maxLength`) — the pressDigit/
 * backspace mechanics shared identically by MNP's `LevelModal` and PIP's
 * `LevelCorrectionDialog` before this extraction (Refactoring Audit finding F4). Each
 * dialog still owns its own confirm/cancel logic and validation; this only owns the raw
 * typed-digits state.
 */
export function useDigitInput(initialValue = '', maxLength = 2) {
  const [input, setInput] = useState(initialValue);

  function pressDigit(d: string) {
    setInput((v) => (v.length >= maxLength ? v : v + d));
  }

  function backspace() {
    setInput((v) => v.slice(0, -1));
  }

  function reset() {
    setInput('');
  }

  return { input, pressDigit, backspace, reset };
}
