import { createContext, useContext } from 'react';

/**
 * Where the Embedded Floor App window (#141) is in its life:
 *   - `unopened` — never opened this session; the floor app has not been loaded at all.
 *   - `visible`  — open and on screen.
 *   - `hidden`   — minimized or closed. The floor app keeps running out of sight, which
 *     is what lets it be restored exactly where it was left.
 */
export type FloorAppWindowState = 'unopened' | 'visible' | 'hidden';

export interface FloorAppWindowContextValue {
  state: FloorAppWindowState;
  /** Opens the window, or brings it back if hidden. */
  show: () => void;
  /** Takes the window off screen without ending the floor app (minimize and close both). */
  hide: () => void;
}

/** Context object only — the provider component lives in FloorAppWindowProvider.tsx. */
export const FloorAppWindowContext = createContext<FloorAppWindowContextValue | null>(null);

/** Hook returning the Floor App window's state and controls; requires the provider. */
export function useFloorAppWindow(): FloorAppWindowContextValue {
  const ctx = useContext(FloorAppWindowContext);
  if (!ctx) throw new Error('useFloorAppWindow must be used inside FloorAppWindowProvider');
  return ctx;
}
