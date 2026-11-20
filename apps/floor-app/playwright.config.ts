import { defineConfig, devices } from '@playwright/test';
import { E2E_FLOOR_APP_URL, e2eWebServers, testApiServer, testFloorAppServer } from '../e2e-test-env';

/**
 * Floor app e2e suite. By default runs against the isolated Docker test database: Playwright
 * starts the test API (:7072) and its own floor-app dev server (:5175). `E2E_DB=dev` runs
 * against the already-running dev servers and dev database instead. See ../e2e-test-env.ts
 * and tests/e2e/README.md.
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false, // one shared database — see tests/e2e/README.md
  retries: 0, // a retry would silently mutate data twice
  reporter: 'html',
  webServer: e2eWebServers([testApiServer, testFloorAppServer]),
  use: {
    baseURL: E2E_FLOOR_APP_URL,
    trace: 'on-first-retry',
    // Kiosk target is iPad-Pro-landscape sized (see Documentation/outline.md's "Device
    // target" note and AppShell.tsx's hardcoded 1024px content-height math). The app's
    // screens use fixed/absolute layouts sized for this, not a responsive one — the default
    // 1280x720 Chrome viewport is too short and clips the bottom row of every on-screen keypad.
    viewport: { width: 1366, height: 1024 },
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 1024 } },
      dependencies: ['setup'],
    },
  ],
});
