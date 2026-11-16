import type { AuthUser } from './api';

/**
 * Bridge to the PalletIQ Desktop app when this floor app runs embedded inside it (the
 * Embedded Floor App, GitHub #141). The desktop app loads this build in an Electron
 * `<webview>` whose preload script (apps/desktop-app/electron/floorAppPreload.cts)
 * exposes `window.palletiqEmbed`; on a tablet or in a plain browser that global does not
 * exist, and everything here reports "not embedded".
 */

/** A session handed over by the desktop app: its own already-issued JWT and user. */
export interface HostSession {
  token: string;
  user: AuthUser;
}

/** What the desktop app's webview preload exposes. The reply is untrusted until checked. */
interface PalletiqEmbedBridge {
  requestSession: () => Promise<unknown>;
}

declare global {
  interface Window {
    palletiqEmbed?: PalletiqEmbedBridge;
  }
}

/** How long to wait for the desktop app to answer before reporting a failure. */
const HOST_SESSION_TIMEOUT_MS = 10_000;

/**
 * @returns true when this floor app is running inside the desktop app's embedded window
 */
export function isEmbeddedInDesktop(): boolean {
  return typeof window.palletiqEmbed?.requestSession === 'function';
}

/**
 * Checks that a value received from the desktop app has the shape of a session.
 *
 * @param value - whatever the bridge resolved with
 * @returns true if it carries a token string and a user with the AuthUser fields
 */
function isHostSession(value: unknown): value is HostSession {
  if (typeof value !== 'object' || value === null) return false;
  const { token, user } = value as { token?: unknown; user?: unknown };
  if (typeof token !== 'string' || token.length === 0) return false;
  if (typeof user !== 'object' || user === null) return false;
  const u = user as Record<string, unknown>;
  return (
    typeof u.zNumber === 'string' &&
    typeof u.firstName === 'string' &&
    typeof u.lastName === 'string' &&
    typeof u.role === 'string'
  );
}

/**
 * Asks the desktop app for its current session, so the embedded floor app can sign the
 * same user in without the badge/PIN step. The token is the desktop login's own JWT —
 * the same `{ zNumber, role }` token every API endpoint already accepts.
 *
 * @returns the desktop app's session
 * @throws Error "NOT_EMBEDDED" outside the desktop app, "HOST_SESSION_TIMEOUT" if the
 *   desktop app does not answer in time, "HOST_SESSION_INVALID" if the reply is malformed
 */
export async function requestHostSession(): Promise<HostSession> {
  const bridge = window.palletiqEmbed;
  if (!bridge) throw new Error('NOT_EMBEDDED');

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('HOST_SESSION_TIMEOUT')), HOST_SESSION_TIMEOUT_MS);
  });

  try {
    const reply = await Promise.race([bridge.requestSession(), timeout]);
    if (!isHostSession(reply)) throw new Error('HOST_SESSION_INVALID');
    return reply;
  } finally {
    clearTimeout(timer);
  }
}
