import { NavLink } from 'react-router-dom';
import { DESKTOP_SCREENS } from '../../lib/screens';
import { Wordmark } from '../ui/Wordmark';

/** Shared NavLink styling: a red left rule and a raised surface mark the current page. */
function navLinkClass({ isActive }: { isActive: boolean }): string {
  return [
    'flex items-center justify-between gap-2 border-l-2 px-4 py-2.5 text-sm transition-colors',
    isActive
      ? 'border-[var(--red-primary)] bg-[var(--surface-5)] font-semibold text-[var(--text-primary)]'
      : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-4)]',
  ].join(' ');
}

/**
 * The shell's left navigation: Home plus one entry per Manager screen in the registry.
 * A screen is tagged "Soon" until its own issue builds it out.
 */
export function SideNav() {
  return (
    <nav
      aria-label="Screens"
      className="flex w-64 shrink-0 flex-col border-r border-[var(--border-default)] bg-[var(--surface-2)] print:hidden"
    >
      <div className="flex h-14 shrink-0 items-center border-b border-[var(--border-default)] px-4">
        <Wordmark />
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <NavLink to="/" end className={navLinkClass}>
          Home
        </NavLink>

        <p className="px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-disabled)]">
          Manager screens
        </p>
        {DESKTOP_SCREENS.map((screen) => (
          <NavLink key={screen.id} to={`/screens/${screen.id}`} className={navLinkClass}>
            <span>{screen.title}</span>
            {!screen.built && (
              <span className="shrink-0 rounded border border-[var(--border-strong)] px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                Soon
              </span>
            )}
          </NavLink>
        ))}
      </div>

      <p className="shrink-0 border-t border-[var(--border-default)] px-4 py-2 text-[11px] text-[var(--text-disabled)]">
        v{__APP_VERSION__}
        {window.palletiqDesktop ? '' : ' · browser preview'}
      </p>
    </nav>
  );
}
