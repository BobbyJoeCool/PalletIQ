import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from './api';

/** An active label printer (#168). */
export interface Printer {
  code: string;
  name: string;
}

// Module-level cache — printers are seed-only reference data that doesn't change in-session
// (same caching as useWorkstations).
let cache: Printer[] | null = null;

/** Active printers from `GET /api/printers`; null while loading, [] on failure. */
export function usePrinters(): Printer[] | null {
  const { token } = useAuth();
  const [printers, setPrinters] = useState<Printer[] | null>(cache);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    apiFetch<Printer[]>('/api/printers', token!)
      .then((data) => {
        cache = data;
        if (!cancelled) setPrinters(data);
      })
      .catch(() => { if (!cancelled) setPrinters([]); });
    return () => { cancelled = true; };
  }, [token]);

  return printers;
}
