import { useCallback, useRef, useState } from 'react';
import type { AuditResult } from '@shared/audit';
import { useAuth } from '../context/authContext';
import { fetchAudit } from './auditApi';
import type { AuditQuery } from './auditApi';

/** The Audit Tool always has exactly three panes. */
export const AUDIT_PANE_COUNT = 3;

/** What one pane is currently showing. */
export type AuditPaneState =
  | { status: 'empty' }
  | { status: 'loading'; query: AuditQuery }
  | { status: 'error'; query: AuditQuery; errorCode: string }
  | { status: 'ready'; query: AuditQuery; result: AuditResult };

const EMPTY_PANES: AuditPaneState[] = Array.from({ length: AUDIT_PANE_COUNT }, () => ({
  status: 'empty',
}));

/**
 * State for the Audit Tool's three independent panes (#148), and the one action that
 * changes them: run a lookup in a pane. Each pane loads, fails and shows results on its
 * own — a failed lookup in one never disturbs the other two.
 *
 * `lookup` fires a network request and replaces that pane's contents with the outcome.
 * If a newer lookup is started in the same pane before an older one returns, the older
 * response is discarded.
 *
 * @returns the three pane states and `lookup(paneIndex, query)`
 */
export function useAuditPanes(): {
  panes: AuditPaneState[];
  lookup: (paneIndex: number, query: AuditQuery) => void;
} {
  const { token } = useAuth();
  const [panes, setPanes] = useState<AuditPaneState[]>(EMPTY_PANES);
  // Latest request number per pane, to recognise a response that has been superseded.
  const latestRequest = useRef<number[]>(EMPTY_PANES.map(() => 0));

  const lookup = useCallback(
    (paneIndex: number, query: AuditQuery) => {
      if (!token) return;
      const requestNumber = ++latestRequest.current[paneIndex];

      /** Replaces this pane's state, unless a newer lookup has since started in it. */
      const setPane = (next: AuditPaneState) => {
        if (latestRequest.current[paneIndex] !== requestNumber) return;
        setPanes((current) => current.map((pane, i) => (i === paneIndex ? next : pane)));
      };

      setPane({ status: 'loading', query });
      fetchAudit(token, query)
        .then((result) => setPane({ status: 'ready', query, result }))
        .catch((err: unknown) =>
          setPane({
            status: 'error',
            query,
            errorCode: err instanceof Error ? err.message : 'REQUEST_FAILED',
          })
        );
    },
    [token]
  );

  return { panes, lookup };
}
