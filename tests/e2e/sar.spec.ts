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
});
