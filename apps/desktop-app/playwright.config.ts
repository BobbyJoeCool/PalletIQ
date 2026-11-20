import { defineConfig } from '@playwright/test';
import { E2E_API_URL, E2E_FLOOR_APP_URL, e2eWebServers, testApiServer, testFloorAppServer } from '../e2e-test-env';

// The specs' helpers and the launched Electron app (which inherits this process's
// environment) read these; an explicit value set by the caller still wins.
process.env.PALLETIQ_API_URL ??= E2E_API_URL;
process.env.PALLETIQ_FLOOR_APP_URL ??= E2E_FLOOR_APP_URL;

/**
 * Desktop app e2e suite. Drives the *built* Electron app (`npm run build` first —
 * `npm run test:e2e` does it). By default against the isolated Docker test database:
 * Playwright starts the test API (:7072) and a floor-app dev server (:5175, for the
 * Embedded Floor App spec). `E2E_DB=dev` uses the already-running dev API on :7071 and
 * floor app on :5173 instead (see ../e2e-test-env.ts and tests/e2e/README.md). Every spec
 * puts back what it changes. Serial, no retries: specs share one database and a retry
 * would repeat a write.
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  webServer: e2eWebServers([testApiServer, testFloorAppServer]),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
});
