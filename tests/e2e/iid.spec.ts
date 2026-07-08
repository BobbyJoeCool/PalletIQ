import { test, expect } from '@playwright/test';
import { hardwareScan } from './helpers';

/**
 * Covers IID's independent DPCI/UPC lookup fields and the not-found path.
 * See DevNotes/Screen-Specs/IID.md.
 */
test.describe('IID — Item ID Lookup', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/item');
  });

  test('scanning a valid DPCI loads the read-only item detail', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Scan DPCI' }).click();
    await expect(page.getByText('Name', { exact: true })).toBeVisible();
    await expect(page.getByText('Short Description', { exact: true })).toBeVisible();
  });

  test('an unknown DPCI shows a not-found error and clears the DPCI field', async ({ page }) => {
    await page.getByRole('button', { name: '✗ Bad DPCI' }).click();
    await expect(page.getByText('Item not found')).toBeVisible();
  });

  test('entering a UPC clears the DPCI fields', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Scan DPCI' }).click();
    await expect(page.getByText('Name', { exact: true })).toBeVisible();

    // DPCI is three separate fields (issue #16) — Dept/Class/Item.
    const deptField = page.getByRole('button', { name: 'Dept' });
    await expect(deptField).not.toHaveText('—');

    const upcField = page.locator('div.w-\\[260px\\]', { hasText: 'UPC' }).getByRole('button');
    await upcField.click();
    await hardwareScan(page, '999999999999');

    await expect(deptField).toHaveText('—');
  });
});
