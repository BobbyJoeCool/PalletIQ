import { useCallback, useState } from 'react';
import { useNumpadField } from './useNumpadField';

export interface AisleFieldOptions {
  /** Checks whether an aisle exists — every current caller wires this to
   *  `GET /api/locations/aisle-exists`, the purpose-built existence-check endpoint (returns
   *  `{exists: boolean}`, never throws for "doesn't exist"). A couple of screens (SDP,
   *  STG's per-stack override) previously reused `GET /api/locations/empty-by-zone` for
   *  this — a heavier endpoint whose real purpose is the zone-map/narrowing payload, thrown
   *  away here — purely for its `NOT_FOUND` side effect. Confirmed against the backend
   *  (`api/functions/locations.ts`'s `checkAisleExists`/`getLocationsEmptyByZone`) that both
   *  check the exact same condition (`prisma.location.{count,findMany}({where:{aisle}})`),
   *  so switching those two onto `aisle-exists` is a pure lightening, not a semantic change. */
  fetch: (aisle: string) => Promise<{ exists: boolean }>;
  /** Fires once the confirmed value is a real aisle. */
  onResolved?: (aisle: string) => void;
  /** Fires once the confirmed value is NOT a real aisle (or the check itself failed). */
  onNotFound?: (aisle: string) => void;
  /** Fires the instant a box confirms (3 digits), before the async check resolves — for a
   *  caller that wants to advance focus regardless of validity (WLH Range's existing
   *  "length drives advance, correctness is a separate highlight" convention, already used
   *  elsewhere in the app — e.g. PAR's screen-wide auto-advance chain). Independent of
   *  `onResolved`/`onNotFound`, which only fire once the check itself settles. */
  onConfirm?: (aisle: string) => void;
}

/**
 * Shared bare-Aisle-filter entry field (issue #161) — numpad-driven, 3-digit, with an
 * internal async existence-check replacing what ELA/WLH independently lacked entirely, and
 * what SDP/STG's per-stack override each independently re-implemented via a heavier
 * zone-map endpoint. Mirrors `useUpcField`'s shape (issue #160) — same `fetch`/`onResolved`/
 * `onNotFound` contract, `invalid`/`loading` state owned internally.
 *
 * Not every bare-Aisle site in the app is a consumer — see this hook's own `Documentation/
 * Components/useAisleField.md` for which screens deliberately stayed off it and why (ELZ's
 * existence check is inseparable from a real narrowing fetch it needs regardless; STG's
 * per-stack `PalletBox` render is a deliberately distinct visual chrome that still uses
 * this hook for its check, just not for rendering).
 *
 * Truncates a confirmed value longer than 3 digits to its leading 3 before checking — a
 * full location barcode scanned into a bare Aisle box (rather than hand-typed) delivers a
 * longer value that manual typing structurally cannot produce, same reasoning as
 * `LocationEntryFields`' own 8-digit full-barcode override, just without a distinct
 * "resolve immediately" branch since a bare Aisle filter has no Bin/Level to combine with.
 * Previously only SDP defended against this; every consumer gets it uniformly now.
 */
export function useAisleField({ fetch, onResolved, onNotFound, onConfirm }: AisleFieldOptions) {
  const field = useNumpadField('numpad', 3, true);
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(false);

  const check = useCallback(async (value: string) => {
    const trimmed = value.trim().slice(0, 3);
    if (trimmed !== value.trim()) field.set(trimmed);
    // `onConfirm` fires even for an intentional empty confirm (backspace-to-empty + OK) —
    // every consumer's own pre-existing behavior commits whatever was confirmed regardless
    // of value (e.g. STG's per-stack override clearing back to Master Control's value).
    // Only the async existence check itself skips on empty — checking "does aisle '' exist"
    // is meaningless, and an empty box isn't "invalid," just unset.
    onConfirm?.(trimmed);
    if (!trimmed) { setInvalid(false); return; }
    setLoading(true);
    try {
      const { exists } = await fetch(trimmed);
      setInvalid(!exists);
      if (exists) onResolved?.(trimmed);
      else onNotFound?.(trimmed);
    } catch {
      setInvalid(true);
      onNotFound?.(trimmed);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetch]);

  /** Registers the field's numpad handler, wired to check on confirm. */
  function focusField() {
    field.focus((v) => void check(v));
  }

  /** Populates the box AND checks — for a caller delivering an aisle outside the
   *  interactive typing path (a router-state/URL prefill). */
  function loadAisle(value: string) {
    field.set(value);
    void check(value);
  }

  function clear() {
    field.clear();
    setInvalid(false);
  }

  return { field, invalid, loading, focusField, loadAisle, clear };
}
