import { reseedTestDatabase } from '../../../e2e-test-env';

/**
 * Runs once, after Playwright has started the test servers: refreshes the test database's
 * demo data so every run starts from the same kind of state (no-op in `E2E_DB=dev` mode).
 */
export default async function globalSetup(): Promise<void> {
  await reseedTestDatabase();
}
