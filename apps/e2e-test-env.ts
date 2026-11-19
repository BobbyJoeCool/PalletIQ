/**
 * Shared E2E database mode for both apps' Playwright configs (issue #236).
 *
 * Default, "test" mode: the suites run against an isolated Docker MySQL (port 3307, see
 * docker-compose.test.yml). Playwright starts its own test API on :7072 (after
 * `npm run test:db:up` has started, synced and — first time only — seeded the database)
 * and its own floor-app dev server on :5175 proxied to that API, so the dev servers on
 * :7071 / :5173 / :5174 and the dev database are never touched.
 *
 * "dev" mode, `E2E_DB=dev`: the old behaviour — no servers are started; the suites expect
 * the dev API on :7071 and floor app on :5173 already running, against the dev database.
 * Kept for smoke runs on real data.
 */
import type { PlaywrightTestConfig } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const E2E_DEV_MODE = process.env.E2E_DB === 'dev';

const ROOT = dirname(fileURLToPath(import.meta.url));
export const API_DIR = resolve(ROOT, '../api');
export const FLOOR_APP_DIR = resolve(ROOT, 'floor-app');

export const E2E_API_URL = E2E_DEV_MODE ? 'http://localhost:7071' : 'http://localhost:7072';
export const E2E_FLOOR_APP_URL = E2E_DEV_MODE ? 'http://localhost:5173' : 'http://localhost:5175';

type WebServer = Extract<NonNullable<PlaywrightTestConfig['webServer']>, unknown[]>[number];

/** The test API: brings the test DB up first, then serves on :7072 with api/.env.test. */
export const testApiServer: WebServer = {
  command: 'npm run test:db:up && npm run start:test',
  cwd: API_DIR,
  url: `${E2E_API_URL}/api/health`,
  reuseExistingServer: true,
  // A first run pulls the MySQL image and seeds ~56k locations.
  timeout: 600_000,
  stdout: 'ignore',
  stderr: 'pipe',
};

/** The floor app's Vite dev server on :5175, proxying /api to the test API. */
export const testFloorAppServer: WebServer = {
  command: 'npx vite --port 5175 --strictPort',
  cwd: FLOOR_APP_DIR,
  url: E2E_FLOOR_APP_URL,
  reuseExistingServer: true,
  timeout: 120_000,
  env: { PALLETIQ_API_URL: E2E_API_URL },
};

/** The servers Playwright should start: none in dev mode. */
export function e2eWebServers(servers: WebServer[]): WebServer[] | undefined {
  return E2E_DEV_MODE ? undefined : servers;
}

/**
 * Regenerates the demo data (containers, pending pallets, held/staged locations, today's
 * worker activity) through the API's own reseed endpoint, the same as the floor app's
 * "Reseed Test Data" button. Test mode only: the dev database is reseeded by hand.
 * `E2E_SKIP_RESEED=1` skips it when rerunning a single spec.
 */
export async function reseedTestDatabase(): Promise<void> {
  if (E2E_DEV_MODE || process.env.E2E_SKIP_RESEED === '1') return;
  const res = await fetch(`${E2E_API_URL}/api/demo/reseed`, { method: 'POST' });
  if (!res.ok) throw new Error(`Reseeding the test database failed: ${res.status} ${await res.text()}`);
}
