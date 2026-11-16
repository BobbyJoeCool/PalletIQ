import { Navigate, useParams } from 'react-router-dom';
import { findScreen } from '../lib/screens';

/**
 * Stand-in page for a planned Manager screen that has not been built yet. Looks the
 * screen up by the URL slug; an unknown slug goes back to Home.
 */
export function ComingSoonPage() {
  const { screenId } = useParams();
  const screen = findScreen(screenId);

  if (!screen) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 pt-10">
      <span className="w-fit rounded border border-[var(--warning-border)] bg-[var(--warning-bg)] px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-[var(--warning)]">
        Coming soon
      </span>
      <h1 className="text-2xl font-semibold">{screen.title}</h1>
      <p className="text-base text-[var(--text-secondary)]">{screen.summary}</p>
      <p className="text-sm text-[var(--text-muted)]">
        This screen is not built yet. Tracked as issue #{screen.issue}.
      </p>
    </div>
  );
}
