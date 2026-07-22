import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useNumpadField } from '../../lib/useNumpadField';
import { useNumpad } from '../../context/NumpadContext';
import { INVALID_WASH } from '../../lib/invalidWash';

export interface CodeOption { code: string; desc: string }

interface CodePickerFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** The options to list in the popup — callers pass a narrowed list when enough context
   *  is already known (e.g. an aisle already entered) to know what's actually available,
   *  or the full reference list otherwise (issue #80). */
  options: CodeOption[];
  optionsLoading?: boolean;
  panel: 'keyboard' | 'numpad';
  /** Fixed entry length that auto-commits without an explicit OK tap (see useNumpadField's
   *  maxLength) — omit for variable-length values. */
  maxLength?: number;
  /** Applied to typed input before it's committed, e.g. uppercasing a Storage Code. */
  transform?: (raw: string) => string;
  size?: 'compact' | 'default';
  /** Overrides the width Tailwind class that `size` would otherwise pick (e.g.
   *  `'w-[147px]'`) — for a caller that needs a narrower/wider box without also changing
   *  the height/text-size `size` otherwise ties together. */
  width?: string;
  label?: string;
  ariaLabel?: string;
  /** Disables both the entry field and the dropdown-helper button — e.g. SDP locks its
   *  override fields while a directed reservation is active. */
  disabled?: boolean;
  /** Opt-in: also dismiss the input panel on a maxLength auto-submit, not just an explicit
   *  Enter/OK confirm. Off by default (see useNumpadField's `explicit` doc for why auto-
   *  submit normally leaves the panel open) — only enable for a field where reaching
   *  maxLength reliably means "done" for every valid value, e.g. ELA's Storage Code. */
  closeOnAutoSubmit?: boolean;
  /** Passed straight through to useNumpadField's own `earlyCommit` — auto-submits before
   *  `maxLength` is reached when the accumulated value already satisfies this predicate
   *  (e.g. SizeField's single-letter S/M/L codes). */
  earlyCommit?: (value: string) => boolean;
  /** When true, a committed non-empty value that isn't one of `options`' codes is rejected
   *  instead of committed: the field clears itself and `onInvalid` fires in place of
   *  `onChange`. Off by default — most callers (SDP's manual overrides, LII, etc.) let a
   *  worker type any code and rely on a later step to reject it; opt in only where the
   *  caller can guarantee `options` is the complete, current set of valid values (skipped
   *  automatically while `optionsLoading` is true, so a still-fetching reference list can't
   *  falsely reject a value that just hasn't loaded yet). */
  strict?: boolean;
  /** Required when `strict` is true — called with the rejected value in place of `onChange`. */
  onInvalid?: (code: string) => void;
  /** Applies the app-wide red-wash treatment (see `src/lib/invalidWash.ts`) instead of the
   *  plain active-only border — reserved for an actual validation failure the caller has
   *  already determined, same precedence as PAR's `FieldBox` (invalid wins over active). */
  invalid?: boolean;
}

/** Imperative handle so a caller can programmatically focus the field (e.g. PAR's
 *  screen-wide auto-advance chain) — mirrors LocationEntryFields' `autoFocus` prop intent,
 *  but as a direct call instead of a boolean-toggle prop, since the caller needs this to
 *  reliably re-fire on every chain pass rather than only the first. */
export interface CodePickerFieldHandle {
  focus: () => void;
}

/**
 * Shared free-text entry + dropdown-helper-popup field (issue #80): a worker can type a
 * value they already know (auto-committing at a fixed length, same as before), or tap the
 * helper button beside it to open a small anchored popup listing the available values
 * with their full names, then tap one to fill the field. Not a full-screen modal — this
 * app's design system reserves those for severe confirmations only.
 *
 * Used by StorageCodeField and SizeField, which each supply their own `options` (narrowed
 * or full) and entry-field specifics (maxLength, uppercasing, styling).
 */
export const CodePickerField = forwardRef<CodePickerFieldHandle, CodePickerFieldProps>(function CodePickerField({
  value, onChange, options, optionsLoading = false, panel, maxLength, transform, size = 'default', width, label, ariaLabel, disabled = false, closeOnAutoSubmit = false, earlyCommit, strict = false, onInvalid, invalid = false,
}, ref) {
  const field = useNumpadField(panel, maxLength, undefined, earlyCommit);
  const { hidePanel } = useNumpad();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => { field.set(value); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({ focus: focusField }));

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
    // explicit (a real OK/Enter, or a scan's trailing synthetic one) also closes the
    // panel — the worker/scan said they're done with this field, no need to wait for
    // them to tap elsewhere. A maxLength auto-submit (explicit=false) leaves the panel
    // open, matching the field's prior behavior (issue #80's original "commits via the
    // synthetic-Enter-on-refocus path" note) for a value that's merely full-length, not
    // necessarily confirmed.
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

  const boxHeight = size === 'compact' ? 'h-[52px]' : 'h-[64px]';
  const textSize = size === 'compact' ? 'text-[20px]' : 'text-[26px]';
  const boxWidth = width ?? (size === 'compact' ? 'w-[160px]' : 'w-[220px]');

  return (
    <div ref={wrapperRef} className={`relative flex flex-col gap-1 ${boxWidth}`}>
      {label && <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider text-center">{label}</span>}
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          onClick={focusField}
          disabled={disabled}
          aria-label={ariaLabel}
          className={`flex-1 min-w-0 flex items-center justify-center ${boxHeight} px-4 rounded-[12px] border-2 disabled:opacity-40 transition-colors ${
            invalid ? INVALID_WASH : field.isActive ? 'border-[#CC0000] bg-[#0D0D0D]' : 'border-[#3A3A3A] bg-[#0D0D0D] hover:border-[#555]'
          }`}
        >
          <span className={`font-data ${textSize} font-medium text-white tracking-[0.04em] truncate`}>
            {field.value || <span className="text-[#444]">—</span>}
          </span>
          {field.isActive && <span className="inline-block w-[2px] h-[24px] bg-[#CC0000] ml-2 animate-pulse rounded-sm shrink-0" />}
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={disabled}
          aria-label={`${ariaLabel ?? label ?? 'value'} options`}
          className={`shrink-0 w-[40px] ${boxHeight} rounded-[12px] border-2 disabled:opacity-40 flex items-center justify-center transition-colors ${open ? 'border-[#CC0000] text-white' : 'border-[#3A3A3A] text-[#9A9A9A] hover:border-[#555] hover:text-white'}`}
        >
          <span className="text-[13px]">▾</span>
        </button>
      </div>

      {open && (
        // min-w rather than matching the anchor's own (possibly compact) width — full
        // names shouldn't truncate just because the field itself sits in a tight bar
        // (e.g. STG's Master Control).
        <div className="absolute top-full left-0 mt-1 z-30 min-w-[240px] w-max max-w-[320px] max-h-[280px] overflow-y-auto bg-[#0D0D0D] border border-[#3A3A3A] rounded-[10px] shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
          {optionsLoading ? (
            <p className="font-ui text-[13px] text-[#9A9A9A] px-4 py-3 animate-pulse">Loading…</p>
          ) : options.length === 0 ? (
            <p className="font-ui text-[13px] text-[#555] px-4 py-3">No values available</p>
          ) : (
            options.map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => selectOption(opt.code)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-[#1A1A1A] transition-colors border-b border-[#1A1A1A] last:border-b-0"
              >
                <span className="font-data text-[15px] font-semibold text-white shrink-0">{opt.code}</span>
                <span className="font-ui text-[13px] text-[#9A9A9A] truncate">— {opt.desc}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
});
