import { Link } from 'react-router-dom';
import { useAuth } from '../context/authContext';
import { DESKTOP_SCREENS } from '../lib/screens';

/**
 * Landing page after sign-in: a greeting and a card per planned Manager screen, each
 * linking to that screen's (currently Coming Soon) page.
 */
export function HomePage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {user ? `Welcome, ${user.firstName}` : 'Welcome'}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          The Manager screens below are planned and not built yet.
        </p>
      </div>

      <ul className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
        {DESKTOP_SCREENS.map((screen) => (
          <li key={screen.id}>
            <Link
              to={`/screens/${screen.id}`}
              className="flex h-full flex-col gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-3)] p-4 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-4)]"
            >
              <span className="text-base font-semibold text-[var(--text-primary)]">
                {screen.title}
              </span>
              <span className="text-sm text-[var(--text-muted)]">{screen.summary}</span>
              <span className="mt-auto pt-1 text-xs text-[var(--text-disabled)]">
                Coming soon · #{screen.issue}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
