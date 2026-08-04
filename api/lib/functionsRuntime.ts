import express from 'express';
import type { Request, Response } from 'express';

/**
 * Drop-in replacement for the `@azure/functions` v4 programming model, built on a real
 * Express server underneath (2026-08-03 — nothing in this project deploys to Azure
 * anymore, so `func start` + Azurite were pure dev-runtime overhead with zero remaining
 * payoff). Every one of the app's 43 HTTP handlers and its 1 timer job were written
 * against Azure's specific request shape (`req.url` as an absolute URL, `req.headers.get()`,
 * async `req.json()`) — rather than rewrite all of that across 16 files, this module
 * reconstructs the same shape on top of Express, so every existing handler file only needed
 * a 1-line import-path change (`from '@azure/functions'` → `from '../lib/functionsRuntime.js'`)
 * and nothing else.
 *
 * Only implements the subset of the real `@azure/functions` API this codebase actually
 * uses — confirmed by grep before writing this: every registration is `app.http()` (single-
 * element `methods`, always `authLevel: 'anonymous'`, which meant nothing outside Azure's
 * own key-based auth anyway) or, once, `app.timer()`. No blob/queue/serviceBus triggers
 * anywhere.
 */

export type Role = string;

/** The subset of Azure's `HttpRequest` every handler in this codebase reads. */
export interface HttpRequest {
  /** Always a full absolute URL (dummy `http://localhost` host — nothing in this codebase
   *  ever reads `.hostname`/`.protocol`/`.port` off it, only `.pathname`/`.searchParams`),
   *  so every existing `new URL(req.url).searchParams` call site keeps working unchanged. */
  url: string;
  headers: { get(name: string): string | null };
  params: Record<string, string>;
  /** Express's `express.json()` middleware already parses the body before the handler
   *  runs; this just hands back the parsed value wrapped in a resolved promise to match
   *  every existing `await req.json()` call site. */
  json(): Promise<unknown>;
}

export interface HttpResponseInit {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
}

