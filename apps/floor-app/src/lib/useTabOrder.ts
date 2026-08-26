import { useEffect, useRef } from 'react';
import { useNumpad } from '../context/NumpadContext';

export interface TabSlot {
  fieldId: string;
  activate: () => void;
  enabled?: boolean;
}

/**
 * Declares the Tab/Back Tab field-navigation order for the current screen.
 * Each slot maps a useNumpadField's fieldId to an activate function (typically
 * the screen's own "focus this field" call). Slots with `enabled: false` are
 * skipped. Wraps at both ends: Tab from the last field goes to the first.
 *
 * Only one useTabOrder should be active at a time (one per screen). Mounting a
 * new screen replaces the previous one's tab handler automatically via the
 * cleanup function.
 */
export function useTabOrder(slots: TabSlot[]) {
  const { setTabHandler } = useNumpad();
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  useEffect(() => {
    setTabHandler((direction, currentFieldId) => {
      const enabled = slotsRef.current.filter(s => s.enabled !== false);
      if (enabled.length < 2) return;
      const idx = currentFieldId != null
        ? enabled.findIndex(s => s.fieldId === currentFieldId)
        : -1;
      let next: number;
      if (idx === -1) {
        next = direction === 'next' ? 0 : enabled.length - 1;
      } else if (direction === 'next') {
        next = (idx + 1) % enabled.length;
      } else {
        next = (idx - 1 + enabled.length) % enabled.length;
      }
      enabled[next].activate();
    });
    return () => setTabHandler(null);
  }, [setTabHandler]);
}
