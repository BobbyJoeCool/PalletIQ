/**
 * Translation from a physical keyboard's key names to the key strings the on-screen
 * Numpad/Keyboard panels dispatch (see NumpadContext's handleKey). Used only when the
 * floor app runs embedded in the desktop app (#141), where the on-screen panels are not
 * rendered and a real keyboard is the input method. Pure — no DOM, no state.
 */

/** Which on-screen panel the active field would have opened. */
export type FieldPanel = 'numpad' | 'keyboard' | 'none';

/** Non-character keys the embedded floor app responds to. */
export type PhysicalControlKey = 'Enter' | '⌫' | 'CLEAR' | 'Escape';

/**
 * Maps a typed character to what the active field's own on-screen panel could have
 * produced, so a physical keyboard can never enter something the tablet could not: a
 * numpad field takes digits only; a keyboard field takes digits and letters, upper-cased
 * (the on-screen keyboard has no lower case).
 *
 * @param char - a single character from `KeyboardEvent.key`
 * @param panel - the panel belonging to the currently active field
 * @returns the key string to dispatch, or null if that field cannot accept the character
 */
export function toFieldCharacter(char: string, panel: FieldPanel): string | null {
  if (/^[0-9]$/.test(char)) return panel === 'none' ? null : char;
  if (panel === 'keyboard' && /^[a-zA-Z]$/.test(char)) return char.toUpperCase();
  return null;
}

/**
 * Maps a non-character key to the action it stands for: Enter confirms, Backspace
 * deletes one character, Delete clears the field, Escape leaves the field.
 *
 * @param key - `KeyboardEvent.key`
 * @returns the control key, or null if the key has no meaning here
 */
export function toControlKey(key: string): PhysicalControlKey | null {
  switch (key) {
    case 'Enter': return 'Enter';
    case 'Backspace': return '⌫';
    case 'Delete': return 'CLEAR';
    case 'Escape': return 'Escape';
    default: return null;
  }
}
