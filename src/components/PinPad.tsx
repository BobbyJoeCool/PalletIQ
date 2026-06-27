const DIGIT_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
] as const;

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function PinPad({ value, onChange, disabled = false }: Props) {
  const handleKey = (key: string) => {
    if (disabled) return;
    if (key === '') return;
    if (key === '⌫') {
      if (value.length > 0) onChange(value.slice(0, -1));
      return;
    }
    if (value.length < 4) onChange(value + key);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {DIGIT_ROWS.map((row, ri) => (
        <div key={ri} className="flex gap-2">
          {row.map((key, ki) => (
            <button
              key={ki}
              type="button"
              onClick={() => handleKey(key)}
              disabled={disabled || key === ''}
              className={`
                w-20 h-20 rounded-xl text-2xl font-semibold select-none
                ${key === ''
                  ? 'invisible'
                  : key === '⌫'
                  ? 'bg-slate-700 text-slate-200 hover:bg-slate-600 active:bg-slate-500'
                  : 'bg-slate-700 text-white hover:bg-slate-600 active:bg-slate-500'}
                disabled:opacity-40 transition-colors
              `}
            >
              {key}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
