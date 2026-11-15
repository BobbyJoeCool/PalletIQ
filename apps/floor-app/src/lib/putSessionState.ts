// SDP put session state + reducer (#215), kept out of SDPContext.tsx so that file only
// exports React components/hooks (react-refresh).
import type { DirectPutResponse } from './putsClient';

/** Where the put is currently pointed when Exists Elsewhere has redirected it. */
export interface RedirectTarget {
  locationId: string;
  storageCode: string;
}

/**
 * SDP put session state (#215) — a reducer: entry → directed → (redirected ↔ directed) →
 * entry. The reservation stays live through a redirect; `target` only records where the
 * put will complete (null = the reserved location). Server-side rules decide whether a
 * redirected confirm is valid — this state carries no derived client-only rules.
 */
export type PutSessionState =
  | { phase: 'entry' }
  | { phase: 'directed'; put: DirectPutResponse; target: RedirectTarget | null };

export type PutSessionAction =
  | { type: 'DIRECTED'; put: DirectPutResponse }
  | { type: 'RETARGET'; target: RedirectTarget | null }
  | { type: 'RESET' };

export function putSessionReducer(state: PutSessionState, action: PutSessionAction): PutSessionState {
  switch (action.type) {
    case 'DIRECTED':
      return { phase: 'directed', put: action.put, target: null };
    case 'RETARGET':
      if (state.phase !== 'directed') return state;
      // Retargeting onto the reserved location itself is "back to original".
      return { ...state, target: action.target && action.target.locationId !== state.put.directedLocation ? action.target : null };
    case 'RESET':
      return { phase: 'entry' };
  }
}
