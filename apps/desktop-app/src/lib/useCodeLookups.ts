import { useEffect, useState } from 'react';
import { useAuth } from '../context/authContext';
import { fetchSizes, fetchStorageCodes } from './locationSetupApi';
import type { CodeOption } from './locationSetupApi';

/**
 * Loads the storage code and size lists once, for Location Setup's pickers (#143).
 * Both stay empty until loaded, and `failed` is set if either request fails.
 */
export function useCodeLookups(): {
  storageCodes: CodeOption[];
  sizes: CodeOption[];
  failed: boolean;
} {
  const { token } = useAuth();
  const [storageCodes, setStorageCodes] = useState<CodeOption[]>([]);
  const [sizes, setSizes] = useState<CodeOption[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([fetchStorageCodes(token), fetchSizes(token)])
      .then(([codes, sizeList]) => {
        if (cancelled) return;
        setStorageCodes(codes);
        setSizes(sizeList);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return { storageCodes, sizes, failed };
}
