import { SIZES } from '../../lib/sizes';

interface SizeFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** `compact` matches STG's per-stack pallet-box styling; `default` matches full-screen
   *  filter bars (ELA). Styling is variant-based, not free className passthrough (issue #78). */
  size?: 'compact' | 'default';
  label?: string;
  ariaLabel?: string;
}

/** Shared Size dropdown (issue #78) — the fixed XS/HS/S/M/L set used identically by
 *  ELA/STG/SDP. */
export function SizeField({ value, onChange, size = 'default', label = 'Size', ariaLabel }: SizeFieldProps) {
  const boxHeight = size === 'compact' ? 'h-[52px]' : 'h-[64px]';
  const textSize = size === 'compact' ? 'text-[18px]' : 'text-[20px]';
  const width = size === 'compact' ? 'w-[120px]' : 'w-[160px]';

  return (
    <div className={`flex flex-col gap-1 ${width}`}>
      {label && <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider text-center">{label}</span>}
      <select
        aria-label={ariaLabel ?? label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${boxHeight} px-3 rounded-[10px] bg-[#0D0D0D] border-2 border-[#3A3A3A] font-data ${textSize} text-white text-center focus:outline-none focus:border-[#CC0000] transition-colors`}
      >
        <option value="">—</option>
        {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}
