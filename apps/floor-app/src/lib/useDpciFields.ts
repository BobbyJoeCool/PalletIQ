import { useCallback, useEffect, useRef, useState } from 'react';
import { useNumpadField } from './useNumpadField';

export interface DpciFieldsOptions<T> {
  /** Resolves a 9-digit DPCI (no dashes) against the API — each screen supplies its own
   *  endpoint and response shape (PAR/IID: an item lookup; ISI: a locations lookup; PII:
   *  the same item lookup, used only to confirm existence). */
  fetch: (dpci: string) => Promise<T>;
  /** Fires on a successful resolve, with the resolved DPCI in the server's canonical
   *  `"ddd-cc-iiii"` display form (e.g. for a caller that needs to store/display the value
   *  actually resolved, not just the returned data — ISI's `search.query`). Optional — a
   *  caller that only needs `dpciInvalid` itself (e.g. PII, confirming existence without
   *  displaying a separate looked-up item) can omit this. */
  onResolved?: (data: T, dpci: string) => void;
  /** Fires on a failed resolve, in addition to the hook's own `dpciInvalid` flip — for a
   *  screen-specific side effect (message-bar text, clearing other state). */
  onNotFound?: (dpci: string) => void;
  /** Fires immediately before every resolve attempt — e.g. clearing a sibling UPC field
   *  and its own invalid flag, matching IID/ISI/PAR's established "entering a DPCI clears
   *  UPC" rule (the asymmetric counterpart to `useUpcField`'s own "entering a UPC backfills
   *  DPCI" rule — see that hook's own doc comment for the full established convention), or
   *  closing the numpad panel (IID's `hidePanel`). Not every screen needs this (ISI doesn't
   *  clear a panel; PII has no UPC field in Edit mode). */
  onBeforeResolve?: () => void;
}

/**
 * Shared Dept/Class/Item DPCI entry chain (issue #159) — numpad-driven, auto-advancing,
 * with an internal async existence-check (`GET /api/items/dpci/:dpci`-shaped, though the
 * exact endpoint/response is caller-supplied) replacing what PAR/IID/ISI each
 * independently re-implemented. `DpciField.tsx` (plain native inputs, built for a
 * hypothetical infrequent-admin-edit context) was never actually adopted by any of the 4
 * real DPCI-entry screens — this hook is the pattern all 4 actually need instead.
 *
 * Deliberately checks completeness (and resolves) after *every* box's confirm, not just
 * Item's — PAR/IID/ISI's original independent implementations only checked on Item
 * because their flows always fill Dept→Class→Item in order from empty, but PII's Edit
 * mode lets a worker retype just one box within an already-full DPCI (e.g. fixing Dept
 * alone), which never touches Item at all. Checking after every confirm handles both
 * shapes with one rule, and is a strict superset of the original behavior for PAR/IID/ISI
 * (always identical when boxes fill in order from empty).
 *
 * Reads each field's committed value from a ref (`deptValueRef`/`classValueRef`/
 * `itemValueRef`), synced from `.value` via its own `useEffect` — NOT read directly off
 * the field object, and NOT a ref updated only inside this chain's own confirm handlers.
 * Both of those simpler approaches are each individually broken here, for two different
 * reasons that don't overlap:
 *
 * 1. A ref updated only by this chain's own handlers (IID/ISI's original independent
 *    implementations) goes stale the moment any *other* path (a demo button, a `?dpci=`
 *    URL param, a UPC-resolves-DPCI backfill) sets a field via `.set()` without updating
 *    the ref — already found and fixed once, in PAR, v1.6.11 ("hand-entering a DPCI comes
 *    back invalid").
 * 2. Reading `.value` directly off the field object (PAR's own v1.6.11 fix for #1) is
 *    *itself* broken for a completely different reason discovered while building this
 *    hook: `focusClassField`/`focusItemField` only ever get (re-)registered via a chain of
 *    `setTimeout`-scheduled calls, all originally scheduled from `handleDeptConfirm` — a
 *    closure captured at Dept's own initial tap, before any typing happened. Since that
 *    closure is never refreshed on a later render, `handleItemConfirm`'s own closure over
 *    `deptField`/`classField` is frozen at their *pre-typing* (empty) values by the time it
 *    finally fires — even though the screen visibly shows what was actually typed. This
 *    silently no-ops the resolve (confirmed empirically: typing a real DPCI through the
 *    on-screen boxes produced zero network requests). It's the same *class* of bug
 *    `useExpirationDateFields` already fixed for Month/Day/Year (a chain of handlers
 *    registered once, going stale) — just never caught for DPCI specifically, since every
 *    existing e2e test and demo button populates DPCI by calling `loadDpci`/an equivalent
 *    resolve function directly, bypassing the interactive box-by-box chain entirely.
 *
 * A ref kept in sync via `useEffect` on `.value` (this hook's actual approach) isn't
 * susceptible to either: it updates on *any* value change regardless of source (fixing
 * #1), and every closure — however stale — shares the same mutable ref object, so a
 * stale closure still reads the current value through it (fixing #2).
 */
