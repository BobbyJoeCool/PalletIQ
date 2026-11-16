import { apiFetch } from './api';
import type { AisleBreakdownEntry } from './useAisleField';

/**
 * `GET /api/locations/aisle-exists` — the one client call for "is this a real aisle, and
 * what freight is stored there" (#216; the same fetch literal used to be written at 10
 * call sites). Never throws for a nonexistent aisle — `exists: false` comes back instead.
 */
export function fetchAisleExists(token: string, aisle: string): Promise<{ exists: boolean; breakdown: AisleBreakdownEntry[] }> {
  return apiFetch(`/api/locations/aisle-exists?aisle=${aisle}`, token);
}
