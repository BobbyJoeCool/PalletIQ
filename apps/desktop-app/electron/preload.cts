import { contextBridge } from 'electron';

/**
 * Preload bridge — the only surface the sandboxed renderer gets from Electron.
 * CommonJS (`.cts` → `preload.cjs`) because sandboxed preload scripts can't be ES modules.
 *
 * Deliberately minimal: read-only facts about the host, so the UI can tell it is running
 * inside Electron rather than a plain browser tab (`npm run dev:web`), and knows where
 * the Embedded Floor App (#141) loads from. Anything that needs main-process work later
 * should be added here as a narrow, named function — never by exposing `ipcRenderer`.
 * The matching renderer-side type lives in src/vite-env.d.ts.
 */
/** Must match FLOOR_APP_URL_ARG in main.ts, which passes the URL as a process argument. */
const FLOOR_APP_URL_ARG = '--palletiq-floor-app-url=';
const floorAppUrl =
  process.argv.find((arg) => arg.startsWith(FLOOR_APP_URL_ARG))?.slice(FLOOR_APP_URL_ARG.length) ??
  '';

contextBridge.exposeInMainWorld('palletiqDesktop', {
  platform: process.platform,
  electronVersion: process.versions.electron,
  floorAppUrl,
});
