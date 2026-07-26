// Login PIN-entry numpad — numeric only, no letter row.
// Layout: 7-8-9 / 4-5-6 / 1-2-3 / ⌫-0-OK
// Auto-submits at 4 digits (handled by parent via useEffect on value length).

const DIGIT_ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
] as const;

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Numeric PIN entry keypad used on the PIN screen.
 * Caps input at 4 digits; the parent screen auto-submits when length reaches 4.
 * The OK button is visually disabled until at least one digit has been entered,
 * though the parent's useEffect handles actual submission via length detection.
 *
 * @param value - Current PIN string (controlled by parent; parent owns the value)
 * @param onChange - Called with the updated PIN string on each key press
 * @param disabled - When true, all keys are visually disabled and non-interactive (used during async submit)
 */
export function PinPad({ value, onChange, disabled = false }: Props) {
  const hasInput = value.length > 0;

  /** Applies a single keypad press: backspace, or appends a digit up to the 4-digit cap. */
  const handleKey = (key: string) => {
    if (disabled) return;
    if (key === '⌫') { if (value.length > 0) onChange(value.slice(0, -1)); return; }
    if (value.length < 4) onChange(value + key);
  };

  const digitBtn =
    'flex-1 flex items-center justify-center h-[84px] rounded-[10px] ' +
    'bg-[#1F1F1F] border border-[#2C2C2C] ' +
    'font-data text-[32px] font-medium text-white ' +
    'select-none transition-colors active:scale-95 hover:bg-[#2A2A2A] disabled:opacity-40';

  return (
    <div className="flex flex-col gap-2.5 w-[520px]">
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
        <button type="button" onClick={() => handleKey('0')} disabled={disabled} className={digitBtn}>
          0
        </button>
        <button
          type="button"
          onClick={() => {/* auto-submits via useEffect in parent */}}
          disabled={disabled || !hasInput}
          className={[
            'flex-1 flex items-center justify-center h-[84px] rounded-[10px]',
            'font-ui text-[26px] font-semibold border border-[#2C2C2C]',
            'select-none transition-colors active:scale-95 disabled:cursor-default',
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
