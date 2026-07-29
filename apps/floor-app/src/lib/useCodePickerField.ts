import { useEffect, useRef, useState } from 'react';
import { useNumpadField } from './useNumpadField';
import { useNumpad } from '../context/NumpadContext';
import type { CodeOption } from '../components/shared/CodePickerField';

interface UseCodePickerFieldOpts {
  panel: 'keyboard' | 'numpad';
  maxLength?: number;
  transform?: (raw: string) => string;
  earlyCommit?: (value: string) => boolean;
  disabled?: boolean;
  /** See CodePickerField's own doc — rejects a typed value not present in `options`
   *  instead of committing it (calls `onInvalid` in place of `onChange`). Skipped
   *  automatically while `optionsLoading` is true. */
  strict?: boolean;
  onInvalid?: (code: string) => void;
  /** Fired reactively whenever the field's own computed valid/invalid state changes — not
   *  just on a strict-mode commit-reject, but any time the current `value` stops (or
   *  starts) matching `options` (e.g. `options` itself narrows out from under an
   *  already-set value because a sibling dependency field changed). This is how a caller
   *  hooks a side effect (a message-bar line, `playAlert`) to the field's own internal
   *  validity without owning the check itself — see Feature 10
   *  (`DevNotes/DesignPrompts/Feature-10-AppWide-Field-Component-Architecture.md`).
   *  Independent of `strict`: fires the same way whether or not reject-on-commit is on. */
  onValidityChange?: (invalid: boolean) => void;
  /** Opt-in: clears the field the instant a strict-mode entry is rejected, instead of the
   *  default of leaving the typed value visible (issue #109 — "the vast majority of
   *  invalid entries SHOULD stay so the user sees what they entered," matching how every
   *  other invalid-field case in the app already works: UPC/Location/DPCI keep the bad
   *  value on screen, washed red, rather than silently wiping it). No current caller sets
   *  this; it exists for a future one that specifically needs the old wipe-on-reject
   *  behavior rather than a caller-driven wash. */
  clearOnInvalid?: boolean;
  optionsLoading?: boolean;
  /** Also dismiss the input panel on a maxLength auto-submit, not just an explicit
   *  Enter/OK confirm — see CodePickerField's own doc for when this is appropriate. */
  closeOnAutoSubmit?: boolean;
  /** The list `strict`'s reject-on-commit and the reactive `invalid` state actually check
   *  against — defaults to `options` (the popup's own list) when omitted, preserving
   *  today's behavior. Set this separately when the popup should show a *narrower* list
   *  than what actually counts as valid — e.g. `StorageCodeField`'s `aisle` narrowing:
   *  the popup only lists codes present in this aisle for convenience, but a real code
   *  just absent from this particular aisle isn't "invalid" (ELZ's read-only report,
   *  where that combination legitimately just returns an empty result) — only STG, where
   *  a stack's value must actually resolve within its own aisle, wants the popup list and
   *  the valid list to be the same one. See Feature 10
   *  (`DevNotes/DesignPrompts/Feature-10-AppWide-Field-Component-Architecture.md`). */
  validOptions?: CodeOption[];
}

/**
 * Shared interaction logic behind every "type-or-pick-from-popup" code field —
 * `CodePickerField`'s own boxes and STG's differently-chromed `PalletCodePicker`: numpad/
 * keyboard field wiring, tap-outside-closes-popup, and the commit path (with `strict`'s
 * reject-unknown-value behavior). Chrome (box styling, label placement, popup styling)
 * stays with each caller — only the behavior is extracted here, because the two
 * components' chrome is different enough (STG's pallet-slat box vs. the filter-bar style
 * every other screen uses) that folding STG's into `CodePickerField`'s own props would
 * either bloat every other caller with STG-only visual concerns or fail to actually
 * reproduce STG's look (Refactoring Audit finding F6).
 */
export function useCodePickerField(
  value: string,
  onChange: (v: string) => void,
  options: CodeOption[],
  opts: UseCodePickerFieldOpts,
) {
  const {
    panel, maxLength, transform, earlyCommit,
    disabled = false, strict = false, onInvalid, onValidityChange, optionsLoading = false, closeOnAutoSubmit = false,
    clearOnInvalid = false, validOptions,
  } = opts;
  const checkAgainst = validOptions ?? options;

  const field = useNumpadField(panel, maxLength, undefined, earlyCommit);
  const { hidePanel } = useNumpad();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => { field.set(value); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // A strict-mode reject never calls `onChange`, so `value` (the committed prop) never
  // moves — the rejected text only ever lives in the numpad buffer (`field.value`), kept
  // visible on purpose (#109). Tracked separately so the reactive `invalid` below can still
  // catch it; cleared only on the next successful commit (`onChange` actually firing),
  // matching every prior caller's own `onChange={(v) => { setXInvalid(false); ... }}`
  // convention exactly — not on every keystroke of a retry, which would un-wash before the
  // worker has actually fixed the value.
  const [rejected, setRejected] = useState(false);
  // Also clears a pending rejection whenever `value` changes for any reason *other* than
  // this hook's own commit path (e.g. a screen's own reset/clear button setting `value`
  // back to `''` directly, bypassing `onChange` here) — a freshly-external-reset box
  // shouldn't keep showing as invalid. The commit path's own inline `setRejected(false)`
  // below already covers the normal successful-commit case; this is the external-reset
  // safety net.
  useEffect(() => { setRejected(false); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reactive validity (Feature 10): the *current committed* value failing to match
  // `checkAgainst` (e.g. it narrowed out from under an already-set value because a sibling
  // dependency field changed — not just at the moment of typing), OR a strict-mode commit
  // that was just rejected and hasn't been superseded by a new successful commit yet. This
  // is what lets a caller stop owning its own "is this value valid" bookkeeping.
  const invalid = rejected || (!!value && !optionsLoading && !checkAgainst.some((o) => o.code === value));
  useEffect(() => { onValidityChange?.(invalid); }, [invalid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tap-outside closes the popup — it's a lightweight anchored dropdown, not a modal, so
  // it shouldn't need its own explicit dismiss control.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function focusField() {
    if (disabled) return;
    setOpen(false);
    field.focus((v, explicit) => {
      const trimmed = transform ? transform(v.trim()) : v.trim();
      if (strict && trimmed && !optionsLoading && !checkAgainst.some((o) => o.code === trimmed)) {
        if (clearOnInvalid) field.clear();
        setRejected(true);
        onInvalid?.(trimmed);
      } else {
        setRejected(false);
        onChange(trimmed);
      }
      if (explicit || closeOnAutoSubmit) hidePanel();
    });
  }

  function selectOption(code: string) {
    setOpen(false);
    onChange(code);
  }

  return { field, open, setOpen, wrapperRef, focusField, selectOption, invalid };
}
