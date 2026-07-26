import { test, expect } from '@playwright/test';

/**
 * Covers the app-wide, cross-function 12-hour activity log overlay (issue #46). See
 * DevNotes/DesignPrompts/Feature-5-App-Wide-Activity-Log.md. The Header's "Activity"
 * button is available on every authenticated screen — these tests exercise it from PIP,
 * but the button/overlay themselves are screen-agnostic (mounted once in AppShell).
 */
test.describe('App-wide activity log (issue #46)', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/pull');
  });

  test('the Activity button opens and closes the overlay', async ({ page }) => {
    await page.getByRole('button', { name: '☰ Activity' }).click();
    await expect(page.getByText('ACTIVITY — LAST 12 HOURS')).toBeVisible();

    await page.getByRole('button', { name: '✕ Close' }).click();
    await expect(page.getByText('ACTIVITY — LAST 12 HOURS')).not.toBeVisible();
  });

  test('completing a pull immediately shows a PULL entry in the log', async ({ page }) => {
    await page.getByRole('button', { name: 'Carton Air' }).click();
    await page.getByRole('button', { name: '✓ Scan Label' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '✓ Scan PID' }).click();
    await expect(page.getByText(/^Last Pull .* — /)).toBeVisible();

    await page.getByRole('button', { name: '☰ Activity' }).click();
    await expect(page.getByText('PULL', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/^Pulled pallet from /).first()).toBeVisible();
  });

  // Issue #46's core promise: the log persists across reload (real DB storage, not
  // in-memory session state) and is identical regardless of which screen it's opened from.
  test('the log is unaffected by navigating to a different screen', async ({ page }) => {
    await page.getByRole('button', { name: 'Carton Air' }).click();
    await page.getByRole('button', { name: '✓ Scan Label' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '✓ Scan PID' }).click();
    await expect(page.getByText(/^Last Pull .* — /)).toBeVisible();

    await page.goto('/hold');
    await page.getByRole('button', { name: '☰ Activity' }).click();
    await expect(page.getByText('PULL', { exact: true }).first()).toBeVisible();
  });
});
