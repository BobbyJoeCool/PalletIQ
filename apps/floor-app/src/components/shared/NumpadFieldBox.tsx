import { INVALID_WASH } from '../../lib/invalidWash';

export interface NumpadFieldBoxProps {
  /** Current field value; renders an em-dash placeholder when empty. */
  value: string;
  /** Called on tap; should register the field's submit handler with the numpad. */
  onFocus: () => void;
  /** Field label, rendered above the box. Whether this prop is *passed at all* (not just
   *  truthy) decides whether a wrapping div exists: omit it entirely for a bare button
   *  with no wrapper (PII's Edit-mode boxes, which show their label via a separate
   *  `DataRow`/inline span) — pass `label=""` to keep the wrapping div (and its `width`)
   *  without rendering visible label text (PAR's DPCI/Expiration Date chained boxes). */
  label?: string;
  /** Shows the blinking caret + red border when true (and not disabled/invalid). */
  active?: boolean;
  disabled?: boolean;
  /** Applies the app-wide red-wash treatment (see `src/lib/invalidWash.ts`) instead of
   *  the plain active-only border — invalid wins over active, same precedence as every
   *  other washed field in the app. */
  invalid?: boolean;
  /** Wrapping width class, e.g. `w-[160px]`. Applied to the label+box wrapper when a
   *  label is present (the box itself stretches to fill it), or directly to the box when
   *  there's no label. Omit to size from the parent flex layout instead. */
  width?: string;
  /** Box height/padding/corner-radius classes, e.g. `h-[72px] px-5 rounded-[12px]` —
   *  every screen sizes its boxes slightly differently, so this has no default. */
  boxClass: string;
  /** Value text classes (size/weight/tracking), e.g. `text-[32px] font-medium
   *  tracking-[0.04em]` — appended to the shared `font-data text-white` base. */
  valueClass: string;
  /** Caret bar width+height classes, e.g. `w-[3px] h-[38px]`. */
  caretClass: string;
  /** Label text size class. Defaults to `text-[14px]` (PIP/SDP/MNP's shared size). */
  labelClass?: string;
  /** Centers the value/caret within the box and the label above it — STG's Master
   *  Control bar and PII's Edit-mode boxes use this; every other screen left-aligns. */
  centered?: boolean;
}

/**
 * Shared "label above a bordered box, red border + blinking caret when active, optional
 * invalid-red wash" numpad-driven entry field — the pattern independently reinvented as
 * PIPPage/SDPPage/MNPPage's `FieldDisplay`, STGPage's Master Control `FieldDisplay`,
 * PARPage's `FieldBox`, PIIPage's `EditBox`, and WLHPage's `RangeNumBox` before this
 * extraction (Refactoring Audit finding F1). Every screen sizes its boxes differently, so
 * dimensions are fully parameterized rather than baked in — this component owns the
 * shared *behavior* (active/disabled/invalid precedence, caret visibility, placeholder)
 * so a future behavioral change only needs editing here instead of in 7 files.
 */
export function NumpadFieldBox({
  value,
  onFocus,
  label,
  active = false,
  disabled = false,
  invalid = false,
  width,
  boxClass,
  valueClass,
  caretClass,
  labelClass = 'text-[14px]',
  centered = false,
}: NumpadFieldBoxProps) {
  const hasWrapper = label !== undefined;

  const box = (
    <button
      type="button"
      onClick={onFocus}
      disabled={disabled}
      className={`flex items-center ${centered ? 'justify-center' : ''} ${boxClass} border-2 disabled:opacity-40 transition-colors ${!hasWrapper && width ? width : ''} ${
        invalid ? INVALID_WASH : active && !disabled ? 'border-[#CC0000] bg-[#0D0D0D]' : 'border-[#3A3A3A] bg-[#0D0D0D] hover:border-[#555]'
      }`}
    >
      <span className={`font-data text-white ${valueClass}`}>
        {value || <span className="text-[#444]">—</span>}
      </span>
      {active && !disabled && (
        <span className={`inline-block ${caretClass} bg-[#CC0000] ml-2 animate-pulse rounded-sm`} />
      )}
    </button>
  );

  if (!hasWrapper) return box;

  return (
    <div className={`flex flex-col gap-1 ${width ?? ''} ${centered ? 'items-center' : ''}`}>
      {label && (
        <span className={`font-ui ${labelClass} font-medium text-[#9A9A9A] uppercase tracking-wider ${centered ? 'text-center' : ''}`}>
          {label}
        </span>
      )}
      {box}
    </div>
  );
}
