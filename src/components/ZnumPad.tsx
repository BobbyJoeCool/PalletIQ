// Login identifier-entry numpad.
// Layout: P/N/X letter row → 7-8-9 → 4-5-6 → 1-2-3 → ⌫-0-OK
// OK activates once value has characters beyond the hardcoded 'z' prefix.

const LETTER_KEYS = ['P', 'N', 'X'] as const;
const DIGIT_ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
] as const;

interface Props {
  value: string;       // always starts with 'z'
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

/**
 * zNumber entry keypad used on the Login screen.
 * Layout: P/N/X letter row → 7-8-9 → 4-5-6 → 1-2-3 → ⌫-0-OK.
 * The value always starts with a hardcoded 'z' prefix; backspace cannot remove it.
 * Letters P, N, X append lowercase suffix characters (e.g., 'p', 'n', 'x').
 * OK activates once at least one character beyond 'z' is entered, and fires onSubmit.
 *
 * @param value - Current zNumber string (always starts with 'z'; controlled by parent)
 * @param onChange - Called with the updated zNumber string on each key press
 * @param onSubmit - Called when the OK button is tapped (parent triggers the identify API call)
 * @param disabled - When true, all keys are visually disabled and non-interactive (used during async identify)
 */
export function ZnumPad({ value, onChange, onSubmit, disabled = false }: Props) {
  const hasInput = value.length > 1;

  const handleKey = (key: string) => {
    if (disabled) return;
    if (key === '⌫') {
      if (value.length > 1) onChange(value.slice(0, -1));
      return;
    }
    onChange(value + key.toLowerCase());
  };

  const letterBtn =
    'flex-1 flex items-center justify-center h-[82px] rounded-[10px] ' +
    'bg-[#1F1F1F] border border-[#303030] ' +
    'font-data text-[28px] font-semibold text-[#BBBBBB] ' +
    'select-none transition-colors active:scale-95 hover:bg-[#2A2A2A] disabled:opacity-40';

  const digitBtn =
    'flex-1 flex items-center justify-center h-[84px] rounded-[10px] ' +
    'bg-[#1F1F1F] border border-[#2C2C2C] ' +
    'font-data text-[32px] font-medium text-white ' +
    'select-none transition-colors active:scale-95 hover:bg-[#2A2A2A] disabled:opacity-40';

  return (
    <div className="flex flex-col gap-2.5 w-[504px]">
      {/* P / N / X letter row */}
      <div className="flex gap-2.5">
        {LETTER_KEYS.map((key) => (
          <button key={key} type="button" onClick={() => handleKey(key)} disabled={disabled} className={letterBtn}>
            {key}
          </button>
        ))}
      </div>

      {/* 7-8-9 / 4-5-6 / 1-2-3 */}
      {DIGIT_ROWS.map((row) => (
        <div key={row[0]} className="flex gap-2.5">
          {row.map((key) => (
            <button key={key} type="button" onClick={() => handleKey(key)} disabled={disabled} className={digitBtn}>
              {key}
            </button>
          ))}
        </div>
      ))}

      {/* ⌫ / 0 / OK */}
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => handleKey('⌫')}
          disabled={disabled}
          className="flex-1 flex items-center justify-center h-[84px] rounded-[10px] bg-[#1F1F1F] border border-[#2C2C2C] font-data text-[26px] text-[#BBBBBB] select-none transition-colors active:scale-95 hover:bg-[#2A2A2A] disabled:opacity-40"
        >
          ⌫
        </button>
        <button
          type="button"
          onClick={() => handleKey('0')}
          disabled={disabled}
          className={digitBtn}
        >
          0
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !hasInput}
          className={[
            'flex-1 flex items-center justify-center h-[84px] rounded-[10px]',
            'font-ui text-[26px] font-semibold',
            'border border-[#2C2C2C] select-none transition-colors active:scale-95 disabled:cursor-default',
            hasInput && !disabled
              ? 'bg-[#CC0000] text-white hover:bg-[#AA0000]'
              : 'bg-[#1F1F1F] text-[#444444]',
          ].join(' ')}
        >
          OK
        </button>
      </div>
    </div>
  );
}
