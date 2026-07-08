import { test, expect } from '@playwright/test';

/**
 * Covers SAR's read-only two-column report and its loading/empty states.
 * See DevNotes/Screen-Specs/SAR.md.
 *
 * Not covered: asserting specific row contents — SAR reflects whatever aisles happen to
 * have staged locations in the shared dev DB at test time (populated by stg.spec.ts and
 * whatever else has run), so this suite only checks structure, not specific data.
 */
test.describe('SAR — Staged Aisle Report', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  test('shows both report columns', async ({ page }) => {
    await page.goto('/staged-aisle');
    await expect(page.getByText('Most Staged', { exact: true })).toBeVisible();
    await expect(page.getByText('Staged Longest', { exact: true })).toBeVisible();
  });

  test('each column shows either rows or the no-staged-locations empty state', async ({ page }) => {
    await page.goto('/staged-aisle');
    // Wait for the loading state to resolve.
    await expect(page.getByText('Loading…').first()).not.toBeVisible({ timeout: 10_000 });

    const mostStagedColumn = page.locator('div', { hasText: 'Most Staged' }).first();
    const hasEmptyState = await mostStagedColumn.getByText('No staged locations in system').isVisible().catch(() => false);
    const hasRows = await mostStagedColumn.getByText(/^A-\d+$/).first().isVisible().catch(() => false);
    expect(hasEmptyState || hasRows).toBe(true);
  });

  // Issue #11: each row shows the freight type(s) (StorageCode-Size) staged in that aisle.
  test('rows show a freight-type badge alongside the aisle number', async ({ page }) => {
    await page.goto('/staged-aisle');
    await expect(page.getByText('Loading…').first()).not.toBeVisible({ timeout: 10_000 });

    const mostStagedColumn = page.locator('div', { hasText: 'Most Staged' }).first();
    const hasRows = await mostStagedColumn.getByText(/^A-\d+$/).first().isVisible().catch(() => false);
    if (!hasRows) test.skip(true, 'No staged aisles this run — nothing to check freight types on');

    // A freight-type badge looks like "XX-Y" (2-letter storage code, dash, size code).
    await expect(mostStagedColumn.getByText(/^[A-Z]{2}-[A-Z]{1,2}$/).first()).toBeVisible();
  });

  // Issue #26: selecting a row enables navigation to SDP/STG for that aisle.
  test('selecting a row enables the Directed Put / Stage Aisle hot buttons', async ({ page }) => {
    await page.goto('/staged-aisle');
    await expect(page.getByText('Loading…').first()).not.toBeVisible({ timeout: 10_000 });

    const mostStagedColumn = page.locator('div', { hasText: 'Most Staged' }).first();
    const firstRow = mostStagedColumn.getByText(/^A-\d+$/).first();
    if (!(await firstRow.isVisible().catch(() => false))) {
      test.skip(true, 'No staged aisles this run — nothing to select');
    }

    const directedBtn = page.getByRole('button', { name: /^Directed Put/ });
    const stageBtn = page.getByRole('button', { name: /^Stage Aisle/ });
    await expect(directedBtn).toBeDisabled();
    await expect(stageBtn).toBeDisabled();

    await firstRow.click();
    await expect(directedBtn).toBeEnabled();
    await expect(stageBtn).toBeEnabled();

    await stageBtn.click();
    await expect(page).toHaveURL('/stage');
  });
});