export type HttpHandler = (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;

/** Only `.log()`/`.error()` are ever called anywhere in this codebase (confirmed by grep,
 *  both only in `reservationTimer.ts`) — every other handler's `ctx`/`_ctx` param goes
 *  unread, so this is the entire surface that needs a real implementation. */
export interface InvocationContext {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/** Azure's timer-trigger metadata type — never actually read anywhere in this codebase
 *  (`reservationTimer.ts`'s handler takes it as `_timer`), so an empty stub is sufficient. */
export type Timer = Record<string, never>;

const context: InvocationContext = {
  log: (...args) => console.log(...args),
  error: (...args) => console.error(...args),
};

const expressApp = express();
expressApp.use(express.json({ limit: '5mb' }));

/**
 * Translates Azure's `{param}` / `{param:int}` route syntax to Express's plain `:param`.
 * Express 5's router (path-to-regexp v8) dropped the old inline `:id(\d+)` regex-constraint
 * syntax Azure's `:int` would otherwise map to, so the numeric-only constraint is just
 * dropped here rather than reproduced — every handler that reads an int route param
 * already does its own `parseInt`/`isNaN` check and throws `400 INVALID_INPUT` (confirmed
 * by reading them), so a non-numeric id now gets that specific error instead of a bare
 * Express 404 — a strictly more informative response, not a functional gap. Also prefixes
 * every route with `/api/`, Azure Functions' own default HTTP route prefix, which is why
 * the Vite dev proxy and every frontend call already assume it.
 */
function toExpressPath(azureRoute: string): string {
  const withParams = azureRoute.replace(/\{([^:}]+)(:int)?\}/g, (_match, name: string) => `:${name}`);
  return `/api/${withParams}`;
}

function buildRequest(req: Request): HttpRequest {
  return {
    url: `http://localhost${req.originalUrl}`,
    headers: {
      get: (name) => (req.headers[name.toLowerCase()] as string | undefined) ?? null,
    },
    // This app's routes never use wildcard/repeated segments, so a param is always a
    // single string in practice — Express's own type is broader (`string | string[]`) to
    // account for routes that do.
    params: req.params as Record<string, string>,
    json: async () => req.body as unknown,
  };
}

function sendResponse(res: Response, init: HttpResponseInit): void {
  res.status(init.status ?? 200);
  if (init.headers) res.set(init.headers);
  res.send(init.body ?? '');
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';

interface HttpOptions {
  methods: HttpMethod[];
  /** Accepted for source compatibility with every existing registration — always
   *  `'anonymous'` in this codebase, and meaningless outside Azure's own key-based auth
   *  (this app has always done its own JWT auth via `requireAuth()` regardless). */
  authLevel?: string;
  route: string;
  handler: HttpHandler;
}

/**
 * Queued rather than registered immediately (2026-08-03, real bug found live: "Aisle does
 * not exist" on aisles that do exist). Express matches routes in **registration order**,
 * first match wins — unlike Azure Functions' own router, which picks the most specific
 * match regardless of registration order. `locations.ts` registers `GET locations/{id:int}`
 * before `GET locations/aisle-exists`/`empty-by-aisle`/`empty-by-zone`/`range-count` (source
 * order, matching the old file layout, never a problem under Azure) — once `:int`'s numeric
 * constraint had to be dropped (see `toExpressPath`'s own comment), `:id` started swallowing
 * every one of those literal single-segment routes whole, since it matches any string.
 * Deferring registration to `listen()` and sorting by specificity there (fewer `:param`
 * segments first) fixes this class of bug generally, not just this one route pair — no
 * source file needs to know or care about registration order.
 */
const pendingRoutes: { method: Lowercase<HttpMethod>; path: string; handler: (req: Request, res: Response) => void }[] = [];

interface TimerOptions {
  /** Only `'0 * * * * *'` (every minute) is ever used — see the `app.timer` doc comment
   *  below for why that's the only schedule this shim supports. */
  schedule: string;
  handler: (timer: Timer, ctx: InvocationContext) => Promise<void>;
}

export const app = {
  http(_name: string, options: HttpOptions): void {
    const path = toExpressPath(options.route);
    const method = options.methods[0].toLowerCase() as Lowercase<HttpMethod>;
    pendingRoutes.push({
      method,
      path,
      handler: (req, res) => {
        void options.handler(buildRequest(req), context).then(
          (init) => sendResponse(res, init),
          (err) => {
            context.error(`Unhandled error in ${_name}:`, err);
            res.status(500).json({ error: 'INTERNAL_ERROR' });
          },
        );
      },
    });
  },

  /**
   * The only schedule this codebase ever registers is every minute — implemented via a
   * plain `setInterval` rather than pulling in a cron dependency for one job. This is
   * intentionally approximate (fires ~60s after startup, then every 60s — not aligned to
   * wall-clock `:00` the way Azure's real timer trigger is) which is functionally
   * equivalent here: `clearExpiredReservations` (`reservationTimer.ts`) just needs to run
   * roughly once a minute to keep a 5-minute reservation timeout tight.
   */
  timer(name: string, options: TimerOptions): void {
    if (options.schedule !== '0 * * * * *') {
      throw new Error(`functionsRuntime.app.timer('${name}'): only the every-minute schedule ('0 * * * * *') is supported`);
    }
    setInterval(() => {
      void options.handler({}, context).catch((err) => context.error(`Unhandled error in timer ${name}:`, err));
    }, 60_000);
  },

  /** Starts listening — called once from `index.ts` after every `./functions/*.js` side-
   *  effect import has registered its routes/timer. Registers every queued route onto the
   *  real Express app first, sorted so routes with fewer `:param` segments (more literal,
   *  more specific) register before ones with more — a stable sort, so routes with equal
   *  specificity keep their original relative order. See `pendingRoutes`' own comment for
   *  why this sort exists at all. */
  listen(port: number): void {
    const paramCount = (path: string) => (path.match(/:/g) ?? []).length;
    const sorted = [...pendingRoutes].sort((a, b) => paramCount(a.path) - paramCount(b.path));
    for (const { method, path, handler } of sorted) expressApp[method](path, handler);
    expressApp.listen(port, () => context.log(`API listening on http://localhost:${port}`));
  },
};
