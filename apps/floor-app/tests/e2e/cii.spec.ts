import { test, expect } from '@playwright/test';
import { fieldBox, hardwareScan } from './helpers';

/**
 * CII — Container ID Inquiry (test plan Part 4, #239): look up a container from the demo
 * scanner and see its detail and event log; an unknown Container ID shows an error.
 */
test.describe('CII — Container ID Inquiry', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/container');
  });

  test('starts empty, asking for a Container ID', async ({ page }) => {
    await expect(page.getByText('Scan or enter a Container ID')).toBeVisible();
  });

  test('a valid label loads the container\'s type, status, detail and event log', async ({ page }) => {
    await fieldBox(page, 'Container ID').click();
    await page.getByRole('button', { name: '✓ Valid Label' }).click();
    await expect(page.getByText('Scan or enter a Container ID')).toBeHidden();
    // The demo label is a printed container; seeded ones are full cases (type 91).
    await expect(page.getByText('Full Case', { exact: true })).toBeVisible();
    await expect(page.getByText('PRINTED', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Pull Function', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'View in PRQ' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Event Log' })).toBeVisible();
  });

  test('an unknown Container ID shows "Container not found"', async ({ page }) => {
    await fieldBox(page, 'Container ID').click();
    // Well-formed full-case CID (35 digits) that no seed or reseed creates.
    await hardwareScan(page, '91' + '9999' + '999999999' + '99999999' + '999' + '99' + '2026001');
    await expect(page.getByText('Container not found')).toBeVisible();
    await expect(page.getByText('Scan or enter a Container ID')).toBeVisible();
  });
});
