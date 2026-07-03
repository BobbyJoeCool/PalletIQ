import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // shared live DB — see tests/e2e/README.md
  retries: 0, // a retry would silently mutate data twice
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
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
