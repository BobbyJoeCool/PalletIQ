import { useEffect } from 'react';
import { useNumpadField } from '../../lib/useNumpadField';

interface StorageCodeFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** `compact` matches STG's Master Control bar; `default` matches full-screen filter bars
   *  (ELA/ELZ/LII). Styling is variant-based, not free className passthrough (issue #78). */
  size?: 'compact' | 'default';
  label?: string;
}

/**
 * Shared 2-character Storage Code entry field (issue #78) — keyboard-driven, uppercases and
 * auto-commits at 2 characters via useNumpadField's maxLength, matching the fixed-length
 * field convention already used identically across ELA/ELZ/STG/SDP/LII.
 */
export function StorageCodeField({ value, onChange, size = 'default', label = 'Storage Code' }: StorageCodeFieldProps) {
  const field = useNumpadField('keyboard', 2);
  useEffect(() => { field.set(value); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  function focusField() {
    field.focus((v) => onChange(v.trim().toUpperCase()));
  }

  const boxHeight = size === 'compact' ? 'h-[52px]' : 'h-[64px]';
  const textSize = size === 'compact' ? 'text-[20px]' : 'text-[26px]';
  const width = size === 'compact' ? 'w-[160px]' : 'w-[220px]';

  return (
    <div className={`flex flex-col gap-1 ${width}`}>
      {label && <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider text-center">{label}</span>}
      <button
        type="button"
        onClick={focusField}
        className={`flex items-center justify-center ${boxHeight} px-4 rounded-[12px] bg-[#0D0D0D] border-2 transition-colors ${field.isActive ? 'border-[#CC0000]' : 'border-[#3A3A3A] hover:border-[#555]'}`}
      >
        <span className={`font-data ${textSize} font-medium text-white tracking-[0.04em]`}>
          {field.value || <span className="text-[#444]">—</span>}
        </span>
        {field.isActive && <span className="inline-block w-[2px] h-[24px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
      </button>
    </div>
  );
}
