import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload for the Embedded Floor App's `<webview>` (GitHub #141) — runs inside the floor
 * app's page, not the desktop renderer. It is the floor app's only link to the desktop
 * app: one function that asks the host for its current session, so the floor app can
 * sign the same user in without a badge/PIN. The session travels over the webview's
 * host channel and never appears in a URL.
 *
 * The floor-app side of this contract is apps/floor-app/src/lib/embedHost.ts; the host
 * side is src/components/floorapp/FloorAppWebview.tsx. The two channel names below are
 * repeated there (this file compiles on its own and cannot import from src/).
 * main.ts attaches this preload itself, to floor-app URLs only.
 */

/** Guest → host: "send me your session". */
const REQUEST_SESSION_CHANNEL = 'palletiq:request-session';
/** Host → guest: the session, as `{ token, user }`. */
const SESSION_CHANNEL = 'palletiq:session';

contextBridge.exposeInMainWorld('palletiqEmbed', {
  /**
   * Asks the desktop app for its current session.
   *
   * @returns whatever the host replied with — the floor app validates the shape itself
   */
  requestSession: (): Promise<unknown> =>
    new Promise((resolve) => {
      ipcRenderer.once(SESSION_CHANNEL, (_event, session: unknown) => resolve(session));
      ipcRenderer.sendToHost(REQUEST_SESSION_CHANNEL);
    }),
});
