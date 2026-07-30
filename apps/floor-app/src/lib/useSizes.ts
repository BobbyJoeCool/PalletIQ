import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { CodeOption } from '../components/shared/CodePickerField';
import { apiFetch } from './api';

// Module-level cache — the full Size reference list essentially never changes within a
// session, so every consumer (currently just the Demo Scanner's by-status popup) shares
// one fetch instead of each re-requesting it independently. Mirrors useStorageCodes.ts.
let cache: CodeOption[] | null = null;

/** Fetches (and caches) the full Size reference list — `{ code, desc }` pairs — from
 *  `GET /api/sizes` (Feature 9). Returns `null` while loading. */
export function useSizes(): CodeOption[] | null {
  const { token } = useAuth();
  const [sizes, setSizes] = useState<CodeOption[] | null>(cache);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    apiFetch<CodeOption[]>('/api/sizes', token!)
      .then((data) => {
        cache = data;
        if (!cancelled) setSizes(data);
      })
      .catch(() => { if (!cancelled) setSizes([]); });
    return () => { cancelled = true; };
  }, [token]);

  return sizes;
}
