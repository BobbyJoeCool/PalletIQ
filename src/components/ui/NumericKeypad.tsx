/** The digit-value readout box above a numeric keypad grid — byte-identical between MNP's
 *  `LevelModal` and PIP's `LevelCorrectionDialog` before this extraction (Refactoring
 *  Audit finding F4). */
export function NumericReadout({ value }: { value: string }) {
  return (
    <div className="flex items-center justify-center h-[64px] mb-5 rounded-[12px] bg-[#0D0D0D] border-2 border-[#3A3A3A]">
      <span className="font-data text-[36px] font-medium text-white tracking-[0.1em]">
        {value || <span className="text-[#444]">—</span>}
      </span>
    </div>
  );
}

interface DigitGridProps {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  /** MNP's original keys are larger (h-80/text-34) than PIP's (h-64/text-26) — the two
   *  dialogs never matched on this, so both sizes are preserved rather than picking one. */
  keySize: 'large' | 'compact';
  /** Rendered in the grid's 12th cell (after backspace, 0) — MNP's own "Enter" button
   *  sits inside the grid itself. PIP's dialog instead renders its Cancel/Confirm row
   *  separately below the grid (it needs a Cancel option MNP's mandatory level entry
   *  doesn't), so it leaves this cell blank. */
  lastCell?: React.ReactNode;
  className?: string;
}

/**
 * The 1-9 + backspace + 0 (+ optional 12th cell) numeric keypad grid — shared mechanics
 * behind MNP's `LevelModal` and PIP's `LevelCorrectionDialog` (Refactoring Audit finding
 * F4). Each dialog's confirm/cancel row stays with the caller (see `lastCell`'s doc) since
 * the two genuinely differ there — MNP's level entry is mandatory, PIP's is a correction
 * the worker can back out of.
 */
export function DigitGrid({ onDigit, onBackspace, keySize, lastCell, className = '' }: DigitGridProps) {
  const height = keySize === 'large' ? 'h-[80px]' : 'h-[64px]';
  const digitText = keySize === 'large' ? 'text-[34px]' : 'text-[26px]';
  const symbolText = keySize === 'large' ? 'text-[20px]' : 'text-[18px]';
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className={`grid grid-cols-3 gap-3 ${className}`}>
      {keys.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onDigit(d)}
          className={`${height} rounded-[14px] bg-[#1F1F1F] border border-[#2C2C2C] text-white font-data ${digitText} font-medium hover:border-[#555] transition-colors active:scale-95`}
        >
          {d}
        </button>
      ))}
      <button
        type="button"
        onClick={onBackspace}
        className={`${height} rounded-[14px] bg-[#1F1F1F] border border-[#2C2C2C] text-white font-ui ${symbolText} font-medium hover:border-[#555] transition-colors active:scale-95`}
      >
        ⌫
      </button>
      <button
        type="button"
        onClick={() => onDigit('0')}
        className={`${height} rounded-[14px] bg-[#1F1F1F] border border-[#2C2C2C] text-white font-data ${digitText} font-medium hover:border-[#555] transition-colors active:scale-95`}
      >
        0
      </button>
      {lastCell ?? <span />}
    </div>
  );
}
