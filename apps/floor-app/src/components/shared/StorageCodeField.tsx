import { useStorageCodes } from '../../lib/useStorageCodes';
import { useAisleFreightTypes } from '../../lib/useAisleFreightTypes';
import { CodePickerField, type CodeOption } from './CodePickerField';

interface StorageCodeFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Dependency prop (Feature 10) — when given, the field narrows its own options list to
   *  codes actually present in this aisle, fetching and computing that itself via
   *  `useAisleFreightTypes` rather than the caller pre-filtering and handing down a
   *  narrowed `options` list. `null`/omitted means no narrowing context yet — falls back
   *  to the full reference list, same as before. */
  aisle?: number | null;
  /** When `aisle` is given: by default (false) the popup list narrows to codes present in
   *  this aisle for convenience, but *validity* is still checked against the full
   *  reference list — a real code just absent from this aisle isn't "invalid," it's a
   *  valid code that happens to return an empty result here (e.g. ELZ's read-only zone
   *  report). Set true where the value must actually resolve *within this aisle* to be
   *  usable at all (e.g. STG, where a stack's Storage Code must be placeable in its own
   *  aisle) — then the popup list and the valid list are the same narrowed one. */
  strictToAisle?: boolean;
  /** Escape hatch: an explicit, caller-supplied options list wins over `aisle`-based
   *  narrowing entirely — for a context this component's own `aisle` narrowing doesn't
   *  cover. No current caller needs this; prefer `aisle` for the common case. */
  options?: CodeOption[];
  /** `compact` matches STG's Master Control bar; `default` matches full-screen filter bars
   *  (ELA/ELZ/LII). Styling is variant-based, not free className passthrough (issue #78). */
  size?: 'compact' | 'default';
  /** Overrides the width Tailwind class `size` would otherwise pick — see CodePickerField. */
  width?: string;
  label?: string;
  disabled?: boolean;
  /** Opt-in: dismiss the keyboard as soon as the 2nd character commits, not just on an
   *  explicit Enter/OK — see CodePickerField's own doc. Off by default; every existing
   *  call site (SDP/STG/LII/ELZ) keeps today's behavior unless it opts in. */
  closeOnAutoSubmit?: boolean;
  /** See CodePickerField's own doc — rejects a typed value not present in `options`
   *  (or the full reference list, if `options` is omitted) instead of committing it. */
  strict?: boolean;
  onInvalid?: (code: string) => void;
  /** See `useCodePickerField`'s own doc — fires reactively on the field's own computed
   *  validity, independent of `strict` (Feature 10). */
  onValidityChange?: (invalid: boolean) => void;
  /** See CodePickerField's own doc — forces the wash on top of the field's own internal
   *  value-vs-options check; not needed for the ordinary case (Feature 10). */
  invalid?: boolean;
}

/**
 * Shared 2-character Storage Code entry field (issue #78) — keyboard-driven, uppercases and
 * auto-commits at 2 characters via useNumpadField's maxLength, matching the fixed-length
 * field convention already used identically across ELA/ELZ/STG/SDP/LII. A helper button
 * opens a dropdown popup of available codes with full names (issue #80) — narrowed to
 * what's actually present in `aisle` when given (computed internally, Feature 10), an
 * explicit `options` override, or the full `GET /api/storage-codes` reference list
 * otherwise.
 */
export function StorageCodeField({ value, onChange, aisle, strictToAisle = false, options, size = 'default', width, label = 'Storage Code', disabled = false, closeOnAutoSubmit = false, strict = false, onInvalid, onValidityChange, invalid = false }: StorageCodeFieldProps) {
  // Always called (Rules of Hooks) — its cached result is simply unused once `options` or
  // `aisle`-based narrowing supplies a list instead.
  const fullList = useStorageCodes();
  // Always called too (Rules of Hooks) — internally no-ops (returns null) while `aisle`
  // is null/omitted.
  const aisleTypes = useAisleFreightTypes(aisle ?? null);

  const narrowedByAisle = aisle != null && aisleTypes && fullList
    ? fullList.filter((c) => aisleTypes.storageCodes.includes(c.code))
    : undefined;
  const resolvedOptions = options ?? narrowedByAisle ?? fullList ?? [];
  // Validity check target — narrowed list only when the caller opted into strictToAisle;
  // otherwise always the full reference list, regardless of aisle narrowing (see the
  // strictToAisle doc above for why these two lists can legitimately differ).
  const validOptions = options ?? (strictToAisle ? narrowedByAisle : fullList) ?? [];
  const optionsLoading = options
    ? false
    : aisle != null
      ? aisleTypes === null || fullList === null
      : fullList === null;

  return (
    <CodePickerField
      value={value}
      onChange={onChange}
      options={resolvedOptions}
      validOptions={validOptions}
      optionsLoading={optionsLoading}
      panel="keyboard"
      maxLength={2}
      transform={(v) => v.toUpperCase()}
      size={size}
      width={width}
      label={label}
      ariaLabel={label}
      disabled={disabled}
      closeOnAutoSubmit={closeOnAutoSubmit}
      strict={strict}
      onInvalid={onInvalid}
      onValidityChange={onValidityChange}
      invalid={invalid}
    />
  );
}
