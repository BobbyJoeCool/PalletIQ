import { useFloorAppWindow } from '../../context/floorAppWindowContext';

/**
 * The persistent Floor App toggle from the Embedded Floor App design (#141): always on
 * screen in the shell's header, taskbar-style. It opens the embedded floor-app window,
 * brings it back when it has been minimized or closed, and tucks it away when it is
 * showing. A dot marks a floor app that is still running out of sight.
 *
 * Outside Electron (`npm run dev:web`) there is nothing to embed, so it is disabled.
 */
export function FloorAppToggle() {
  const { state, show, hide } = useFloorAppWindow();
  const available = Boolean(window.palletiqDesktop?.floorAppUrl);
  const visible = state === 'visible';

  const hint = !available
    ? 'The Floor App is only available in the desktop application'
    : visible
      ? 'Minimize the Floor App'
      : state === 'hidden'
        ? 'Restore the Floor App'
        : 'Open the Floor App';

  return (
    <button
      type="button"
      disabled={!available}
      onClick={visible ? hide : show}
      title={hint}
      aria-pressed={visible}
      className={[
        'flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        visible
          ? 'border-[var(--red-primary)] bg-[var(--red-primary)] text-white'
          : 'border-[var(--border-strong)] bg-[var(--surface-4)] text-[var(--text-secondary)] hover:bg-[var(--surface-5)]',
      ].join(' ')}
    >
      {/* Two overlapping window outlines — drawn inline so it never depends on a font glyph. */}
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      >
        <rect x="1" y="4" width="9" height="9" rx="1" />
        <path d="M4 4V2a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-2" />
      </svg>
      Floor App
      {state === 'hidden' && (
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
      )}
    </button>
  );
}
