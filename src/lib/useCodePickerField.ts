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
   *  instead of committing it (clears the field, calls `onInvalid` in place of
   *  `onChange`). Skipped automatically while `optionsLoading` is true. */
  strict?: boolean;
  onInvalid?: (code: string) => void;
  optionsLoading?: boolean;
  /** Also dismiss the input panel on a maxLength auto-submit, not just an explicit
   *  Enter/OK confirm — see CodePickerField's own doc for when this is appropriate. */
  closeOnAutoSubmit?: boolean;
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
    disabled = false, strict = false, onInvalid, optionsLoading = false, closeOnAutoSubmit = false,
  } = opts;

  const field = useNumpadField(panel, maxLength, undefined, earlyCommit);
  const { hidePanel } = useNumpad();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => { field.set(value); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (strict && trimmed && !optionsLoading && !options.some((o) => o.code === trimmed)) {
        field.clear();
        onInvalid?.(trimmed);
      } else {
        onChange(trimmed);
      }
      if (explicit || closeOnAutoSubmit) hidePanel();
    });
  }

  function selectOption(code: string) {
    setOpen(false);
    onChange(code);
  }

  return { field, open, setOpen, wrapperRef, focusField, selectOption };
}
