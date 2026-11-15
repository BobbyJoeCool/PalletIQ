/**
 * Typed client for SDP's puts endpoints (#215). The put session (`usePutSession`) is its
 * only caller, so the endpoint shapes live in one place. `PutsClient` is the seam: the
 * HTTP adapter below is production; a test can hand the session a fake.
 */
import { apiFetch } from './api';
import { splitReasonCode } from './reasonCode';

/** POST /api/puts/directed request. */
export interface DirectPutRequest {
  aisle: number;
  palletId: number;
  size?: string;
  storageCode?: string;
  zone?: number;
  consolidating: boolean;
  wasScanned: boolean;
}

/** POST /api/puts/directed response. */
export interface DirectPutResponse {
  reservationId: number;
  directedLocation: string;
  directedLocationSize: string;
  directedLocationStorageCode: string;
  pallet: {
    id: number;
    dpci: string;
    descShort: string;
    quantity: { pallets: number; cartons: number; ssps: number };
    currentLocation: string | null;
  };
  alreadyStored: boolean;
}

/** POST /api/puts/:id/confirm responses — a normal put, or a redirect's consolidation. */
export type ConfirmPutResponse =
  | { consolidated: true; targetPalletId: number; location: string }
  | { location: string; wasMove: boolean; clearedLocation: string | null; wasStaged: boolean };

/** An Exists Elsewhere candidate (GET /api/puts/:id/consolidation-candidates). */
export interface ConsolidationCandidate {
  locationId: string;
  storageCode: string;
  currentCartons: number;
  palletId: number;
}

export interface PutsClient {
  direct(req: DirectPutRequest): Promise<DirectPutResponse>;
  confirm(reservationId: number, body: { scannedLocation: string; wasScanned: boolean; targetLocation?: string }): Promise<ConfirmPutResponse>;
  unassign(reservationId: number): Promise<{ location: string; releasedStatus: 'STAGED' | 'EMPTY' }>;
  consolidationCandidates(reservationId: number): Promise<ConsolidationCandidate[]>;
  /** Places Hold Both on the reserved location (clears the reservation server-side). */
  holdBoth(locationId: string, reasonCode: string): Promise<void>;
  /** Current status of a location — used to detect a reservation expiring. */
  locationStatus(locationId: string): Promise<string>;
}

/** Production adapter: the real HTTP endpoints. */
export function createHttpPutsClient(token: string): PutsClient {
  return {
    direct: (req) => apiFetch<DirectPutResponse>('/api/puts/directed', token, { method: 'POST', body: JSON.stringify(req) }),
    confirm: (id, body) => apiFetch<ConfirmPutResponse>(`/api/puts/${id}/confirm`, token, { method: 'POST', body: JSON.stringify(body) }),
    unassign: (id) => apiFetch(`/api/puts/${id}/unassign`, token, { method: 'POST' }),
    consolidationCandidates: async (id) =>
      (await apiFetch<{ locations: ConsolidationCandidate[] }>(`/api/puts/${id}/consolidation-candidates`, token)).locations,
    holdBoth: async (locationId, reasonCode) => {
      const { prefix: reasonPrefix, number: reasonNumber } = splitReasonCode(reasonCode);
      await apiFetch(`/api/locations/${locationId}/hold`, token, {
        method: 'PATCH', body: JSON.stringify({ holdType: 'HOLD_BOTH', reasonPrefix, reasonNumber }),
      });
    },
    locationStatus: async (locationId) => (await apiFetch<{ status: string }>(`/api/locations/${locationId}`, token)).status,
  };
}
