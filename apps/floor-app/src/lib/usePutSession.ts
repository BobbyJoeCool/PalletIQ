/**
 * SDP put session (#215) — the one module that runs the put-verify flow and the only caller
 * of the puts client. SDPPage and SDPVerifyPutModal render its `view` and call its actions;
 * each action resolves to a typed outcome the page maps onto tones/messages/history (UI
 * concerns stay in the page, protocol stays here).
 *
 * Before #215 this state machine was spread across SDPPage's handlers, the modal (which made
 * its own unassign / hold / exists-elsewhere calls) and SDPContext, and the page invented
 * client-only state (`hasReservation`, `original`, `palletStorageCode`) plus client-side
 * redirect rules (location match, resolution, candidate filter) because the redirect
 * released the reservation and completed through manual/confirm. Now a redirect keeps the
 * reservation and `confirmPut` — with an optional `targetLocation` — is the only confirm path.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSDP } from '../context/SDPContext';
import type { RedirectTarget } from './putSessionState';
import type { ConsolidationCandidate, DirectPutRequest, DirectPutResponse, PutsClient } from './putsClient';

/** What the modal and page render for the current put. */
export interface PutView {
  reservationId: number;
  /** The reserved location (where a non-redirected confirm completes). */
  reservedLocation: string;
  reservedStorageCode: string;
  /** Where the put is currently pointed — the reserved location, or a redirect target. */
  directedLocation: string;
  directedLocationStorageCode: string;
  directedLocationSize: string;
  /** The pallet's own Storage Code (what the original directed search matched on). */
  palletStorageCode: string;
  isRedirected: boolean;
  isHandPut: boolean;
  pallet: DirectPutResponse['pallet'];
  alreadyStored: boolean;
}

/** Builds the render view for a directed put and its (optional) redirect target. */
function toView(put: DirectPutResponse, target: RedirectTarget | null): PutView {
  return {
    reservationId: put.reservationId,
    reservedLocation: put.directedLocation,
    reservedStorageCode: put.directedLocationStorageCode,
    directedLocation: target?.locationId ?? put.directedLocation,
    directedLocationStorageCode: target?.storageCode ?? put.directedLocationStorageCode,
    directedLocationSize: put.directedLocationSize,
    palletStorageCode: put.directedLocationStorageCode,
    isRedirected: target != null,
    isHandPut: put.directedLocationSize === 'XS',
    pallet: put.pallet,
    alreadyStored: put.alreadyStored,
  };
}

/** Extracts the API error code an `apiFetch` rejection carries. */
function errorCode(err: unknown): string {
  return err instanceof Error ? err.message : '';
}

export type DirectOutcome = { kind: 'directed'; view: PutView } | { kind: 'error'; code: string };

export type ConfirmOutcome =
  | { kind: 'put'; location: string; wasMove: boolean; clearedLocation: string | null; wasStaged: boolean }
  | { kind: 'consolidated'; location: string; wasMove: boolean }
  | { kind: 'mismatch'; directedLocation: string }
  | { kind: 'expired'; reservedLocation: string }
  | { kind: 'notCandidate'; directedLocation: string }
  | { kind: 'error' };

export type UnassignOutcome =
  | { kind: 'released'; reservedLocation: string; releasedStatus: 'STAGED' | 'EMPTY' }
  | { kind: 'expired'; reservedLocation: string }
  | { kind: 'error' };

export type HoldOutcome = { kind: 'held'; location: string } | { kind: 'error'; code: string };

