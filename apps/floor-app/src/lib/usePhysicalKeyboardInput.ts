import { useEffect, useRef } from 'react';
import { useNumpad } from '../context/NumpadContext';
import { toControlKey, toFieldCharacter } from './physicalKey';

/**
 * Characters arriving within this many ms of each other are held together: a scanner
 * fires them in under 20 ms, a person typing leaves well over 50 ms between keys. Same
 * threshold AppShell uses for its tablet-side scanner detection.
 */
const SCAN_GAP_MS = 50;

/**
 * Routes a physical keyboard into the active numpad/keyboard field — the embedded
 * (desktop) replacement for tapping the on-screen panels, which are not rendered there.
 * Installs a window `keydown` listener while `enabled`; does nothing otherwise.
 *
 * Typed characters are held for {@link SCAN_GAP_MS} and then dispatched one by one, which
 * is imperceptible while typing but lets a USB scanner's burst be recognised: if Enter
 * arrives while two or more characters are still held, the burst is delivered whole via
 * `deliverScan`, exactly as a scan is on the tablet (so a field's max-length auto-submit
 * cannot cut a scan short).
 *
 * Keys are only taken over while a field is active, so buttons keep their normal
 * keyboard behaviour otherwise. Tab / Shift+Tab always move along the field sequence.
 * Shortcuts using Ctrl/Cmd/Alt are left alone.
 *
 * @param enabled - whether physical keyboard routing is on (embedded, and no overlay
 *   that takes its own keyboard input is open)
 */
export function usePhysicalKeyboardInput(enabled: boolean): void {
  const { activePanel, activeFieldId, handleKey, deliverScan, hidePanel } = useNumpad();

  // The listener reads the latest panel/field without being re-attached on every change.
  const panelRef = useRef(activePanel);
  const fieldIdRef = useRef(activeFieldId);
  useEffect(() => {
    panelRef.current = activePanel;
    fieldIdRef.current = activeFieldId;
  }, [activePanel, activeFieldId]);

  useEffect(() => {
    if (!enabled) return;

    let held = '';
    let timer: ReturnType<typeof setTimeout> | undefined;

    /** Dispatches every held character to the active field, dropping ones it can't take. */
    function flushHeld() {
      clearTimeout(timer);
      const chars = held;
      held = '';
      for (const ch of chars) {
        const key = toFieldCharacter(ch, panelRef.current);
        if (key) handleKey(key);
      }
    }

    /**
     * Takes a key away from the browser: no default action, and no focused button left
     * behind to be "clicked" by Enter/Space (field boxes are buttons, and clicking one
     * leaves it focused).
     */
    function claim(e: KeyboardEvent) {
      e.preventDefault();
      if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'Tab') {
        claim(e);
        flushHeld();
        handleKey(e.shiftKey ? 'Back Tab' : 'Tab');
        return;
      }

      if (fieldIdRef.current == null) return;

      if (e.key.length === 1) {
        claim(e);
        held += e.key;
        clearTimeout(timer);
        timer = setTimeout(flushHeld, SCAN_GAP_MS);
        return;
      }

      const control = toControlKey(e.key);
      if (!control) return;
      claim(e);

      if (control === 'Enter' && held.length > 1) {
        // A burst still held when Enter lands is a scan — deliver it whole.
        clearTimeout(timer);
        const scanned = held;
        held = '';
        deliverScan(scanned);
        return;
      }

      flushHeld();
      if (control === 'Escape') hidePanel();
      else handleKey(control);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(timer);
    };
  }, [enabled, handleKey, deliverScan, hidePanel]);
}
