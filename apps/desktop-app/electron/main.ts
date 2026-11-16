import { app, BrowserWindow, net, protocol, shell } from 'electron';
import { existsSync, statSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Electron main process for PalletIQ Desktop.
 *
 * Two ways of loading the renderer:
 *   - `--dev` (npm run dev): the window points at the Vite dev server, which serves the
 *     UI with HMR and proxies `/api/*` to the local API itself (see vite.config.ts).
 *   - otherwise (npm start, or a packaged build): the built `dist/` is served over a
 *     private `app://` scheme registered below.
 *
 * Why a custom scheme rather than `file://`: the renderer calls the API with relative
 * `/api/...` paths, exactly like the floor app. Under `file://` those would resolve to
 * the filesystem, and pointing them at an absolute API URL instead would need CORS
 * support the API doesn't have. Serving the UI from `app://palletiq/` and forwarding
 * `app://palletiq/api/*` to the real API from here keeps the renderer code identical
 * in dev and production and keeps the API origin out of the renderer entirely.
 */

/** Vite dev server origin — must match `server.port` in vite.config.ts. */
const DEV_SERVER_URL = 'http://localhost:5174';

/** Scheme + host the built renderer is served from in production. */
const APP_SCHEME = 'app';
const APP_ORIGIN = `${APP_SCHEME}://palletiq`;

/**
 * Base URL of the PalletIQ API that `/api/*` requests are forwarded to in production.
 * Overridable so a packaged build can target a deployed API instead of a local one.
 */
const API_BASE_URL = (process.env.PALLETIQ_API_URL ?? 'http://localhost:7071').replace(/\/+$/, '');

/**
 * Where the floor app (apps/floor-app) is served from, for the Embedded Floor App window
 * (#141). Defaults to the floor app's own Vite dev server; a packaged build points this
 * at wherever the floor app is deployed. That server proxies the floor app's `/api/*`
 * calls itself, so nothing here forwards them.
 */
const FLOOR_APP_URL = (process.env.PALLETIQ_FLOOR_APP_URL ?? 'http://localhost:5173').replace(
  /\/+$/,
  ''
);
const FLOOR_APP_ORIGIN = new URL(FLOOR_APP_URL).origin;

/** Argument the main window's preload reads the floor-app URL from (see preload.cts). */
const FLOOR_APP_URL_ARG = '--palletiq-floor-app-url=';

/** Built renderer output (`vite build`), a sibling of this file's own `dist-electron/`. */
const RENDERER_DIST = join(import.meta.dirname, '..', 'dist');

/**
 * Content-Security-Policy applied to the production renderer's HTML. Scripts are
 * same-origin only. Styles allow inline (React `style` props) and Google Fonts, which
 * src/index.css imports for IBM Plex. `connect-src 'self'` holds because API calls go
 * to this same `app://` origin and are forwarded from the main process. `frame-src`
 * admits the one embedded origin: the floor app, inside its webview.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  `frame-src ${FLOOR_APP_ORIGIN}`,
].join('; ');

const isDev = process.argv.includes('--dev');

// Must run before the app is ready. `standard` gives the scheme real origin/relative-URL
// semantics (so BrowserRouter and localStorage work), `secure` treats it like https.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

/**
 * Forwards a renderer `/api/*` request to the real API, preserving method, headers
 * (including `X-Auth-Token`) and body.
 *
 * @param request - the intercepted `app://palletiq/api/...` request
 * @param url - that request's parsed URL
 * @returns the API's response, or a 502 JSON error if the API is unreachable
 */
async function forwardToApi(request: Request, url: URL): Promise<Response> {
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  try {
    return await net.fetch(`${API_BASE_URL}${url.pathname}${url.search}`, {
      method: request.method,
      headers: request.headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
    });
  } catch {
    return new Response(JSON.stringify({ error: 'API_UNREACHABLE' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Serves a file out of the built renderer. Any path that is not an existing file falls
 * back to `index.html`, so client-side routes (e.g. `/screens/audit-tool`) survive a
 * reload. Paths that would resolve outside the renderer directory are refused.
 *
 * @param url - the intercepted `app://palletiq/...` URL
 * @returns the file's contents; `index.html` is returned with the CSP header attached
 */
async function serveRendererFile(url: URL): Promise<Response> {
  const requested = normalize(join(RENDERER_DIST, decodeURIComponent(url.pathname)));
  if (requested !== RENDERER_DIST && !requested.startsWith(RENDERER_DIST + sep)) {
    return new Response('Forbidden', { status: 403 });
  }

  const isFile = existsSync(requested) && statSync(requested).isFile();
  if (isFile) return net.fetch(pathToFileURL(requested).toString());

  const index = await net.fetch(pathToFileURL(join(RENDERER_DIST, 'index.html')).toString());
  return new Response(index.body, {
    status: index.status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    },
  });
}

/** Registers the `app://` handler: `/api/*` is forwarded to the API, the rest is static. */
function registerAppProtocol(): void {
  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return forwardToApi(request, url);
    return serveRendererFile(url);
  });
}

/**
 * Creates the single main window and loads the renderer into it. The renderer runs
 * sandboxed with context isolation and no Node integration; anything it needs from the
 * main process goes through the preload bridge (electron/preload.cts).
 */
function createMainWindow(): void {
  const rendererOrigin = isDev ? DEV_SERVER_URL : APP_ORIGIN;

  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#000000',
    title: 'PalletIQ Desktop',
    webPreferences: {
      preload: join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The Embedded Floor App is a <webview>; what may attach is restricted below.
      webviewTag: true,
      additionalArguments: [`${FLOOR_APP_URL_ARG}${FLOOR_APP_URL}`],
    },
  });

  // Only the floor app may be embedded, and always with this app's own guest preload
  // and locked-down settings — whatever attributes the <webview> tag itself carried.
  window.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    if (!isFloorAppUrl(params.src)) {
      event.preventDefault();
      return;
    }
    webPreferences.preload = join(import.meta.dirname, 'floorAppPreload.cjs');
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
  });

  // The app never opens child windows of its own; an http(s) link goes to the system
  // browser and everything else is dropped.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Keep the main window on the app's own origin — block any navigation away from it.
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(rendererOrigin)) event.preventDefault();
  });

  void window.loadURL(`${rendererOrigin}/`);
}

/**
 * @param url - a URL a webview wants to load or navigate to
 * @returns true if it is on the floor app's origin
 */
function isFloorAppUrl(url: string): boolean {
  try {
    return new URL(url).origin === FLOOR_APP_ORIGIN;
  } catch {
    return false;
  }
}

// Keep the embedded floor app on its own origin and without child windows, the same
// rules the main window follows.
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return;
  contents.on('will-navigate', (event, url) => {
    if (!isFloorAppUrl(url)) event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

void app.whenReady().then(() => {
  if (!isDev) registerAppProtocol();
  createMainWindow();

  // macOS: re-create the window when the dock icon is clicked and none are open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

// Quit when the last window closes, except on macOS where apps conventionally stay open.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
