const DIGIT_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
] as const;

const LETTER_KEYS = ['z', 'p', 'n'] as const;

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

export function ZnumPad({ value, onChange, onSubmit, disabled = false }: Props) {
  const handleKey = (key: string) => {
    if (disabled) return;
    if (key === '') return;
    if (key === '⌫') {
      // protect the leading 'z' prefix
      if (value.length > 1) onChange(value.slice(0, -1));
      return;
    }
    onChange(value + key);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {/* digit grid */}
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

      {/* letter row */}
      <div className="flex gap-2 mt-1">
        {LETTER_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => handleKey(key)}
            disabled={disabled}
            className="w-20 h-14 rounded-xl text-xl font-semibold uppercase bg-slate-600 text-slate-200 hover:bg-slate-500 active:bg-slate-400 disabled:opacity-40 transition-colors select-none"
          >
            {key}
          </button>
        ))}
      </div>

      {/* submit */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || value.length < 3}
        className="mt-2 w-64 h-14 rounded-xl text-lg font-bold bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-400 disabled:opacity-40 transition-colors select-none"
      >
        Continue
      </button>
    </div>
  );
}
