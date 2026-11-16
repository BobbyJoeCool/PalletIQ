import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { TextField } from '../components/ui/TextField';
import { Wordmark } from '../components/ui/Wordmark';
import { useAuth } from '../context/authContext';
import { desktopLogin } from '../lib/api';

/** User-facing text for each error code `desktopLogin` can throw. */
const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  INVALID_INPUT: 'Enter both your zNumber and your password.',
  NOT_FOUND: 'No team member found for that zNumber.',
  NO_DESKTOP_ACCESS:
    'This account does not have desktop access. PalletIQ Desktop is limited to LWW, OM, ICQA and System Admin.',
  PASSWORD_NOT_SET:
    'No desktop password has been set for this account. Ask a System Admin to set one.',
  INVALID_PASSWORD: 'Incorrect password.',
};

/** Shown for anything else: the API being down, or an unexpected server error. */
const FALLBACK_ERROR_MESSAGE = 'Sign-in failed. Check that the API is running and try again.';

/**
 * Desktop sign-in: zNumber + password on one form, typed on a physical keyboard (no
 * numpad, no badge scan — those belong to the floor app's kiosk login). On success the
 * session is stored and the route guard takes the user into the shell.
 */
export function LoginPage() {
  const { token, login } = useAuth();
  const [zNumber, setZNumber] = useState('');
  const [password, setPassword] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in (restored session, or this very login just succeeded).
  if (token) return <Navigate to="/" replace />;

  /** Submits the form to the API and records either the session or the error code. */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedZNumber = zNumber.trim().toLowerCase();
    if (!trimmedZNumber || !password) {
      setErrorCode('INVALID_INPUT');
      return;
    }

    setSubmitting(true);
    setErrorCode(null);
    try {
      const result = await desktopLogin(trimmedZNumber, password);
      login(result.token, result.user);
    } catch (err) {
      setErrorCode(err instanceof Error ? err.message : 'REQUEST_FAILED');
      // A wrong password is retyped from scratch; any other failure keeps what was typed.
      if (err instanceof Error && err.message === 'INVALID_PASSWORD') setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  const zNumberInvalid = errorCode === 'NOT_FOUND' || errorCode === 'NO_DESKTOP_ACCESS';
  const passwordInvalid = errorCode === 'INVALID_PASSWORD';

  return (
    <div className="flex h-full items-center justify-center bg-[var(--surface-0)] p-6">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex w-full max-w-sm flex-col gap-5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-3)] p-8"
      >
        <div className="flex flex-col gap-1.5">
          <Wordmark size="lg" />
          <h1 className="text-sm font-normal text-[var(--text-muted)]">Sign in to continue</h1>
        </div>

        <TextField
          label="zNumber"
          value={zNumber}
          onValueChange={setZNumber}
          mono
          invalid={zNumberInvalid}
          autoFocus
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={7}
          placeholder="z000x00"
          disabled={submitting}
        />

        <TextField
          label="Password"
          type="password"
          value={password}
          onValueChange={setPassword}
          invalid={passwordInvalid}
          autoComplete="current-password"
          disabled={submitting}
        />

        {errorCode && (
          <ErrorBanner message={LOGIN_ERROR_MESSAGES[errorCode] ?? FALLBACK_ERROR_MESSAGE} />
        )}

        <button
          type="submit"
          disabled={submitting}
          className="h-11 rounded-md bg-[var(--red-primary)] text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-center text-xs text-[var(--text-disabled)]">v{__APP_VERSION__}</p>
      </form>
    </div>
  );
}
