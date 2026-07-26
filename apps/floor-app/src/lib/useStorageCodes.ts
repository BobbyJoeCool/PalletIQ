import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { CodeOption } from '../components/shared/CodePickerField';
import { apiFetch } from './api';

// Module-level cache — the full Storage Code reference list essentially never changes
// within a session, so every StorageCodeField (and any screen narrowing against it)
// shares one fetch instead of each re-requesting it independently.
let cache: CodeOption[] | null = null;

/** Fetches (and caches) the full Storage Code reference list — `{ code, desc }` pairs —
 *  from `GET /api/storage-codes` (issue #80). Returns `null` while loading. */
export function useStorageCodes(): CodeOption[] | null {
  const { token } = useAuth();
  const [codes, setCodes] = useState<CodeOption[] | null>(cache);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    apiFetch<CodeOption[]>('/api/storage-codes', token!)
      .then((data) => {
        cache = data;
        if (!cancelled) setCodes(data);
      })
      .catch(() => { if (!cancelled) setCodes([]); });
    return () => { cancelled = true; };
  }, [token]);

  return codes;
}
