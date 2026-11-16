import { defineConfig } from '@playwright/test';

/**
 * Desktop app e2e suite. Drives the *built* Electron app (`npm run build` first —
 * `npm run test:e2e` does it) against the real local API and database, the same way
 * the floor app's suite runs against the shared local DB. Every spec puts back what it
 * changes. Serial, no retries: specs share one database and a retry would repeat a write.
 *
 * Needs, already running: the API on :7071 (`cd ../../api && npm start`) with the
 * migrations applied, and — for the Embedded Floor App spec only — the floor app's dev
 * server on :5173 (that spec skips itself otherwise). See tests/e2e/README.md.
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
});
