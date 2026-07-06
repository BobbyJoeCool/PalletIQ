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

  /** Opens the numeric numpad panel. */
  const showNumpad = useCallback(() => setActivePanel('numpad'), []);
  /** Opens the full QWERTY keyboard panel. */
  const showKeyboard = useCallback(() => setActivePanel('keyboard'), []);
  /** Closes whichever input panel is currently open. */
  const hidePanel = useCallback(() => setActivePanel('none'), []);

  /**
   * Registers a key handler for the currently focused field and sets the active field ID.
   * Pass null to clear the active handler (e.g. when navigating away from a screen).
   *
   * @param handler - Function that receives individual key strings ('0'–'9', '⌫', 'Enter', 'OK', etc.)
   * @param fieldId - Stable ID for the field (from useId); used to track which field is active
   */
  const setKeyHandler = useCallback((handler: ((key: string) => void) | null, fieldId: string | null = null) => {
    keyHandlerRef.current = handler;
    setActiveFieldId(fieldId);
  }, []);

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
    handler('CLEAR');
    for (const ch of value) handler(ch);
    handler('Enter');
  }, []);

  return (
    <NumpadContext.Provider value={{ activePanel, activeFieldId, showNumpad, showKeyboard, hidePanel, setKeyHandler, handleKey, deliverScan }}>
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
