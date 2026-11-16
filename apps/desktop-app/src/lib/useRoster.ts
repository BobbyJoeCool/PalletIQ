import { useCallback, useEffect, useState } from 'react';
import type { RosterView, Segment, ShiftCode } from '@shared/workforce';
import { useAuth } from '../context/authContext';
import { fetchRoster, saveRoster } from './rosterApi';

/** What the screen knows about the selected date and shift. */
export type RosterState =
  | { status: 'loading' }
  | { status: 'error'; errorCode: string }
  | { status: 'ready'; view: RosterView };

/**
 * Loads the roster for a date and (optionally) a shift (#145), and saves timelines.
 * Answers are stored with the request they belong to, so a late answer for a date or
 * shift no longer selected is never shown. `save` sends a request and, on success, shows
 * the roster the server returns; it rethrows on failure for the caller to report.
 *
 * @param date - "YYYY-MM-DD"
 * @param shift - a shift code, or null for the viewer's default shift
 */
export function useRoster(date: string, shift: ShiftCode | null) {
  const { token } = useAuth();
  const key = `${date}|${shift ?? ''}`;
  const [result, setResult] = useState<{ key: string; state: RosterState } | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchRoster(token, date, shift)
      .then((view) => {
        if (!cancelled) setResult({ key, state: { status: 'ready', view } });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setResult({
            key,
            state: {
              status: 'error',
              errorCode: err instanceof Error ? err.message : 'REQUEST_FAILED',
            },
          });
      });
    return () => {
      cancelled = true;
    };
  }, [token, date, shift, key]);

  const state: RosterState = result?.key === key ? result.state : { status: 'loading' };

  const save = useCallback(
    async (view: RosterView, timelines: { workerZ: string; segments: Segment[] }[]) => {
      if (!token) return;
      const next = await saveRoster(token, {
        date: view.date,
        shiftCode: view.shiftCode,
        timelines,
      });
      setResult({ key, state: { status: 'ready', view: next } });
    },
    [token, key]
  );

  return { state, save };
}
