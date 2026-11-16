/// <reference types="vite/client" />

/** App version from package.json, injected at build time — see vite.config.ts's `define`. */
declare const __APP_VERSION__: string;

/** Host facts exposed by electron/preload.cts. Absent when running in a plain browser. */
interface PalletiqDesktopBridge {
  platform: string;
  electronVersion: string;
  /** Base URL the Embedded Floor App (#141) loads the floor app from. */
  floorAppUrl: string;
}

interface Window {
  palletiqDesktop?: PalletiqDesktopBridge;
}