export function useDpciFields<T>({ fetch, onResolved, onNotFound, onBeforeResolve }: DpciFieldsOptions<T>) {
  const deptField = useNumpadField('numpad', 3, true);
  const classField = useNumpadField('numpad', 2, true);
  const itemField = useNumpadField('numpad', 4, true);
  const [dpciInvalid, setDpciInvalid] = useState(false);
  const [loading, setLoading] = useState(false);

  const deptValueRef = useRef(deptField.value);
  const classValueRef = useRef(classField.value);
  const itemValueRef = useRef(itemField.value);
  useEffect(() => { deptValueRef.current = deptField.value; }, [deptField.value]);
  useEffect(() => { classValueRef.current = classField.value; }, [classField.value]);
  useEffect(() => { itemValueRef.current = itemField.value; }, [itemField.value]);

  const resolve = useCallback(async (digits: string) => {
    const dpci = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}`;
    onBeforeResolve?.();
    setLoading(true);
    try {
      const data = await fetch(digits);
      onResolved?.(data, dpci);
      setDpciInvalid(false);
    } catch {
      setDpciInvalid(true);
      onNotFound?.(dpci);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetch]);

  /** Checks the full triplet's completeness, substituting `overrides` for whichever field
   *  just confirmed (its own ref hasn't synced yet — the `useEffect` above runs after this
   *  handler, not before). */
  const checkComplete = useCallback((overrides: Partial<{ dept: string; class: string; item: string }>) => {
    const dept = overrides.dept ?? deptValueRef.current;
    const cls = overrides.class ?? classValueRef.current;
    const item = overrides.item ?? itemValueRef.current;
    if (dept.length === 3 && cls.length === 2 && item.length === 4) {
      void resolve(`${dept}${cls}${item}`);
    }
  }, [resolve]);

  function focusDeptField() { deptField.focus(handleDeptConfirm); }
  function focusClassField() { classField.focus(handleClassConfirm); }
  function focusItemField() { itemField.focus(handleItemConfirm); }

  function handleDeptConfirm(value: string) {
    const v = value.trim();
    if (v.length !== 3) return;
    deptValueRef.current = v;
    setTimeout(() => focusClassField(), 50);
    checkComplete({ dept: v });
  }
  function handleClassConfirm(value: string) {
    const v = value.trim();
    if (v.length !== 2) return;
    classValueRef.current = v;
    setTimeout(() => focusItemField(), 50);
    checkComplete({ class: v });
  }
  function handleItemConfirm(value: string) {
    const v = value.trim();
    if (v.length !== 4) return;
    itemValueRef.current = v;
    checkComplete({ item: v });
  }

  /** Populates all 3 boxes from a formatted `"ddd-cc-iiii"` DPCI string (the server's
   *  canonical `formatDpci` shape) without triggering a resolve — for a caller that
   *  already knows the value is valid (IID/ISI/PAR's UPC-resolves-DPCI backfill, PII's
   *  edit-mode seed from the already-loaded pallet). One-time imperative populate, not a reactive
   *  sync — mirrors `useExpirationDateFields`'s `setFromIso`. Updates the refs directly
   *  too (not just via the `.value`-watching effect), so an immediately-following manual
   *  edit of just one box sees the other two correctly without waiting a render. */
  function setFromDpci(formatted: string) {
    const [dept, cls, item] = formatted.split('-');
    deptField.set(dept ?? '');
    classField.set(cls ?? '');
    itemField.set(item ?? '');
    deptValueRef.current = dept ?? '';
    classValueRef.current = cls ?? '';
    itemValueRef.current = item ?? '';
  }

  /** Populates all 3 boxes AND resolves — for a caller that delivers a whole DPCI at once
   *  outside the interactive chain (a demo button, a `?dpci=` URL param). Accepts either
   *  the dash-joined display form or plain concatenated digits (matching the server's own
   *  `parseDpci`, which accepts both). */
  function loadDpci(input: string) {
    const digits = input.replace(/-/g, '');
    const dept = digits.slice(0, 3), cls = digits.slice(3, 5), item = digits.slice(5, 9);
    deptField.set(dept);
    classField.set(cls);
    itemField.set(item);
    deptValueRef.current = dept;
    classValueRef.current = cls;
    itemValueRef.current = item;
    void resolve(digits);
  }

  function clear() {
    deptField.clear();
    classField.clear();
    itemField.clear();
    deptValueRef.current = '';
    classValueRef.current = '';
    itemValueRef.current = '';
    setDpciInvalid(false);
  }

  /** Escape hatch (Feature 10's own contract for the "genuinely cross-cutting" case) for
   *  a rejection discovered *outside* this hook's own resolve — e.g. a compound submit
   *  (PAR's `doSubmit`) whose server-side create call comes back `DPCI_NOT_FOUND` for a
   *  value that looked valid at its own last resolve (a stale race, not this hook's own
   *  check failing). Added alongside issue #160's `useUpcField` after finding PARPage.tsx
   *  called a same-named `setDpciInvalid` here that was never actually declared anywhere
   *  — a real dead reference that would throw at runtime the one time this exact race
   *  fires, never caught because no existing e2e test exercises a stale-DPCI submit-time
   *  rejection. Marks invalid only — a later successful resolve (or `clear()`) is what
   *  un-marks it, same as every other invalid-wash field in the app. */
  function markInvalid() {
    setDpciInvalid(true);
  }

  return {
    deptField, classField, itemField,
    dpciInvalid, loading,
    focusDeptField, focusClassField, focusItemField,
    setFromDpci, loadDpci, clear, markInvalid,
  };
}
