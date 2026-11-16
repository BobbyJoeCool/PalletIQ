import { createContext, useContext, useReducer, type Dispatch } from 'react';
import { putSessionReducer, type PutSessionAction, type PutSessionState } from '../lib/putSessionState';

interface SDPContextValue {
  session: PutSessionState;
  dispatch: Dispatch<PutSessionAction>;
}

const SDPContext = createContext<SDPContextValue | null>(null);

/**
 * Session-level store for SDP's put session (App-Wide screen-persistence item, v1.7.0) —
 * mounted once inside the authenticated route tree (see App.tsx) so navigating away from
 * SDP and back restores the in-progress put instead of resetting. The reservation itself
 * still expires server-side after 5 minutes (15 when consolidating); SDPPage's polling and
 * the 404 a confirm/unassign gets back cover a resumed-but-expired session. Clears on
 * logout, since ProtectedRoute unmounts this provider with the authenticated tree.
 */
export function SDPProvider({ children }: { children: React.ReactNode }) {
  const [session, dispatch] = useReducer(putSessionReducer, { phase: 'entry' });
  return <SDPContext.Provider value={{ session, dispatch }}>{children}</SDPContext.Provider>;
}

/** The SDP put session store. Must be called inside SDPProvider. */
export function useSDP(): SDPContextValue {
  const ctx = useContext(SDPContext);
  if (!ctx) throw new Error('useSDP must be used inside SDPProvider');
  return ctx;
}
