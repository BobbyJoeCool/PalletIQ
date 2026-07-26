import { test, expect } from '@playwright/test';

/**
 * Covers LII's scan-to-load flow, the not-found path, and navigation gating.
 * See DevNotes/Screen-Specs/LII.md.
 *
 * Not covered: manual three-field (Aisle/Bin/Level) entry with auto-advance — the
 * shared LocationEntryFields component is also exercised by wlh.spec.ts; testing the
 * full auto-advance sequence with real digits would need a known-valid location ahead
 * of time, which the demo endpoint already covers via a full 8-digit scan.
 */
test.describe('LII — Location ID Info', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/location');
  });

  test('scanning a valid location loads the read-only detail view', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Scan Location' }).click();
    await expect(page.getByText('Storage Code', { exact: true })).toBeVisible();
    await expect(page.getByText('Hold', { exact: true })).toBeVisible();
  });

  test('an unknown location shows a not-found error', async ({ page }) => {
    await page.getByRole('button', { name: '✗ Bad Location' }).click();
    await expect(page.getByText('Location not found')).toBeVisible();
  });

  test('the Hold button is always visible once a location loads', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Scan Location' }).click();
    await expect(page.getByRole('button', { name: 'Hold', exact: true })).toBeVisible();
  });
});
