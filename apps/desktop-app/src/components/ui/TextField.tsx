import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';

interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'onChange' | 'className'> {
  label: string;
  value: string;
  /** Called with the new text on every edit. */
  onValueChange: (value: string) => void;
  /** Renders the value in the monospace data font (identifiers such as a zNumber). */
  mono?: boolean;
  /** Marks the field invalid: red border and `aria-invalid`. */
  invalid?: boolean;
}

/**
 * Labeled single-line text input for the desktop app — physical-keyboard entry, unlike
 * the floor app's numpad-driven fields. Covers plain text and masked (`type="password"`)
 * entry; any other native input attribute passes straight through.
 */
export function TextField({
  label,
  value,
  onValueChange,
  mono = false,
  invalid = false,
  ...inputProps
}: TextFieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
      >
        {label}
      </label>
      <input
        {...inputProps}
        id={id}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        aria-invalid={invalid || undefined}
        className={[
          'h-11 rounded-md border bg-[var(--surface-2)] px-3 text-base text-[var(--text-primary)]',
          'placeholder:text-[var(--text-disabled)] outline-none transition-colors',
          'focus:border-[var(--info)] disabled:opacity-60',
          mono ? 'font-data' : 'font-ui',
          invalid ? 'border-[var(--error-border)]' : 'border-[var(--border-strong)]',
        ].join(' ')}
      />
    </div>
  );
}
