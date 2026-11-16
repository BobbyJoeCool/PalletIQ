import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { NOT_FOR_STORAGE_REASONS } from '@shared/aisleSetup';
import type { NotForStorageReason } from '@shared/aisleSetup';
import { displayLocationId } from '@shared/location';

interface CarveOutDialogProps {
  location: string;
  busy: boolean;
  error: string | null;
  onSubmit: (reason: NotForStorageReason, note: string) => void;
  onCancel: () => void;
}

/**
 * Asks why a location is being marked Not For Storage (#143): a required reason, and a
 * note that is required for Other. Escape cancels.
 */
export function CarveOutDialog({ location, busy, error, onSubmit, onCancel }: CarveOutDialogProps) {
  const [reason, setReason] = useState<NotForStorageReason | null>(null);
  const [note, setNote] = useState('');
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const needsNote = reason === 'OTHER' && !note.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason && !needsNote) onSubmit(reason, note.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Mark Not For Storage"
        onSubmit={handleSubmit}
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-3)] p-6"
      >
        <div>
          <h2 className="text-lg font-semibold">Mark Not For Storage</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            <span className="font-data">{displayLocationId(location)}</span> will accept no freight
            until an OM or ICQA restores it.
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Reason
          </legend>
          {NOT_FOR_STORAGE_REASONS.map((r, i) => (
            <label key={r.code} className="flex items-center gap-2 text-sm">
              <input
                ref={i === 0 ? firstRef : undefined}
                type="radio"
                name="reason"
                value={r.code}
                checked={reason === r.code}
                onChange={() => setReason(r.code)}
              />
              {r.label}
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Note {reason === 'OTHER' ? '(required)' : '(optional)'}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={255}
            className="h-9 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-2 text-sm font-normal normal-case tracking-normal text-[var(--text-primary)] outline-none focus:border-[var(--info)]"
          />
        </label>

        {error && (
          <p
            role="alert"
            className="rounded border border-[var(--error-border)] bg-[var(--error-bg)] px-3 py-2 text-sm"
          >
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-md border border-[var(--border-strong)] px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-5)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !reason || needsNote}
            className="h-9 rounded-md bg-[var(--red-primary)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            Mark Not For Storage
          </button>
        </div>
      </form>
    </div>
  );
}
