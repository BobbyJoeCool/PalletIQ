import { contextBridge } from 'electron';

/**
 * Preload bridge — the only surface the sandboxed renderer gets from Electron.
 * CommonJS (`.cts` → `preload.cjs`) because sandboxed preload scripts can't be ES modules.
 *
 * Deliberately minimal for the bootstrap: read-only facts about the host, so the UI can
 * tell it is running inside Electron rather than a plain browser tab (`npm run dev:web`).
 * Anything that needs main-process work later (e.g. the Embedded Floor App window, #141)
 * should be added here as a narrow, named function — never by exposing `ipcRenderer`.
 * The matching renderer-side type lives in src/vite-env.d.ts.
 */
contextBridge.exposeInMainWorld('palletiqDesktop', {
  platform: process.platform,
  electronVersion: process.versions.electron,
});
