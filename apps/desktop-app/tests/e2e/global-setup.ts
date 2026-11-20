import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { API_URL, APP_DIR } from './helpers';
import { E2E_DEV_MODE, reseedTestDatabase } from '../../../e2e-test-env';

/**
 * Fails fast, with a readable reason, when the suite cannot run: no built app, or no API.
 * Then refreshes the test database's demo data (test mode only).
 */
export default async function globalSetup(): Promise<void> {
  for (const built of ['dist/index.html', 'dist-electron/main.js', 'dist-electron/floorAppPreload.cjs']) {
    if (!existsSync(join(APP_DIR, built))) {
      throw new Error(`Desktop app is not built (${built} missing). Run "npm run build", or use "npm run test:e2e".`);
    }
  }
  try {
    const res = await fetch(`${API_URL}/api/health`);
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (err) {
    const hint = E2E_DEV_MODE ? 'Start it with "cd ../../api && npm start".' : 'Playwright should have started it; see the webServer output above.';
    throw new Error(`The PalletIQ API is not reachable at ${API_URL} (${String(err)}). ${hint}`);
  }
  await reseedTestDatabase();
}
