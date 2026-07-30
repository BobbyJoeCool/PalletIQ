import { useCallback, useMemo, useState } from 'react';
import { useNumpadField } from './useNumpadField';
import { useDemoSlot } from '../context/FooterDemoContext';
import { DemoScannerBar } from '../components/shared/DemoScannerBar';

export interface PalletIdFieldOptions<T> {
  /** Resolves a Pallet ID against the API — each screen supplies its own endpoint/response
   *  shape (PII: full pallet detail for display/edit). Mirrors `useUpcField`'s contract. */
  fetch: (pid: string) => Promise<T>;
  /** Fires on a successful resolve, with the resolved (trimmed) Pallet ID alongside the data. */
  onResolved?: (data: T, pid: string) => void;
  /** Fires on a failed resolve, in addition to the hook's own `invalid` flip. */
  onNotFound?: (pid: string) => void;
  /** Fires immediately before every resolve attempt. */
  onBeforeResolve?: () => void;
}

/**
 * Self-validating Pallet ID entry field (Feature 9, Phase 1) — for the one current consumer
 * whose Pallet ID scan is a genuine "does this pallet exist, fetch its data" check (PII).
 * Mirrors `useUpcField`'s shape exactly. **Not** for a compound-submit consumer like SDP/MNP
 * (Pallet ID + Aisle/overrides -> one directed-put request) or PIP (Pallet ID + Container ->
 * one verify request) — those stay on the plain, render-only `PalletIdField` component with
 * their own screen-owned submit handler, same established precedent as PIP's UPC field
 * staying off `useUpcField` for the identical reason (see that hook's own docstring).
 *
 * Owns its own Demo Scanner registration internally, keyed off its own `field.isActive` —
 * PII no longer needs to build any Pallet-ID-specific demo slot of its own.
 */
export function usePalletIdField<T>({ fetch, onResolved, onNotFound, onBeforeResolve }: PalletIdFieldOptions<T>) {
  const field = useNumpadField('numpad');
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(false);

  const resolve = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onBeforeResolve?.();
    setLoading(true);
    try {
      const data = await fetch(trimmed);
      onResolved?.(data, trimmed);
      setInvalid(false);
    } catch {
      setInvalid(true);
      onNotFound?.(trimmed);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetch]);

  /** Registers the field's numpad handler, wired to resolve on confirm. */
  function focusField() {
    field.focus((v) => void resolve(v));
  }

  /** Populates the box AND resolves — for a caller delivering a whole Pallet ID at once
   *  outside the interactive typing path (the Demo Scanner, a `?id=` URL param). */
  const loadPalletId = useCallback((value: string) => {
    field.set(value);
    void resolve(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolve]);

  function clear() {
    field.clear();
    setInvalid(false);
  }

  // Memoized the same way every other demoSlot registration in this app already is (see
  // PII's/SDP's/MNP's own comments) — an unmemoized JSX literal here would recreate a new
  // element every render, re-firing useDemoSlot's re-sync effect in a loop.
  const demoSlot = useMemo(
    () => (field.isActive ? <DemoScannerBar onFill={loadPalletId} /> : null),
    [field.isActive, loadPalletId],
  );
  useDemoSlot(demoSlot);

  return { field, invalid, loading, focusField, loadPalletId, clear };
}
