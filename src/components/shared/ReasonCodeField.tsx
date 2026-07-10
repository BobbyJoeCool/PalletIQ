import { useState } from 'react';
import { useNumpadField } from '../../lib/useNumpadField';

export interface ReasonCode { code: string; desc: string }

const OTHER = 'OTHER';

interface ReasonCodeFieldProps {
  /** The fixed code list for this domain (e.g. HOLD_REASON_CODES, EDIT_REASON_CODES) — never
   *  shared across domains, since the same code string can mean different things in each. */
  codes: ReasonCode[];
  /** The resolved final code: a selected dropdown code, or the typed custom code once
   *  "Type a code…" is chosen and confirmed. Empty string means no valid code yet. */
  value: string;
  onChange: (value: string) => void;
  /** `compact` for denser forms (e.g. an already-a-popup confirm dialog); `default` matches
   *  HoldPanel/PII's original sizing. Styling is variant-based, not free className passthrough
   *  (issue #78). */
  size?: 'compact' | 'default';
  label?: string;
}

/**
 * Shared reason-code entry (issue #78): a dropdown of fixed common codes plus a "Type a
 * code…" escape hatch, per this app's established precedent (HoldPanel, PII edit mode).
 * The custom-code field is driven by the app's own on-screen keyboard via useNumpadField,
 * not a native `<input>` — HoldPanel and PII's original versions both used a plain input
 * here, which is exactly issue #6's bug (pops the iPad's own keyboard instead of the app's);
 * consolidating onto this component fixes that in both places as a side effect of DRYing.
 */
export function ReasonCodeField({ codes, value, onChange, size = 'default', label = 'Reason Code' }: ReasonCodeFieldProps) {
  const isKnownCode = codes.some((c) => c.code === value);
  const [selection, setSelection] = useState(isKnownCode ? value : value ? OTHER : '');
  const customField = useNumpadField('keyboard');

  function selectCode(code: string) {
    setSelection(code);
    onChange(code === OTHER ? '' : code);
  }

  function focusCustomField() {
    customField.focus((v) => onChange(v.trim()));
  }

  const boxHeight = size === 'compact' ? 'h-[48px]' : 'h-[52px]';
  const textSize = size === 'compact' ? 'text-[15px]' : 'text-[18px]';

  return (
    <div className="flex flex-col gap-2">
      {label && <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">{label}</span>}
      <select
        aria-label={label}
        value={selection}
        onChange={(e) => selectCode(e.target.value)}
        className={`${boxHeight} px-3 rounded-[10px] bg-[#0D0D0D] border-2 border-[#3A3A3A] font-data ${textSize} text-white focus:outline-none focus:border-[#CC0000]`}
      >
        <option value="">Select a reason…</option>
        {codes.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.desc}</option>)}
        <option value={OTHER}>Type a code…</option>
      </select>
      {selection === OTHER && (
        <button
          type="button"
          onClick={focusCustomField}
          className={`flex items-center ${boxHeight} px-3 rounded-[10px] bg-[#0D0D0D] border-2 transition-colors ${customField.isActive ? 'border-[#CC0000]' : 'border-[#3A3A3A] hover:border-[#555]'}`}
        >
          <span className={`font-data ${textSize} text-white`}>
            {customField.value || <span className="text-[#444]">Reason code</span>}
          </span>
          {customField.isActive && <span className="inline-block w-[2px] h-[18px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
        </button>
      )}
    </div>
  );
}
