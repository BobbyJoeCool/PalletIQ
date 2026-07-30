import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useNumpadField } from '../../lib/useNumpadField';
import { useDemoSlot } from '../../context/FooterDemoContext';
import { NumpadFieldBox } from './NumpadFieldBox';
import { DemoScannerBar } from './DemoScannerBar';

interface PalletIdFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** `compact` for inline use alongside other fields; `default` matches PII's original
   *  full-size entry box. Styling is variant-based, not free className passthrough (issue
   *  #78) — `boxClass`/`valueClass`/`caretClass`/`width` below are the escape hatch for a
   *  screen whose existing box dimensions don't match either preset (SDP/MNP/PIP all share
   *  one larger size, distinct from both of these), matching `NumpadFieldBox`'s own fully-
   *  parameterized-dimensions philosophy — every screen sized its boxes independently long
   *  before this extraction existed. */
  size?: 'compact' | 'default';
  /** Overrides `size`'s box height/padding/corner-radius, e.g. `h-[72px] px-5 rounded-[12px]`. */
  boxClass?: string;
  /** Overrides `size`'s value text classes, e.g. `text-[32px] font-medium tracking-[0.04em]`. */
  valueClass?: string;
  /** Overrides `size`'s caret bar dimensions, e.g. `w-[3px] h-[38px]`. */
  caretClass?: string;
  /** Overrides `size`'s wrapper width class, e.g. `w-[300px]`. */
  width?: string;
  label?: string;
  disabled?: boolean;
  /** Applies the app-wide red-wash treatment (see `src/lib/invalidWash.ts`) instead of the
   *  plain active-only border — reserved for an actual validation failure the caller has
   *  already determined (e.g. not-found/canceled/pull-pending), same precedence as every
   *  other washed field in the app. */
  invalid?: boolean;
  /** Fires reactively whenever the field's own internal focus state changes — e.g. PIP's
   *  footer demo-button set is keyed off which of its several fields currently has the
   *  numpad, which it can no longer read directly as `pidField.isActive` now that this
   *  field owns its own internal numpad instance. Mirrors `onValidityChange`'s pattern
   *  (Feature 10): a reactive callback for a caller to hook, not something the field owns
   *  or gates behavior on itself. */
  onActiveChange?: (active: boolean) => void;
  /** Opt-in (Feature 9, Phase 1): the field internally registers the shared Pallet ID Demo
   *  Scanner (`DemoScannerBar`) into the footer's demo slot whenever it's focused, filling
   *  results via `onChange` — same as a real scan. Off by default so a screen that already
   *  owns its own compound-submit demo buttons (PIP — its "valid" demo must return the
   *  specific pallet tied to the currently-loaded label, which the generic scanner has no
   *  way to know, see `Feature-9-AppWide-Demo-Scanner.md`'s Implementation-detail
   *  resolutions) isn't forced into an undefined last-write-wins race between this field's
   *  own registration and its own screen-level one. */
  demoScanner?: boolean;
  /** SDP's own aisle-aware "Valid Pallet ID" (direct instruction) — only meaningful when
   *  `demoScanner` is true; passed straight through to `DemoScannerBar`'s own `aisle` prop.
   *  Omitted by every other consumer (PII has no `PalletIdField` render at all; MNP has no
   *  aisle context to give). */
  demoAisle?: string;
}

/** Imperative handle so a caller can programmatically (re-)focus the field — e.g. after a
 *  screen transitions back to its ready state. Mirrors `CodePickerFieldHandle`. */
export interface PalletIdFieldHandle {
  focus: () => void;
}

/** Exported so a self-validating hook consumer (`usePalletIdField`, e.g. PII) that renders
 *  its own `NumpadFieldBox` directly — rather than this component — can match the same
 *  box dimensions without hand-copying the literal classes. */
export const PALLET_ID_SIZE_PRESETS = {
  compact: { boxClass: 'h-[52px] px-5 rounded-[12px]', valueClass: 'text-[20px] font-medium', caretClass: 'w-[2px] h-[24px]', width: 'w-[180px]' },
  default: { boxClass: 'h-[64px] px-5 rounded-[12px]', valueClass: 'text-[26px] font-medium', caretClass: 'w-[2px] h-[28px]', width: 'w-[260px]' },
} as const;

/** Shared Pallet ID entry field (issue #78) — numpad-driven, variable length (no fixed
 *  maxLength/auto-commit, since Pallet IDs aren't a uniform length); built on the same
 *  shared `NumpadFieldBox` primitive PIP/SDP/MNP's own local `FieldDisplay` wrappers
 *  already use, rather than hand-rolling its own button markup. Rendering/markup only —
 *  issue #158's own scope decision: unlike Storage Code/Size, none of this app's 4 consumer
 *  screens has a Pallet ID validity check that exists independent of a larger compound
 *  operation (a directed put, a manual scan, a pull verify), so each screen still computes
 *  and passes its own `invalid`/error handling; this component doesn't own an internal
 *  async lookup the way `useCodePickerField` owns a list-membership check. */
export const PalletIdField = forwardRef<PalletIdFieldHandle, PalletIdFieldProps>(function PalletIdField({
  value, onChange, size = 'default', boxClass, valueClass, caretClass, width, label = 'Pallet ID', disabled = false, invalid = false, onActiveChange, demoScanner = false, demoAisle,
}, ref) {
  const field = useNumpadField('numpad');
  useEffect(() => { field.set(value); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onActiveChange?.(field.isActive); }, [field.isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  function focusField() {
    field.focus((v) => onChange(v.trim()));
  }

  useImperativeHandle(ref, () => ({ focus: focusField }));

  // `onChange` read via ref rather than a direct dependency — SDP/MNP don't (and shouldn't
  // need to) wrap their own onChange in useCallback just to keep this memo stable; see
  // Feature-9-AppWide-Demo-Scanner.md's Implementation-detail resolutions.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const fillFromDemo = useCallback((v: string) => onChangeRef.current(v), []);
  const demoSlot = useMemo(
    () => (demoScanner && field.isActive ? <DemoScannerBar onFill={fillFromDemo} aisle={demoAisle} /> : null),
    [demoScanner, field.isActive, fillFromDemo, demoAisle],
  );
  useDemoSlot(demoSlot);

  const preset = PALLET_ID_SIZE_PRESETS[size];

  return (
    <NumpadFieldBox
      label={label}
      value={field.value}
      onFocus={focusField}
      active={field.isActive}
      disabled={disabled}
      invalid={invalid}
      width={width ?? preset.width}
      boxClass={boxClass ?? preset.boxClass}
      valueClass={valueClass ?? preset.valueClass}
      caretClass={caretClass ?? preset.caretClass}
    />
  );
});
