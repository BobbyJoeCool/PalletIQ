import { test, expect } from '@playwright/test';

/**
 * Covers PAR's role gate, the item demo scanner (valid + invalid DPCI lookup), and
 * the IM-only access requirement. See Documentation/ScreenSpecs/PAR.md.
 *
 * Not covered: the full create-pallet flow (filling VCP, SSP, Size, Cartons, then
 * submitting) — each field requires numpad/keyboard interaction and auto-advance timing,
 * and the random item returned by the demo scanner can vary in storage code and
 * expiration requirements, making a deterministic end-to-end create fragile without
 * a purpose-built seed fixture. The create path is verified via manual smoke testing.
 */
test.describe('PAR — Pallet Reinstate', () => {
  test.use({ storageState: 'playwright/.auth/im.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/pallet/reinstate');
  });

  test('IM sees the reinstate form', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Create Pallet' })).toBeVisible();
  });

  test('a valid item fills the DPCI and shows the item description', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Valid Item' }).click();
    await expect(page.getByText('Description', { exact: true })).toBeVisible();
  });

  test('an invalid item shows a DPCI-not-found error', async ({ page }) => {
    await page.getByRole('button', { name: '✗ Invalid Item' }).click();
    await expect(page.getByText('DPCI not found')).toBeVisible();
  });
});

test.describe('PAR — Worker role gating', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  test('Worker sees access denied instead of the form', async ({ page }) => {
    await page.goto('/pallet/reinstate');
    await expect(page.getByText('Access Denied')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Pallet' })).not.toBeVisible();
  });
});
