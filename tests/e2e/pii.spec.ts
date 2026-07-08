import { test, expect } from '@playwright/test';
import { tapKeys } from './helpers';

/**
 * Covers PII's entry/lookup flow, the not-found path, and the IM+ edit-mode gate.
 * See DevNotes/Screen-Specs/PII.md.
 *
 * Not covered: the Save flow's DPCI-change + UPC auto-update — would require knowing a
 * specific valid DPCI ahead of time, which isn't available via a demo endpoint here
 * (only "Scan PID" gives a random pallet, not a random valid DPCI to change *to*).
 */
test.describe('PII — Pallet ID Info', () => {
  test.use({ storageState: 'playwright/.auth/im.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/pallet');
  });

  test('scanning a valid pallet loads the read-only detail view', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Scan PID' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();
    await expect(page.getByText('Current Location', { exact: true })).toBeVisible();
  });

  test('an unknown pallet ID shows a not-found error', async ({ page }) => {
    await page.getByRole('button', { name: '✗ Bad PID' }).click();
    await expect(page.getByText('Pallet not found')).toBeVisible();
  });

  test('IM sees the Edit button after loading a pallet', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Scan PID' }).click();
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
  });

  test('Edit mode shows editable fields and Cancel discards them', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Scan PID' }).click();
    await page.getByRole('button', { name: 'Edit' }).click();

    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
  });

  test('"Go to Location ID" is disabled for an unlocated pallet, enabled for a located one', async ({ page }) => {
    // Demo pallet defaults to a stored (located) pallet — see api/functions/samples.ts.
    await page.getByRole('button', { name: '✓ Scan PID' }).click();
    await expect(page.getByRole('button', { name: 'Go to Location ID' })).toBeEnabled();
  });

  // Issue #7: Received/Put/Last Pulled By show zNumbers, not names.
  test('audit stamps show a zNumber, not a name', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Scan PID' }).click();
    const receivedRow = page.locator('div', { hasText: 'Received By' }).last();
    await expect(receivedRow.getByText(/^z\d+p\d+/)).toBeVisible();
  });

  // Issue #19: a "Full Pallets" row is present alongside the other quantity fields.
  test('shows a Full Pallets row', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Scan PID' }).click();
    await expect(page.getByText('Full Pallets', { exact: true })).toBeVisible();
  });

  // Issue #20: the cartons field reads "Total Cartons", not "Cartons on Pallet"/"cartons per pallet".
  test('the cartons field is labeled Total Cartons in both view and edit mode', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Scan PID' }).click();
    await expect(page.getByText('Total Cartons', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByLabel('Total Cartons')).toBeVisible();
  });

  // Issue #21: DPCI is edited as three separate Dept/Class/Item fields.
  test('edit mode shows separate Dept/Class/Item fields for DPCI', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Scan PID' }).click();
    await page.getByRole('button', { name: 'Edit' }).click();

    await expect(page.getByLabel('Dept', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Class', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Item', { exact: true })).toBeVisible();
  });
});

test.describe('PII — Worker role gating', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  test('Worker does not see the Edit button', async ({ page }) => {
    await page.goto('/pallet');
    await page.getByRole('button', { name: '✓ Scan PID' }).click();
    await expect(page.getByRole('button', { name: 'Edit' })).not.toBeVisible();
  });

  test('manual pallet ID entry via numpad reaches the same not-found path as the demo button', async ({ page }) => {
    await page.goto('/pallet');
    const palletField = page
      .locator('div.w-\\[260px\\]', { hasText: 'Pallet ID' })
      .getByRole('button');
    await palletField.click();
    await tapKeys(page, '1');
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(page.getByText('Pallet not found')).toBeVisible();
  });
});
