import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { API_URL, APP_DIR } from './helpers';

/**
 * Fails fast, with a readable reason, when the suite cannot run: no built app, or no API.
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
    throw new Error(`The PalletIQ API is not reachable at ${API_URL} (${String(err)}). Start it with "cd ../../api && npm start".`);
  }
}
