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

  // Issue #55: the Pallet ID field's auto-focus-on-ready effect used to re-fire on the
  // ready→loaded transition too (React re-runs an effect on any dependency change, not
  // just the direction that mattered), reopening the numpad right after a successful
  // load had just closed it — but only ever on the very first scan of a session, since
  // every load after that starts from 'loaded' already and the dependency doesn't change.
  // `beforeEach` navigates fresh for every test, so this is exactly that first-scan case.
  test('the numpad closes after the very first scan of a session', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Scan PID' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();
    await expect(page.locator('[data-testid="numpad-panel"]')).not.toBeVisible();
    // The regression this guards against is a *delayed* re-focus (a 50ms setTimeout) that
    // reopens the numpad after it briefly closes — a bare `not.toBeVisible()` above would
    // pass as soon as it caught the panel closed on its very first poll, before that delayed
    // re-open ever got a chance to fire. Waiting past the 50ms window before re-asserting is
    // what actually catches it.
    await page.waitForTimeout(200);
    await expect(page.locator('[data-testid="numpad-panel"]')).not.toBeVisible();
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

  // Issue #66: Save used to go through with an empty PATCH body (no-op "success") as
  // long as a reason code happened to be picked. Entering edit mode with no field
  // actually changed should leave Save disabled; changing one field should enable it.
  test('Save is disabled until a field actually changes', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Scan PID' }).click();
    await page.getByRole('button', { name: 'Edit' }).click();

    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

    const vcpField = page.getByLabel('VCP', { exact: true });
    const original = await vcpField.inputValue();
    await vcpField.fill(String(Number(original) + 1));
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();

    // Same value, different formatting (e.g. a leading zero) — parsed comparison means
    // this still counts as unchanged, not a raw string difference.
    await vcpField.fill(original);
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    await vcpField.fill(`0${original}`);
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
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
