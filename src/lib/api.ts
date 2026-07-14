/**
 * Generic authenticated API call helper. Attaches the session token to every request
 * and throws an Error with the server's error code as its message on non-OK responses.
 * The thrown error's message is the string callers check (e.g. "PALLET_MISMATCH"). Any
 * additional fields the server attached alongside `error` (see api/lib/response.ts's
 * withHandler `data` support) are attached to the thrown error's `data` property, for
 * error codes that carry more than just a code (e.g. LEVEL_MISMATCH's scanned/actual level).
 *
 * Sent as `X-Auth-Token` rather than the standard `Authorization` header — Azure Static
 * Web Apps' Managed Functions proxy overwrites `Authorization` with its own internal
 * system token before forwarding to the Functions runtime, so our own token never
 * arrives if sent that way. See api/lib/permissions.ts's requireAuth for the full story.
 *
 * @param path - API path relative to origin (e.g. "/api/labels/123")
 * @param token - Session token from the current login
 * @param opts - Optional fetch options (method, body, additional headers)
 * @returns Parsed JSON response body typed as T
 * @throws Error whose message is the server's `error` field, or "REQUEST_FAILED" for parse errors
 */
export async function apiFetch<T>(
  path: string,
  token: string,
  opts?: RequestInit,
): Promise<T> {
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
    const { error, ...data } = (body as { error?: string }) ?? {};
    const code = error ?? 'REQUEST_FAILED';
    throw Object.assign(new Error(code), { status: res.status, data });
  }
  return res.json() as Promise<T>;
}

export interface AuthUser {
  zNumber: string;
  firstName: string;
  lastName: string;
  role: string;
}

/**
 * Sends a zNumber to the identify endpoint and returns the user's name.
 * Used by LoginPage to look up the user before asking for their PIN.
 * Does not require an auth token — this is the first step of the login flow.
 *
 * @param zNumber - Employee z-number from badge scan or numpad entry (e.g. "z002p23")
 * @returns `{ firstName, lastName }` from the matching user record
 * @throws Error with message "NOT_FOUND" if no user matches; "REQUEST_FAILED" for other errors
 */
export async function identify(zNumber: string): Promise<{ firstName: string; lastName: string }> {
  const res = await fetch('/api/auth/identify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zNumber }),
  });
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error('REQUEST_FAILED');
  return res.json() as Promise<{ firstName: string; lastName: string }>;
}

/**
 * Submits a zNumber + PIN pair to the login endpoint and returns a session token and user record.
 * Called automatically when the user enters their 4th PIN digit on the PIN screen.
 *
 * @param zNumber - The employee z-number (must match the value from the identify step)
 * @param pin - The 4-digit PIN string
 * @returns `{ token, user }` — token is a 15-minute HS256 JWT; user includes zNumber, name, and role
 * @throws Error with message "INVALID_PIN" on wrong PIN; "NOT_FOUND" if user not found; "REQUEST_FAILED" otherwise
 */
export async function loginWithPin(
  zNumber: string,
  pin: string,
): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zNumber, pin }),
  });
  if (res.status === 401) throw new Error('INVALID_PIN');
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error('REQUEST_FAILED');
  return res.json() as Promise<{ token: string; user: AuthUser }>;
}

/**
 * Hits the unauthenticated health-check endpoint to force Azure SQL serverless to resume
 * if it's currently auto-paused. Called from the login screen's "Wake database" link — a
 * cold resume can take up to a minute, so this lets a worker warm the database before
 * attempting to log in, rather than having the identify/login calls themselves time out.
 *
 * @throws Error with message "REQUEST_FAILED" if the health check itself fails
 */
export async function wakeDatabase(): Promise<void> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error('REQUEST_FAILED');
}

export interface ReseedResult {
  putPalletsCreated: number;
  labelsCreated: number;
  labelsByStorageCodeAndFunction: Record<string, number>;
  locationsStaged: number;
  aislesStaged: number;
}

/**
 * Hits the unauthenticated test-data reseed endpoint, called from the login screen's
 * dev-tools strip. Wipes all PUT_PENDING pallets and not-yet-pulled labels (AVAILABLE/
 * PRINTED) and regenerates a fresh, randomized set of both, and unstages/restages a
 * randomized subset of every aisle with backdated staging timestamps. Destructive — see
 * `api/functions/demo-reseed.ts` for exactly what's deleted and recreated.
 *
 * @throws Error with message "REQUEST_FAILED" if the request itself fails
 */
export async function reseedTestData(): Promise<ReseedResult> {
  const res = await fetch('/api/demo/reseed', { method: 'POST' });
  if (!res.ok) throw new Error('REQUEST_FAILED');
  return res.json() as Promise<ReseedResult>;
}
