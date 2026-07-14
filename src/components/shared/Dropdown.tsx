import { useState } from 'react';

interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

interface DropdownProps<T extends string> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  /** Optional label shown to the left of the control (uppercase tracking-wide, matching
   *  every other field label in the app). Omit for a bare dropdown with no caption. */
  label?: string;
  disabled?: boolean;
}

/**
 * Compact "text box with a dropdown" selector for a small, fixed set of choices — a
 * custom touch-friendly control rather than a native `<select>`, matching this app's
 * general avoidance of plain native form inputs outside DpciField's explicitly-justified
 * exception (see that component's docstring). Tapping the box reveals the option list
 * directly below it; tapping an option selects it and closes the list; tapping anywhere
 * else also closes it without changing the value.
 *
 * Generic over the option-value type, so each caller keeps full type safety on its own
 * value union (e.g. PIP's pull function `'CA' | 'CF' | 'FP'`).
 */
export function Dropdown<T extends string>({ value, options, onChange, label, disabled = false }: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <div className="relative inline-flex items-center gap-3">
      {label && (
        <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider whitespace-nowrap">
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className="flex items-center gap-3 h-[44px] pl-4 pr-3 rounded-[8px] bg-[#0D0D0D] border border-[#3A3A3A] disabled:opacity-40 transition-colors hover:border-[#555] active:scale-[0.98]"
      >
        <span className="font-data text-[18px] font-semibold text-white">{current?.label ?? value}</span>
        <span className={`text-[#9A9A9A] text-[12px] transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <>
          {/* Full-screen transparent backdrop — tapping anywhere outside the list closes it. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-full left-0 mt-1 min-w-full rounded-[8px] bg-[#0D0D0D] border border-[#3A3A3A] shadow-2xl overflow-hidden">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center px-4 h-[44px] font-data text-[18px] font-medium text-left whitespace-nowrap transition-colors ${
                  opt.value === value ? 'bg-[#1A1A1A] text-white' : 'text-[#CFCFCF] hover:bg-[#151515]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
