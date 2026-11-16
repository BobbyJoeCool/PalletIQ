import { timeOfDay, timeOnShift } from '@shared/workforce';
import type { ShiftCode } from '@shared/workforce';

interface ShiftTimeInputProps {
  label: string;
  shiftCode: ShiftCode;
  date: string;
  value: number;
  onChange: (ms: number) => void;
  className?: string;
}

/**
 * A time-of-day box that reads and writes instants on a shift's timeline (#145): on a
 * night shift, a time after midnight lands on the next day. Steps in 15 minutes.
 */
export function ShiftTimeInput({
  label,
  shiftCode,
  date,
  value,
  onChange,
  className,
}: ShiftTimeInputProps) {
  return (
    <input
      type="time"
      step={900}
      aria-label={label}
      value={timeOfDay(value)}
      onChange={(e) => {
        if (e.target.value) onChange(timeOnShift(shiftCode, date, e.target.value));
      }}
      className={
        className ??
        'h-9 w-28 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-2 font-data text-sm text-[var(--text-primary)] outline-none focus:border-[var(--info)]'
      }
    />
  );
}
