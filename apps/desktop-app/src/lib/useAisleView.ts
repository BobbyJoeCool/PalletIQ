import { useCallback, useEffect, useState } from 'react';
import type { AisleView } from '@shared/aisleSetup';
import { useAuth } from '../context/authContext';
import { fetchAisle } from './locationSetupApi';

/** What the screen knows about the selected aisle. */
export type AisleViewState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error'; errorCode: string }
  | { status: 'ready'; view: AisleView };

/**
 * Loads the chosen aisle for Location Setup (#143) and keeps it current. Every write
 * endpoint answers with the updated aisle, so callers hand that to `replace` instead of
 * re-fetching. Each answer is stored with the aisle it belongs to, so a late answer for
 * an aisle that is no longer selected is never shown.
 *
 * @param aisle - the selected aisle number, or null for none
 * @returns the aisle state, `reload()` (fires a request) and `replace(view)`
 */
export function useAisleView(aisle: number | null): {
  state: AisleViewState;
  reload: () => void;
  replace: (view: AisleView) => void;
} {
  const { token } = useAuth();
  const [result, setResult] = useState<{ aisle: number; state: AisleViewState } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (aisle == null || !token) return;
    let cancelled = false;
    fetchAisle(token, aisle)
      .then((view) => {
        if (!cancelled) setResult({ aisle, state: { status: 'ready', view } });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setResult({
            aisle,
            state: {
              status: 'error',
              errorCode: err instanceof Error ? err.message : 'REQUEST_FAILED',
            },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [aisle, token, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const replace = useCallback(
    (view: AisleView) => setResult({ aisle: view.aisle, state: { status: 'ready', view } }),
    []
  );

  const state: AisleViewState =
    aisle == null
      ? { status: 'none' }
      : result?.aisle === aisle
        ? result.state
        : { status: 'loading' };

  return { state, reload, replace };
}
