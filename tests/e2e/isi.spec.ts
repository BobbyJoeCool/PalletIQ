import { test, expect } from '@playwright/test';
import { tapKeys } from './helpers';

/**
 * Covers ISI's DPCI entry (three separate Dept/Class/Item fields, auto-advancing and
 * auto-resolving), the empty-result and not-found paths, and row selection enabling the
 * Location ID / Pallet ID hot buttons. See GitHub issue #13.
 */
test.describe('ISI — Item Storage Inquiry', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/storage-inquiry');
  });

  test('an unknown DPCI shows a not-found error and leaves the bad DPCI visible', async ({ page }) => {
    await page.getByRole('button', { name: '✗ Bad DPCI' }).click();
    await expect(page.getByText('Item not found')).toBeVisible();
    // v1.6.8 — the bad DPCI stays in the boxes (not cleared) so the worker can see what
    // didn't resolve, rather than the boxes reverting to "—".
    await expect(page.getByRole('button', { name: 'Dept' })).toHaveText('999');
  });

  test('a valid DPCI (via the demo button) shows either results or the empty-state message', async ({ page }) => {
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/locations') && r.ok()),
      page.getByRole('button', { name: '✓ Scan DPCI' }).click(),
    ]);

    const emptyState = page.getByText('No locations currently storing this item');
    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    const hasRows = await page.getByText(/^Pallet \d+$/).first().isVisible().catch(() => false);
    expect(hasEmptyState || hasRows).toBe(true);
  });

  test('Dept/Class/Item fields auto-advance and auto-resolve without an explicit OK tap', async ({ page }) => {
    const deptField = page.getByRole('button', { name: 'Dept' });
    await deptField.click();
    await tapKeys(page, '999');
    // Auto-advance to the next field happens after a short delay (see ISIPage.tsx's
    // handleDeptConfirm/handleClassConfirm) — a brief pause here mirrors realistic tap
    // cadence and avoids racing ahead of the field switch, the same way a worker's own
    // tap-to-tap timing naturally would.
    await page.waitForTimeout(100);
    // Auto-advanced to Class — typing there directly (no manual refocus) proves it.
    await tapKeys(page, '99');
    await page.waitForTimeout(100);
    // Auto-advanced to Item; a 4-digit entry auto-resolves the lookup (Dept 999 doesn't exist).
    await tapKeys(page, '9999');

    await expect(page.getByText('Item not found')).toBeVisible();
  });

  test('selecting a result row enables the Location ID / Pallet ID hot buttons', async ({ page }) => {
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/locations') && r.ok()),
      page.getByRole('button', { name: '✓ Scan DPCI' }).click(),
    ]);

    const firstRow = page.getByText(/^Pallet \d+$/).first();
    if (!(await firstRow.isVisible().catch(() => false))) {
      test.skip(true, 'Sampled DPCI has no stored locations this run — nothing to select');
    }

    await expect(page.getByRole('button', { name: 'Go to Location ID' })).not.toBeVisible();
    await firstRow.click();
    await expect(page.getByRole('button', { name: 'Go to Location ID' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to Pallet ID' })).toBeVisible();
  });
});
