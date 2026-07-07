import { createContext, useCallback, useContext, useRef, useState } from 'react';

type InputPanel = 'numpad' | 'keyboard' | 'none';

interface NumpadContextValue {
  activePanel: InputPanel;
  activeFieldId: string | null;
  showNumpad: () => void;
  showKeyboard: () => void;
  hidePanel: () => void;
  setKeyHandler: (handler: ((key: string) => void) | null, fieldId?: string | null) => void;
  handleKey: (key: string) => void;
  deliverScan: (value: string) => void;
  /** True while deliverScan is injecting a scanned value character-by-character. Lets
   *  useNumpadField's maxLength auto-advance ignore keystrokes from a scan-in-progress,
   *  so a longer scanner override (e.g. a full 8-digit barcode into a 3-digit Aisle field)
   *  isn't cut short by a shorter field's auto-submit before the whole value lands. */
  isScanningRef: React.RefObject<boolean>;
}

const NumpadContext = createContext<NumpadContextValue | null>(null);

/**
 * Manages the shared on-screen input panel (numpad or keyboard) and routes key events
 * to whichever field currently has focus. Input fields do not interact with key events
 * directly — each field registers a handler via setKeyHandler, and this context
 * dispatches every key press (panel tap, keyboard press, or scanner delivery) to that handler.
 *
 * Only one field is active at a time; calling setKeyHandler replaces any prior handler.
 * The activeFieldId tracks which field holds logical focus so field components can show
 * a visual active state.
 */
export function NumpadProvider({ children }: { children: React.ReactNode }) {
  const [activePanel, setActivePanel] = useState<InputPanel>('none');
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const keyHandlerRef = useRef<((key: string) => void) | null>(null);
  // Mirrors activeFieldId synchronously — setKeyHandler needs to read "who was active a
  // moment ago" mid-call (see the auto-submit block below), and a state variable read through
  // a useCallback closure would be stale for that purpose.
  const activeFieldIdRef = useRef<string | null>(null);
  const isScanningRef = useRef(false);

  /** Opens the numeric numpad panel. */
  const showNumpad = useCallback(() => setActivePanel('numpad'), []);
  /** Opens the full QWERTY keyboard panel. */
  const showKeyboard = useCallback(() => setActivePanel('keyboard'), []);

  /**
   * Registers a key handler for the currently focused field and sets the active field ID.
   * Pass null to clear the active handler and close whichever panel is open — "no field is
   * focused" and "no panel is showing" are kept as one atomic state so a page can't leave a
   * field's highlight stuck on after the panel closes (or vice versa) by only clearing one
   * of the two. Individual screens' own hidePanel() calls rely on this: they mean "we're done
   * with input here," which should always also drop the stale active-field highlight.
   *
   * Before installing the new field, if a *different* field was previously active, its handler
   * is sent a synthetic 'Enter' — moving focus to another field (tab-out/click-away) commits
   * whatever the field you're leaving currently holds, the same as pressing OK on it (bug
   * report V1.0.5, "Tab-out/blur on filled field should trigger OK action"). This must run
   * before keyHandlerRef/activeFieldIdRef are overwritten with the new field: the old field's
   * own submit callback typically calls hidePanel() (a reentrant setKeyHandler(null, null)
   * call), and running it first means that reentrant clear happens before — not after — the
   * new field's registration, so the new field ends up active rather than clobbered back to
   * none. The reentrant call is harmless: its own fieldId is null, which fails the `fieldId
   * != null` guard, so it can't recurse into another auto-submit.
   *
   * @param handler - Function that receives individual key strings ('0'–'9', '⌫', 'Enter', 'OK', etc.)
   * @param fieldId - Stable ID for the field (from useId); used to track which field is active
   */
  const setKeyHandler = useCallback((handler: ((key: string) => void) | null, fieldId: string | null = null) => {
    const prevHandler = keyHandlerRef.current;
    const prevFieldId = activeFieldIdRef.current;
    if (fieldId != null && prevFieldId != null && prevFieldId !== fieldId && prevHandler) {
      prevHandler('Enter');
    }

    keyHandlerRef.current = handler;
    activeFieldIdRef.current = fieldId;
    setActiveFieldId(fieldId);
    if (handler == null) setActivePanel('none');
  }, []);

  /** Closes whichever input panel is currently open and clears the active field/handler. */
  const hidePanel = useCallback(() => setKeyHandler(null), [setKeyHandler]);

  /**
   * Dispatches a single key string to the active field handler.
   * Called by Numpad and Keyboard components on each button tap.
   *
   * @param key - Key string to dispatch (digit, '⌫', 'OK', 'Enter', 'CLEAR', or space)
   */
  const handleKey = useCallback((key: string) => {
    keyHandlerRef.current?.(key);
  }, []);

  /**
   * Injects a complete scanned value into the active field as if the user typed it key by key.
   * Clears the field first, then fires each character, then fires Enter to submit.
   * This matches how a physical barcode scanner emits keys in rapid succession.
   * Used both by the hardware scanner detection in AppShell and by demo buttons.
   *
   * @param value - The complete string to inject (e.g. a label ID, pallet ID, or location barcode)
   */
  const deliverScan = useCallback((value: string) => {
    const handler = keyHandlerRef.current;
    if (!handler) return;
    isScanningRef.current = true;
    handler('CLEAR');
    for (const ch of value) handler(ch);
    isScanningRef.current = false;
    handler('Enter');
  }, []);

  return (
    <NumpadContext.Provider value={{ activePanel, activeFieldId, showNumpad, showKeyboard, hidePanel, setKeyHandler, handleKey, deliverScan, isScanningRef }}>
      {children}
    </NumpadContext.Provider>
  );
}

/**
 * Hook that returns the numpad context value.
 * Must be called inside a NumpadProvider; throws if used outside.
 */
export function useNumpad(): NumpadContextValue {
  const ctx = useContext(NumpadContext);
  if (!ctx) throw new Error('useNumpad must be used inside NumpadProvider');
  return ctx;
}
