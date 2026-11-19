import { test, expect } from '@playwright/test';

/**
 * IRP — Individual Reporting and its hourly zoom-in (test plan Part 4, #239). Tyler
 * (z002p21) is one of the seeded IRP showcase workers, so he has activity today.
 */
test.describe('IRP — Individual Reporting', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  test('shows the signed-in worker\'s totals and one row per function', async ({ page }) => {
    await page.goto('/reporting/individual');
    await expect(page.getByRole('heading', { name: 'Individual Reporting' })).toBeVisible();
    await expect(page.getByText('Totals', { exact: true })).toBeVisible();
    for (const name of ['Carton Air', 'Carton Floor', 'Full Pallet', 'Rack Puts', 'GPM Staging', 'Consolidation']) {
      await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
    }
    // Breakpack and Bulk aren't built yet: shown, but greyed out and not tappable.
    await expect(page.getByRole('button', { name: /^Breakpack/ })).toBeDisabled();
  });

  test('tapping a function opens its hour-by-hour view; Back returns', async ({ page }) => {
    await page.goto('/reporting/individual');
    await page.getByRole('button', { name: /^Carton Air/ }).click();
    await expect(page).toHaveURL(/\/reporting\/individual\/CA$/);
    await expect(page.getByRole('heading', { name: 'Carton Air' })).toBeVisible();
    await expect(page.getByText(/(\d{1,2}(AM|PM))|No assigned hours today/).first()).toBeVisible();
    await page.getByRole('button', { name: '← Back' }).click();
    await expect(page).toHaveURL(/\/reporting\/individual$/);
  });

  test('an unknown function shows no hours', async ({ page }) => {
    await page.goto('/reporting/individual/XX');
    await expect(page.getByRole('heading', { name: 'XX' })).toBeVisible();
    await expect(page.getByText('No assigned hours today')).toBeVisible();
  });

  test('when the report fails to load, it says so', async ({ page }) => {
    await page.route('**/api/reporting/individual', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"INTERNAL_ERROR"}' }));
    await page.goto('/reporting/individual');
    await expect(page.getByText("Unable to load today's data")).toBeVisible();
  });
});
