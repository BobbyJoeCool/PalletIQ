import { Outlet } from 'react-router-dom';
import { useAuth } from '../../context/authContext';
import { FloorAppToggle } from './FloorAppToggle';
import { SideNav } from './SideNav';
import { UserBadge } from './UserBadge';

/**
 * The authenticated app frame: left navigation, a header carrying the persistent Floor
 * App toggle, the signed-in user and Sign out, and the routed page in the main region.
 * Only rendered behind the route guard in App.tsx, so `user` is expected to be present.
 */
export function DesktopShell() {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-full bg-[var(--surface-0)]">
      <SideNav />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-end gap-4 border-b border-[var(--border-default)] bg-[var(--surface-2)] px-5">
          <FloorAppToggle />
          {user && <UserBadge user={user} />}
          <button
            type="button"
            onClick={logout}
            className="h-9 rounded-md border border-[var(--border-strong)] px-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-5)]"
          >
            Sign out
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
