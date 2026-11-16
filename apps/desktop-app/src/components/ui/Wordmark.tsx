/**
 * The PalletIQ Desktop wordmark, shared by the login screen and the shell's sidebar.
 *
 * @param size - "lg" for the login screen, "sm" for the sidebar
 */
export function Wordmark({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className={`font-bold tracking-tight ${size === 'lg' ? 'text-3xl' : 'text-xl'}`}>
        Pallet<span className="text-[var(--red-primary)]">IQ</span>
      </span>
      <span
        className={`font-semibold uppercase tracking-widest text-[var(--text-muted)] ${
          size === 'lg' ? 'text-sm' : 'text-[11px]'
        }`}
      >
        Desktop
      </span>
    </div>
  );
}