export function usePutSession(client: PutsClient) {
  const { session, dispatch } = useSDP();
  // Keyed by reservation so a new put never shows the previous put's candidates.
  const [loaded, setLoaded] = useState<{ reservationId: number; list: ConsolidationCandidate[] } | null>(null);

  const view = useMemo<PutView | null>(
    () => (session.phase === 'directed' ? toView(session.put, session.target) : null),
    [session],
  );

  // Exists Elsewhere candidates — Hand Put only, fetched once per reservation. A failed
  // lookup just means no redirect is offered (it's a convenience, not a required step).
  const reservationId = view?.reservationId;
  const isHandPut = view?.isHandPut ?? false;
  useEffect(() => {
    if (reservationId == null || !isHandPut) return;
    let cancelled = false;
    client.consolidationCandidates(reservationId)
      .then((list) => { if (!cancelled) setLoaded({ reservationId, list }); })
      .catch(() => { /* no redirect offered */ });
    return () => { cancelled = true; };
  }, [client, reservationId, isHandPut]);

  const direct = useCallback(async (req: DirectPutRequest): Promise<DirectOutcome> => {
    try {
      const put = await client.direct(req);
      dispatch({ type: 'DIRECTED', put });
      return { kind: 'directed', view: toView(put, null) };
    } catch (err) {
      return { kind: 'error', code: errorCode(err) };
    }
  }, [client, dispatch]);

  const confirm = useCallback(async (scannedLocation: string, wasScanned: boolean): Promise<ConfirmOutcome> => {
    if (!view) return { kind: 'error' };
    try {
      const result = await client.confirm(view.reservationId, {
        scannedLocation, wasScanned,
        ...(view.isRedirected && { targetLocation: view.directedLocation }),
      });
      dispatch({ type: 'RESET' });
      if ('consolidated' in result) return { kind: 'consolidated', location: result.location, wasMove: view.pallet.currentLocation != null };
      return { kind: 'put', ...result };
    } catch (err) {
      const code = errorCode(err);
      if (code === 'LOCATION_MISMATCH') return { kind: 'mismatch', directedLocation: view.directedLocation };
      if (code === 'NOT_A_CANDIDATE') return { kind: 'notCandidate', directedLocation: view.directedLocation };
      if (code === 'NOT_FOUND') { dispatch({ type: 'RESET' }); return { kind: 'expired', reservedLocation: view.reservedLocation }; }
      return { kind: 'error' };
    }
  }, [client, dispatch, view]);

  const unassign = useCallback(async (): Promise<UnassignOutcome> => {
    if (!view) return { kind: 'error' };
    try {
      const result = await client.unassign(view.reservationId);
      dispatch({ type: 'RESET' });
      return { kind: 'released', reservedLocation: view.reservedLocation, releasedStatus: result.releasedStatus };
    } catch (err) {
      if (errorCode(err) === 'NOT_FOUND') { dispatch({ type: 'RESET' }); return { kind: 'expired', reservedLocation: view.reservedLocation }; }
      return { kind: 'error' };
    }
  }, [client, dispatch, view]);

  /** Hold Location — Hold Both on the reserved location; the hold clears the reservation. */
  const hold = useCallback(async (reasonCode: string): Promise<HoldOutcome> => {
    if (!view) return { kind: 'error', code: '' };
    try {
      await client.holdBoth(view.reservedLocation, reasonCode);
      dispatch({ type: 'RESET' });
      return { kind: 'held', location: view.reservedLocation };
    } catch (err) {
      return { kind: 'error', code: errorCode(err) };
    }
  }, [client, dispatch, view]);

  /** Points the put at an Exists Elsewhere candidate. Local only — the reservation stays live. */
  const redirect = useCallback((target: RedirectTarget) => dispatch({ type: 'RETARGET', target }), [dispatch]);
  const returnToReserved = useCallback(() => dispatch({ type: 'RETARGET', target: null }), [dispatch]);
  /** Drops the session locally (after an expiry the page detected, or a held location). */
  const reset = useCallback(() => dispatch({ type: 'RESET' }), [dispatch]);

  /** True once the reserved location is no longer RESERVED (the server expired it). */
  const isExpired = useCallback(async (): Promise<boolean> => {
    if (!view) return false;
    return (await client.locationStatus(view.reservedLocation)) !== 'RESERVED';
  }, [client, view]);

  return {
    view,
    candidates: view && loaded?.reservationId === view.reservationId
      ? loaded.list.filter((c) => c.locationId !== view.directedLocation)
      : [],
    direct, confirm, unassign, hold, redirect, returnToReserved, reset, isExpired,
  };
}

export type PutSession = ReturnType<typeof usePutSession>;
