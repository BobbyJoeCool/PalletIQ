import { useEffect } from 'react';
import { useNumpadField } from '../../lib/useNumpadField';

interface PalletIdFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** `compact` for inline use alongside other fields; `default` matches PII/MNP's full-size
   *  entry box. Styling is variant-based, not free className passthrough (issue #78). */
  size?: 'compact' | 'default';
  label?: string;
}

/** Shared Pallet ID entry field (issue #78) — numpad-driven, variable length (no fixed
 *  maxLength/auto-commit, since Pallet IDs aren't a uniform length); matches PII's original
 *  entry box. */
export function PalletIdField({ value, onChange, size = 'default', label = 'Pallet ID' }: PalletIdFieldProps) {
  const field = useNumpadField('numpad');
  useEffect(() => { field.set(value); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  function focusField() {
    field.focus((v) => onChange(v.trim()));
  }

  const boxHeight = size === 'compact' ? 'h-[52px]' : 'h-[64px]';
  const textSize = size === 'compact' ? 'text-[20px]' : 'text-[26px]';
  const width = size === 'compact' ? 'w-[180px]' : 'w-[260px]';

  return (
    <div className={`flex flex-col gap-1 ${width}`}>
      {label && <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider">{label}</span>}
      <button
        type="button"
        onClick={focusField}
        className={`flex items-center ${boxHeight} w-full px-5 rounded-[12px] bg-[#0D0D0D] border-2 transition-colors ${field.isActive ? 'border-[#CC0000]' : 'border-[#3A3A3A] hover:border-[#555]'}`}
      >
        <span className={`font-data ${textSize} font-medium text-white`}>
          {field.value || <span className="text-[#444]">—</span>}
        </span>
        {field.isActive && <span className="inline-block w-[2px] h-[28px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
      </button>
    </div>
  );
}
