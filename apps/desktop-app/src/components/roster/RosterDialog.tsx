import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface RosterDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  confirmDisabled?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** Extra buttons on the left of the footer (e.g. Clear section). */
  extra?: ReactNode;
}

/** The modal frame the roster's dialogs share: title, body, error, Cancel / confirm. Escape cancels. */
export function RosterDialog({
  title,
  children,
  confirmLabel,
  confirmDisabled,
  error,
  onConfirm,
  onCancel,
  extra,
}: RosterDialogProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-full w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-lg border border-[var(--border-strong)] bg-[var(--surface-3)] p-6"
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex flex-col gap-3 text-sm">{children}</div>
        {error && (
          <p
            role="alert"
            className="rounded border border-[var(--error-border)] bg-[var(--error-bg)] px-3 py-2 text-sm"
          >
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <div>{extra}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-9 rounded-md border border-[var(--border-strong)] px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-5)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirmDisabled}
              className="h-9 rounded-md bg-[var(--red-primary)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
