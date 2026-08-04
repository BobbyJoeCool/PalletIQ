import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from './api';

export type ReasonCodeDomain = 'HOLD' | 'PALLET_ADJUST';

export interface ReasonPrefixOption {
  letter: string;
  desc: string;
}

export interface ReasonNumberOption {
  number: string;
  desc: string;
  restrictedToPrefixes: string[] | null;
}

export interface ReasonCodesResult {
  prefixes: ReasonPrefixOption[];
  reasons: ReasonNumberOption[];
}

/**
 * Fetches this user's own accessible reason-code prefixes plus every reason valid for
 * `domain`, from `GET /api/reason-codes` (issue #84). Unlike `useStorageCodes`' static
 * reference list, this is derived live per-user server-side — no module-level cache here;
 * every mount fetches fresh, matching "derive access live, every time a picker opens."
 * Returns null while loading.
 */
export function useReasonCodes(domain: ReasonCodeDomain): ReasonCodesResult | null {
  const { token } = useAuth();
  const [result, setResult] = useState<ReasonCodesResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    apiFetch<ReasonCodesResult>(`/api/reason-codes?domain=${domain}`, token!)
      .then((data) => { if (!cancelled) setResult(data); })
      .catch(() => { if (!cancelled) setResult({ prefixes: [], reasons: [] }); });
    return () => { cancelled = true; };
  }, [token, domain]);

  return result;
}
