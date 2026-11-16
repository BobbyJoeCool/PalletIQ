import type {
  AisleDefinition,
  AisleSummary,
  AisleView,
  CellLocationView,
  NotForStorageReason,
  ZoneCellKey,
} from '@shared/aisleSetup';
import { apiFetch } from './api';

/**
 * Client for the Location Setup endpoints (#143). Every function sends one request and
 * returns the server's answer; failures throw an Error whose message is the API's error
 * code, with any extra fields on `data` (see apiFetch).
 */

/** A `{ code, desc }` lookup row, as `/api/storage-codes` and `/api/sizes` return them. */
export interface CodeOption {
  code: string;
  desc: string;
}

export function fetchAisles(token: string): Promise<AisleSummary[]> {
  return apiFetch<AisleSummary[]>('/api/aisles', token);
}

export function fetchAisle(token: string, aisle: number): Promise<AisleView> {
  return apiFetch<AisleView>(`/api/aisles/${aisle}`, token);
}

export function fetchCellLocations(
  token: string,
  aisle: number,
  key: ZoneCellKey
): Promise<CellLocationView[]> {
  const params = new URLSearchParams({
    zone: String(key.zone),
    side: key.side,
    level: String(key.level),
  });
  return apiFetch<CellLocationView[]>(`/api/aisles/${aisle}/locations?${params.toString()}`, token);
}

/** Storage codes a zone may be set to (the API already leaves Not For Storage out). */
export function fetchStorageCodes(token: string): Promise<CodeOption[]> {
  return apiFetch<CodeOption[]>('/api/storage-codes', token);
}

export function fetchSizes(token: string): Promise<CodeOption[]> {
  return apiFetch<CodeOption[]>('/api/sizes', token);
}

export function createAisle(token: string, def: AisleDefinition): Promise<AisleView> {
  return apiFetch<AisleView>('/api/aisles', token, { method: 'POST', body: JSON.stringify(def) });
}

export function deleteAisle(token: string, aisle: number): Promise<{ deleted: true }> {
  return apiFetch<{ deleted: true }>(`/api/aisles/${aisle}`, token, { method: 'DELETE' });
}

export function applyZoneSettings(
  token: string,
  aisle: number,
  body: { cells: ZoneCellKey[]; storageCode?: string; size?: string; confirmOccupied?: boolean }
): Promise<AisleView> {
  return apiFetch<AisleView>(`/api/aisles/${aisle}/zone-settings`, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function setContraction(
  token: string,
  aisle: number,
  body: { cells?: ZoneCellKey[]; locations?: string[]; contracted: boolean }
): Promise<AisleView> {
  return apiFetch<AisleView>(`/api/aisles/${aisle}/contraction`, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function carveOut(
  token: string,
  location: string,
  reason: NotForStorageReason,
  note: string
): Promise<AisleView> {
  return apiFetch<AisleView>(`/api/locations/${location}/not-for-storage`, token, {
    method: 'POST',
    body: JSON.stringify({ reason, note }),
  });
}

export function restoreCarveOut(token: string, location: string): Promise<AisleView> {
  return apiFetch<AisleView>(`/api/locations/${location}/not-for-storage`, token, {
    method: 'DELETE',
  });
}
