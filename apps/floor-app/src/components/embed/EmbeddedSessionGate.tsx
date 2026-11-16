import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { isEmbeddedInDesktop, requestHostSession } from '../../lib/embedHost';

/**
 * Signs the embedded floor app in with the desktop app's session (Embedded Floor App,
 * #141) in place of the badge/PIN screens. Outside the desktop app it renders its
 * children untouched.
 *
 * Embedded, it holds the app back until the desktop app has handed over its session, so
 * the route guard never sees "no token" and never shows the login screen. It asks again
 * whenever the token is cleared — the floor app's own Logout button therefore lands back
 * on the main menu with a fresh tree rather than on a login screen the desktop user has
 * no badge for.
 */
export function EmbeddedSessionGate({ children }: { children: React.ReactNode }) {
  const { token, login } = useAuth();
  const embedded = isEmbeddedInDesktop();
  // Bumped by Retry to re-run the request after a failure.
  const [attempt, setAttempt] = useState(0);
  const [failedAttempt, setFailedAttempt] = useState<number | null>(null);

  useEffect(() => {
    if (!embedded || token) return;
    let cancelled = false;
    requestHostSession()
      .then((session) => { if (!cancelled) login(session.token, session.user); })
      .catch(() => { if (!cancelled) setFailedAttempt(attempt); });
    return () => { cancelled = true; };
  }, [embedded, token, login, attempt]);

  if (!embedded || token) return <>{children}</>;

  const failed = failedAttempt === attempt;
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-black">
      <span className="font-ui text-[30px] text-[#CFCFCF]">
        {failed ? 'Could not sign in from PalletIQ Desktop.' : 'Signing in…'}
      </span>
      {failed && (
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="flex items-center justify-center h-[68px] px-8 rounded-[10px] bg-[#CC0000] font-ui text-[22px] font-medium text-white hover:bg-[#AA0000]"
        >
          Retry
        </button>
      )}
    </div>
  );
}
