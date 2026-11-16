import { FLOOR_APP_ISSUE } from '../../lib/screens';

/**
 * The persistent Floor App toggle from the Embedded Floor App design: always on screen
 * in the shell's header, taskbar-style. It will open or restore the embedded floor-app
 * window once that feature is built; until then it is a disabled placeholder that holds
 * the control's place in the layout.
 */
export function FloorAppToggle() {
  const hint = `Embedded Floor App — coming soon (#${FLOOR_APP_ISSUE})`;
  return (
    <button
      type="button"
      disabled
      title={hint}
      aria-label={hint}
      className="flex h-9 cursor-not-allowed items-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--surface-4)] px-3 text-sm font-medium text-[var(--text-muted)]"
    >
      {/* Two overlapping window outlines — drawn inline so it never depends on a font glyph. */}
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
        <rect x="1" y="4" width="9" height="9" rx="1" />
        <path d="M4 4V2a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-2" />
      </svg>
      Floor App
    </button>
  );
}
