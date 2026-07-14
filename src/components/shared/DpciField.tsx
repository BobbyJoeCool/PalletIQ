export interface DpciValue { dept: string; class: string; item: string }

interface DpciFieldProps {
  value: DpciValue;
  onChange: (value: DpciValue) => void;
  /** `compact` for denser forms; `default` matches PII's original edit-mode sizing.
   *  Styling is variant-based, not free className passthrough (issue #78). */
  size?: 'compact' | 'default';
  label?: string;
}

/**
 * Shared 3-box DPCI entry (Dept-Class-Item) for editing, per issue #78 — extracted from
 * PII's edit mode (issue #21's three-separate-fields redesign). Plain native inputs are
 * intentional here, unlike most of this app's fields: DPCI correction is a deliberate,
 * infrequent IM+ admin edit typed in one sitting, not a scanned/queued touchscreen-only
 * field, so this doesn't fall under issue #6's on-screen-keyboard requirement.
 *
 * Read-only DPCI display is not part of this component — that's already handled by
 * `<LiveId type="dpci">` (see PII/MNP), which this is not a replacement for.
 */
export function DpciField({ value, onChange, size = 'default', label = 'DPCI' }: DpciFieldProps) {
  const boxHeight = size === 'compact' ? 'h-[40px]' : 'h-[44px]';
  const textSize = size === 'compact' ? 'text-[16px]' : 'text-[20px]';
  const inputClass = `font-data ${textSize} text-white bg-[#0D0D0D] border-2 border-[#3A3A3A] rounded-[8px] px-3 ${boxHeight} text-center focus:outline-none focus:border-[#CC0000]`;

  /**
   * Left-zero-pads a box to its fixed width on blur, so typing "5" and tabbing/tapping
   * away is accepted as "005" — the plain-native-input equivalent of the numpad system's
   * padOnSubmit behavior used everywhere else DPCI/Aisle/Bin-style fixed-width codes are
   * entered (see useNumpadField); this field has no OK/Enter to hook, so blur is the
   * closest analog to "the worker is done with this box."
   */
  function padOnBlur(field: keyof DpciValue, maxLength: number) {
    return () => {
      const v = value[field];
      if (v.length > 0 && v.length < maxLength) {
        onChange({ ...value, [field]: v.padStart(maxLength, '0') });
      }
    };
  }

  return (
    <div className="flex items-center gap-2">
      {label && <span className="w-[180px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">{label}</span>}
      <div className="flex items-center gap-2">
        <input aria-label="Dept" value={value.dept} onChange={(e) => onChange({ ...value, dept: e.target.value })} onBlur={padOnBlur('dept', 3)} maxLength={3} className={`${inputClass} w-[76px]`} />
        <span className="text-[#555]">-</span>
        <input aria-label="Class" value={value.class} onChange={(e) => onChange({ ...value, class: e.target.value })} onBlur={padOnBlur('class', 2)} maxLength={2} className={`${inputClass} w-[64px]`} />
        <span className="text-[#555]">-</span>
        <input aria-label="Item" value={value.item} onChange={(e) => onChange({ ...value, item: e.target.value })} onBlur={padOnBlur('item', 4)} maxLength={4} className={`${inputClass} w-[92px]`} />
      </div>
    </div>
  );
}
