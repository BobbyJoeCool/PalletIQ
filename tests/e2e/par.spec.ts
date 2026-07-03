import { test, expect } from '@playwright/test';

/**
 * Covers PAR's role gate, the two success demo paths (PUT_PENDING and STORED), and the
 * two error demo paths (bad DPCI, occupied location). See DevNotes/Screen-Specs/PAR.md.
 *
 * Not covered: manual field entry — every field here is free-form (DPCI, quantities,
 * location), so there's no fixed valid combination to type without first querying seed
 * data; the demo buttons already exercise the same submission code path.
 */
test.describe('PAR — Pallet Reinstate', () => {
  test.use({ storageState: 'playwright/.auth/im.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/pallet/reinstate');
  });

  test('IM sees the reinstate form', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Create Pallet' })).toBeVisible();
  });

  test('"✓ Create" fills a valid no-location set and creates a PUT_PENDING pallet', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Create' }).click();
    await expect(page.getByRole('button', { name: 'Create Pallet' })).toBeEnabled();

    await page.getByRole('button', { name: 'Create Pallet' }).click();
    await expect(page.getByText(/Pallet \d+ created — PUT_PENDING/)).toBeVisible();
  });

  test('"✓ To Location" fills a valid located set and creates a STORED pallet', async ({ page }) => {
    await page.getByRole('button', { name: '✓ To Location' }).click();
    await expect(page.getByRole('button', { name: 'Create Pallet' })).toBeEnabled();

    await page.getByRole('button', { name: 'Create Pallet' }).click();
    await expect(page.getByText(/Pallet \d+ created — stored at/)).toBeVisible();
  });

  test('"✗ Bad DPCI" triggers a DPCI-not-found error on submit', async ({ page }) => {
    await page.getByRole('button', { name: '✗ Bad DPCI' }).click();
    await page.getByRole('button', { name: 'Create Pallet' }).click();
    await expect(page.getByText('DPCI not found')).toBeVisible();
  });

  test('"✗ Bad Location" triggers a location-not-empty error on submit', async ({ page }) => {
    await page.getByRole('button', { name: '✗ Bad Location' }).click();
    await page.getByRole('button', { name: 'Create Pallet' }).click();
    await expect(page.getByText(/is not empty — must be EMPTY to reinstate here/)).toBeVisible();
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
