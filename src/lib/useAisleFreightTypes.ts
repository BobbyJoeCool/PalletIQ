import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from './api';

interface GridCell { storageCode: string; size: string }
interface GridLevel { cells: GridCell[] }
interface EmptyByZoneResult { levels: GridLevel[] }

export interface AisleFreightTypes {
  /** Distinct Storage Codes physically present in this aisle. */
  storageCodes: string[];
  /** Distinct Sizes present in this aisle, optionally narrowed to one Storage Code. */
  sizesFor: (storageCode?: string) => string[];
}

/**
 * Fetches the freight types (Storage Code + Size combinations) physically present in an
 * aisle, via the existing `GET /api/locations/empty-by-zone?aisle=X` endpoint (no
 * storageCode/size filter, so it returns every combination present — the same relaxation
 * Feature 2's live info panel already relies on). Feeds the "narrow to what's available"
 * side of issue #80's dropdown-helper fields wherever an aisle is already known (STG,
 * ELZ, SDP) — ELA never has an aisle to narrow by, so it always shows the full reference
 * list instead (see StorageCodeField/SizeField's own un-narrowed fallback).
 *
 * Derived from the response's `levels` (the physical grid — built from every location in
 * the aisle, unfiltered by status or contraction), not its `zoneSummary` (which excludes
 * contracted locations and anything not EMPTY/STAGED, since that's the right scope for
 * actionable empty/staged *counts*, not for "does this type exist here at all"). Fixed in
 * v1.6.6 per direct report: a Size entirely under contraction — no stageable locations,
 * hence absent from `zoneSummary` — must still appear as a pickable option, since the
 * worker is choosing what type a location holds, not confirming it's currently stageable.
 * This is a real behavior change everywhere this hook narrows a dropdown (STG/ELZ/SDP),
 * not just STG.
 *
 * Returns `null` while loading or when no aisle is given.
 */
export function useAisleFreightTypes(aisle: number | null): AisleFreightTypes | null {
  const { token } = useAuth();
  const [cells, setCells] = useState<GridCell[] | null>(null);

  useEffect(() => {
    if (aisle == null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- standard reset-on-filter-change effect
      setCells(null);
      return;
    }
    let cancelled = false;
    apiFetch<EmptyByZoneResult>(`/api/locations/empty-by-zone?aisle=${aisle}`, token!)
      .then((data) => {
        if (cancelled) return;
        setCells(data.levels.flatMap((l) => l.cells));
      })
      .catch(() => { if (!cancelled) setCells([]); });
    return () => { cancelled = true; };
  }, [aisle, token]);

  if (cells == null) return null;

  return {
    storageCodes: [...new Set(cells.map((c) => c.storageCode))],
    sizesFor: (storageCode) => [
      ...new Set(
        cells
          .filter((c) => !storageCode || c.storageCode === storageCode)
          .map((c) => c.size),
      ),
    ],
  };
}
