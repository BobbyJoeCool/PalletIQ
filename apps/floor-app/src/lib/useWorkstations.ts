import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from './api';

export interface Workstation {
  id: string;
  name: string;
}

// Module-level cache — mirrors useStorageCodes.ts's own caching: the workstation
// reference list essentially never changes within a session.
let cache: Workstation[] | null = null;

/** Fetches (and caches) the full Workstation reference list — `{ id, name }` pairs —
 *  from `GET /api/workstations` (GitHub #124/#125). Returns `null` while loading. */
export function useWorkstations(): Workstation[] | null {
  const { token } = useAuth();
  const [workstations, setWorkstations] = useState<Workstation[] | null>(cache);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    apiFetch<Workstation[]>('/api/workstations', token!)
      .then((data) => {
        cache = data;
        if (!cancelled) setWorkstations(data);
      })
      .catch(() => { if (!cancelled) setWorkstations([]); });
    return () => { cancelled = true; };
  }, [token]);

  return workstations;
}
