/**
 * API client for the desktop app. Paths are always relative (`/api/...`): the Vite dev
 * server proxies them in development and Electron's main process forwards them in a
 * built app (see electron/main.ts), so nothing here knows the API's real origin.
 */

/** The signed-in desktop user, as returned by `POST /api/auth/desktop-login`. */
export interface DesktopUser {
  zNumber: string;
  firstName: string;
  lastName: string;
  role: string;
  departmentId: string;
}

/** Error codes `desktopLogin` can throw as an Error message. */
export type DesktopLoginErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'NO_DESKTOP_ACCESS'
  | 'PASSWORD_NOT_SET'
  | 'INVALID_PASSWORD'
  | 'REQUEST_FAILED';

/**
 * Reads the `error` code out of a failed API response body.
 *
 * @param res - a non-OK fetch response
 * @returns the server's error code, or "REQUEST_FAILED" if the body has none
 */
async function readErrorCode(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => ({}));
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === 'string' ? error : 'REQUEST_FAILED';
}

/**
 * Generic authenticated API call for the Manager screens. Sends the session token as
 * `X-Auth-Token` (the header the API's `requireAuth` reads) and throws an Error whose
 * message is the server's error code on any non-OK response, with the HTTP status and
 * any extra response fields attached as `status`/`data`.
 *
 * @param path - API path relative to origin (e.g. "/api/items/123")
 * @param token - session token from the current login
 * @param opts - optional fetch options (method, body, extra headers)
 * @returns the parsed JSON response body typed as T
 * @throws Error whose message is the server's `error` field, or "REQUEST_FAILED"
 */
export async function apiFetch<T>(path: string, token: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': token,
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    const { error, ...data } = (body as { error?: string } | null) ?? {};
    throw Object.assign(new Error(error ?? 'REQUEST_FAILED'), { status: res.status, data });
  }
  return res.json() as Promise<T>;
}

/**
 * Signs into the desktop app with a zNumber + password.
 *
 * @param zNumber - employee z-number (e.g. "z002p23")
 * @param password - the user's desktop password, sent exactly as typed
 * @returns `{ token, user }` — a 12-hour session JWT and the signed-in user
 * @throws Error whose message is a {@link DesktopLoginErrorCode}
 */
export async function desktopLogin(
  zNumber: string,
  password: string
): Promise<{ token: string; user: DesktopUser }> {
  let res: Response;
  try {
    res = await fetch('/api/auth/desktop-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zNumber, password }),
    });
  } catch {
    // Network-level failure (API down, proxy refused) — same bucket as an unknown error.
    throw new Error('REQUEST_FAILED');
  }
  if (!res.ok) throw new Error(await readErrorCode(res));
  return res.json() as Promise<{ token: string; user: DesktopUser }>;
}
