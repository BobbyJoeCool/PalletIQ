/**
 * Inline error message block. Announced to assistive tech as an alert when it appears.
 */
export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-[var(--error-border)] bg-[var(--error-bg)] px-3 py-2.5 text-sm text-[var(--text-primary)]"
    >
      {message}
    </div>
  );
}
