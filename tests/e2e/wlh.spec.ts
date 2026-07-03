import { test, expect } from '@playwright/test';

/**
 * Covers WLH's location resolution, hold placement + reason-code entry, hold removal,
 * and role-gated visibility of hold-type buttons. See DevNotes/Screen-Specs/WLH.md.
 */
test.describe('WLH — Warehouse Location Hold', () => {
  test.use({ storageState: 'playwright/.auth/im.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/hold');
  });

  test('loading a valid location shows the hold panel with no current hold', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Load Location' }).click();
    await expect(page.getByText('Current Hold', { exact: true })).toBeVisible();
    await expect(page.getByText('None', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hold Inbound' })).toBeVisible();
  });

  test('an unknown location shows a not-found error', async ({ page }) => {
    await page.getByRole('button', { name: '✗ Bad Location' }).click();
    await expect(page.getByText('Location not found')).toBeVisible();
  });

  test('placing a hold requires a reason code and shows a success message', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Load Location' }).click();
    await page.getByRole('button', { name: 'Hold Both' }).click();

    const confirmBtn = page.getByRole('button', { name: 'Confirm Hold' });
    await expect(confirmBtn).toBeDisabled();

    await page.getByLabel('Reason code').selectOption('B01');
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    await expect(page.getByText(/Hold Both placed on/)).toBeVisible();
  });

  test('removing an active hold clears it back to None', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Load Location' }).click();
    await page.getByRole('button', { name: 'Hold Both' }).click();
    await page.getByLabel('Reason code').selectOption('B01');
    await page.getByRole('button', { name: 'Confirm Hold' }).click();
    await expect(page.getByText(/Hold Both placed on/)).toBeVisible();

    await page.getByRole('button', { name: 'Remove Hold' }).click();
    await expect(page.getByText(/Hold removed from/)).toBeVisible();
    await expect(page.getByText('None', { exact: true })).toBeVisible();
  });
});

test.describe('WLH — Worker role gating', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  test('Worker only sees Hold Both among placeable hold types', async ({ page }) => {
    await page.goto('/hold');
    await page.getByRole('button', { name: '✓ Load Location' }).click();

    await expect(page.getByRole('button', { name: 'Hold Both' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hold Inbound' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Hold Outbound' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Hold Permanent' })).not.toBeVisible();
  });
});
