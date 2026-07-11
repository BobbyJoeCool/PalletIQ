import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from './api';

interface Breakdown { storageCode: string; size: string }
interface EmptyByZoneResult { zoneSummary: { breakdown: Breakdown[] }[] }

export interface AisleFreightTypes {
  /** Distinct Storage Codes actually present (empty or staged) in this aisle. */
  storageCodes: string[];
  /** Distinct Sizes present in this aisle, optionally narrowed to one Storage Code. */
  sizesFor: (storageCode?: string) => string[];
}

/**
 * Fetches the freight types (Storage Code + Size combinations) actually present in an
 * aisle, via the existing `GET /api/locations/empty-by-zone?aisle=X` endpoint (no
 * storageCode/size filter, so it returns every combination present — the same relaxation
 * Feature 2's live info panel already relies on). Feeds the "narrow to what's available"
 * side of issue #80's dropdown-helper fields wherever an aisle is already known (STG,
 * ELZ, SDP) — ELA never has an aisle to narrow by, so it always shows the full reference
 * list instead (see StorageCodeField/SizeField's own un-narrowed fallback).
 *
 * Returns `null` while loading or when no aisle is given.
 */
export function useAisleFreightTypes(aisle: number | null): AisleFreightTypes | null {
  const { token } = useAuth();
  const [breakdown, setBreakdown] = useState<Breakdown[] | null>(null);

  useEffect(() => {
    if (aisle == null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- standard reset-on-filter-change effect
      setBreakdown(null);
      return;
    }
    let cancelled = false;
    apiFetch<EmptyByZoneResult>(`/api/locations/empty-by-zone?aisle=${aisle}`, token!)
      .then((data) => {
        if (cancelled) return;
        setBreakdown(data.zoneSummary.flatMap((z) => z.breakdown));
      })
      .catch(() => { if (!cancelled) setBreakdown([]); });
    return () => { cancelled = true; };
  }, [aisle, token]);

  if (breakdown == null) return null;

  return {
    storageCodes: [...new Set(breakdown.map((b) => b.storageCode))],
    sizesFor: (storageCode) => [
      ...new Set(
        breakdown
          .filter((b) => !storageCode || b.storageCode === storageCode)
          .map((b) => b.size),
      ),
    ],
  };
}
