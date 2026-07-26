import { test, expect } from '@playwright/test';

/**
 * Covers the Reports menu restructure (issues #10/#13): SAR moved from Location
 * Management into Reporting Functions, ISI added to Location Management in SAR's old
 * slot, and the "Other Reporting Functions" (RPT) placeholder removed entirely.
 *
 * HomePage.tsx renders column headings and column buttons as separate sibling rows (not
 * one wrapper div per column), so there's no single container to scope a `hasText` filter
 * to "just this column" — locate columns by position instead. Order is fixed by
 * HomePage.tsx's COLUMNS array: Production, Inventory Management, Location Management,
 * GPM Functions, Reporting Functions (indices 0-4).
 */
test.describe('HomePage — menu restructure', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  function column(page: import('@playwright/test').Page, index: number) {
    return page.locator('div.flex-1.flex.flex-col.gap-4').nth(index);
  }

  test('Location Management shows ISI instead of SAR', async ({ page }) => {
    const locColumn = column(page, 2);
    await expect(locColumn.getByText('ISI', { exact: true })).toBeVisible();
    await expect(locColumn.getByText('Item Storage Inquiry')).toBeVisible();
    await expect(locColumn.getByText('SAR', { exact: true })).not.toBeVisible();
  });

  test('Reporting Functions shows SAR at the top and no "Other Reporting Functions" slot', async ({ page }) => {
    const reportColumn = column(page, 4);
    await expect(reportColumn.getByText('SAR', { exact: true })).toBeVisible();
    await expect(reportColumn.getByText('Staged Aisle Report')).toBeVisible();
    await expect(page.getByText('Other Reporting Functions')).not.toBeVisible();
  });

  test('tapping SAR from the Reporting Functions column navigates to the built screen', async ({ page }) => {
    await column(page, 4).getByText('Staged Aisle Report').click();
    await expect(page).toHaveURL('/staged-aisle');
  });

  test('tapping ISI from the Location Management column navigates to the built screen', async ({ page }) => {
    await column(page, 2).getByText('Item Storage Inquiry').click();
    await expect(page).toHaveURL('/storage-inquiry');
  });
});
