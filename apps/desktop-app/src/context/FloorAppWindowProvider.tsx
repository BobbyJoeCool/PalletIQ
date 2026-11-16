import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { FloorAppWindowContext } from './floorAppWindowContext';
import type { FloorAppWindowState } from './floorAppWindowContext';

/**
 * Holds the Embedded Floor App window's open/hidden state (#141) so the header toggle
 * and the window itself, which sit in different parts of the shell, share it. The state
 * is in memory only: it lasts as long as the signed-in shell does.
 */
export function FloorAppWindowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FloorAppWindowState>('unopened');

  const show = useCallback(() => setState('visible'), []);
  // Hiding something never opened would mount the floor app for nothing — stay unopened.
  const hide = useCallback(
    () => setState((current) => (current === 'unopened' ? current : 'hidden')),
    []
  );

  const value = useMemo(() => ({ state, show, hide }), [state, show, hide]);

  return <FloorAppWindowContext.Provider value={value}>{children}</FloorAppWindowContext.Provider>;
}
