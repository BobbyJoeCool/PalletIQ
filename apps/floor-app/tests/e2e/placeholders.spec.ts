import { test, expect } from '@playwright/test';

/**
 * Jump codes whose screens aren't built yet render the shared placeholder (test plan
 * Part 4, #239): the code, its name, and a not-yet-built note.
 */
test.describe('Placeholder screens', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  for (const [path, code, label] of [
    ['/reporting/team', 'WTP', 'Warehouse Team Reporting'],
    ['/container/reprint', 'LRP', 'Container Reprint'],
    ['/overpack', 'OCC', 'Overpack Carton Create'],
  ] as const) {
    test(`${code} shows its placeholder`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: label })).toBeVisible();
      await expect(page.getByText(code, { exact: true }).last()).toBeVisible();
      await expect(page.getByText('This screen is not yet built.')).toBeVisible();
    });
  }

  test('an unknown route goes home', async ({ page }) => {
    await page.goto('/no-such-screen');
    await expect(page).toHaveURL(/\/$/);
  });
});
