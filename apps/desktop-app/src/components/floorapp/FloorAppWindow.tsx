import { useFloorAppWindow } from '../../context/floorAppWindowContext';
import { FloorAppWebview } from './FloorAppWebview';

/**
 * The Embedded Floor App's window (#141): title bar with minimize and close, and the
 * floor app beneath it, floating over the desktop app rather than replacing the page.
 *
 * Minimize and close both only hide it. The design asks that closing never lose the
 * user's place, and the floor app keeps its place simply by still running, so nothing is
 * destroyed until the user signs out of the desktop app. Nothing is rendered until the
 * first open, and nothing at all outside Electron (no `<webview>` in a plain browser).
 */
export function FloorAppWindow() {
  const { state, hide } = useFloorAppWindow();
  const floorAppUrl = window.palletiqDesktop?.floorAppUrl;

  if (state === 'unopened' || !floorAppUrl) return null;

  const visible = state === 'visible';

  const chromeButton =
    'flex h-6 w-7 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-6)] hover:text-[var(--text-primary)]';

  return (
    <section
      aria-label="Floor App"
      aria-hidden={!visible}
      // Hidden with `visibility`, not `display: none`: a webview that loses its layout
      // box reloads, which would throw away exactly the state this is meant to keep.
      className={[
        'fixed bottom-6 right-6 z-50 flex flex-col overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] shadow-[0_18px_60px_rgba(0,0,0,0.7)]',
        visible ? 'visible' : 'pointer-events-none invisible',
      ].join(' ')}
      // The floor app is a fixed 1366×1024 canvas that scales to fit; keep its 4:3 shape.
      style={{
        width: 'min(1100px, calc(100vw - 48px), calc((100vh - 120px) * 1366 / 1024))',
      }}
    >
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-default)] bg-[var(--surface-4)] pl-3 pr-1.5">
        <span className="text-sm font-medium text-[var(--text-secondary)]">Floor App</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={hide}
            aria-label="Minimize Floor App"
            title="Minimize"
            className={chromeButton}
          >
            <svg
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 12 12"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <path d="M2 9.5h8" />
            </svg>
          </button>
          <button
            type="button"
            onClick={hide}
            aria-label="Close Floor App"
            title="Close — keeps your place"
            className={chromeButton}
          >
            <svg
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 12 12"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
            </svg>
          </button>
        </div>
      </header>

      <div style={{ aspectRatio: '1366 / 1024' }}>
        <FloorAppWebview url={floorAppUrl} visible={visible} />
      </div>
    </section>
  );
}
