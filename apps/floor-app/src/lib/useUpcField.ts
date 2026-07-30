import { useCallback, useState } from 'react';
import { useNumpadField } from './useNumpadField';

export interface UpcFieldOptions<T> {
  /** Resolves a UPC against the API — each screen supplies its own endpoint and response
   *  shape (PAR/IID: an item lookup; ISI: a locations lookup). */
  fetch: (upc: string) => Promise<T>;
  /** Fires on a successful resolve, with the resolved (trimmed) UPC alongside the data —
   *  mirrors `useDpciFields`'s `onResolved(data, dpci)` shape. */
  onResolved?: (data: T, upc: string) => void;
  /** Fires on a failed resolve, in addition to the hook's own `upcInvalid` flip — for a
   *  screen-specific side effect (message-bar text, clearing other state). */
  onNotFound?: (upc: string) => void;
  /** Fires immediately before every resolve attempt — its own invalid flag always resets
   *  on the next resolve regardless; this is for a screen-specific side effect alongside
   *  that, e.g. closing the numpad panel (IID's `hidePanel`). Does **not** clear a sibling
   *  DPCI chain — see the class doc's own note on the established UPC/DPCI asymmetry, and
   *  don't add that here; it goes through `onResolved` instead. Mirrors `useDpciFields`'s
   *  `onBeforeResolve`. */
  onBeforeResolve?: () => void;
}

/**
 * Shared UPC entry field (issue #160) — numpad-driven, with an internal async existence-
 * check (`GET /api/items/upc/:upc`-shaped, though the exact endpoint/response is caller-
 * supplied) replacing what IID/ISI/PAR each independently re-implemented as their own
 * `loadByUpc`/`upcInvalid`. Mirrors `useDpciFields`'s hook shape (issue #159) — same
 * fetch/onResolved/onNotFound/onBeforeResolve contract, `loading`/`invalid` state owned
 * internally, a `loadUpc` for populating-and-resolving in one call (demo buttons, `?upc=`
 * URL params) and a `clear`.
 *
 * PIP's own "UPC field" is deliberately NOT a consumer of this hook — its UPC entry is a
 * compound `POST /api/pulls/verify` submit tied to a specific pull container (containerId +
 * pullFunction + upc together), not a standalone existence check, the same "compound
 * submit" shape issue #158 already found for Pallet ID in PIP/MNP. PIP keeps its own
 * `handleUpcVerify` and bare `useNumpadField` instance untouched; its box already renders
 * through the shared `NumpadFieldBox` primitive via its own local `FieldDisplay` wrapper,
 * so there was no rendering gap to close there either.
 *
 * **Established convention for any screen pairing this hook with `useDpciFields` (IID,
 * ISI, PAR today; any future screen doing the same should follow it too, direct
 * instruction, 2026-07-30):** the two fields are asymmetric, not symmetric. Resolving a
 * UPC backfills the sibling DPCI boxes (`dpciFields.setFromDpci(data.dpci)`, called from
 * this hook's own `onResolved`) since DPCI is the anchor identifier everywhere else in the
 * app; resolving a DPCI does the opposite — it clears the sibling UPC field outright
 * (`upcFields.clear()`, from `useDpciFields`'s own `onBeforeResolve`) rather than filling
 * it, since nothing populates a UPC back from a DPCI. Don't clear DPCI from this hook's own
 * `onBeforeResolve` — that was IID/ISI's original (now-retired) behavior, superseded by
 * this rule everywhere it's used.
 *
 * Only a single field, unlike `useDpciFields`'s three-box chain, so there's no
 * stale-closure/ref hazard to guard against here — `resolve` always reads the value
 * passed to it directly (from the numpad's own commit callback, or from `loadUpc`'s
 * argument), never a value read back off `field` itself.
 */
export function useUpcField<T>({ fetch, onResolved, onNotFound, onBeforeResolve }: UpcFieldOptions<T>) {
  const field = useNumpadField('numpad');
  const [upcInvalid, setUpcInvalid] = useState(false);
  const [loading, setLoading] = useState(false);

  const resolve = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onBeforeResolve?.();
    setLoading(true);
    try {
      const data = await fetch(trimmed);
      onResolved?.(data, trimmed);
      setUpcInvalid(false);
    } catch {
      setUpcInvalid(true);
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

  /** Populates the box AND resolves — for a caller that delivers a whole UPC at once
   *  outside the interactive typing path (a demo button, a `?upc=` URL param). */
  function loadUpc(value: string) {
    field.set(value);
    void resolve(value);
  }

  function clear() {
    field.clear();
    setUpcInvalid(false);
  }

  /** Escape hatch (Feature 10's own contract for the "genuinely cross-cutting" case) for
   *  a rejection discovered *outside* this hook's own resolve — e.g. a compound submit
   *  (PAR's `doSubmit`) whose server-side create call comes back `UPC_NOT_FOUND` for a
   *  value that looked valid at its own last resolve (a stale race, not this hook's own
   *  check failing). Marks invalid only — a later successful resolve (or `clear()`) is
   *  what un-marks it, same as every other invalid-wash field in the app. */
  function markInvalid() {
    setUpcInvalid(true);
  }

  return { field, upcInvalid, loading, focusField, loadUpc, clear, markInvalid };
}
