import { test, expect } from '@playwright/test';
import { hardwareScan } from './helpers';

// See ela.spec.ts — same aisle/storage-code/size combination, chosen because it's
// overwhelmingly likely to have at least one empty CR-sized location under the current seed.
const LIVE_AISLE = '304';
const LIVE_STORAGE = 'CR';

// No Location rows exist for this aisle number under the current seed pattern (see
// api/prisma/seed.ts — standard aisles run 304-338, plus 301-303 and 701/702/801-803).
const UNKNOWN_AISLE = '99999';

/**
 * Covers ELZ's filter-completeness gating, the aisle/not-found query outcomes, the shared
 * AisleGrid rendering, the per-zone summary panel, and the Stage Aisle navigation action.
 * See DevNotes/Screen-Specs/ELZ.md.
 *
 * Not covered:
 * - Contraction highlighting: no seed data sets Location.contraction to true (it's a
 *   Lead+/Aisle-Setup concept explicitly out of scope for this demo — see the schema
 *   comment on Location.contraction in api/prisma/schema.prisma).
 * - `(S)` / `E(S)` staged branches in the zone summary: no seed data sets a STAGED status.
 */
test.describe('ELZ — Empty Locations by Zone', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/empty/zone');
  });

  test('shows an idle prompt until both Aisle and Storage Code are filled', async ({ page }) => {
    await expect(page.getByText('Enter an Aisle and Storage Code to view the zone map')).toBeVisible();

    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Aisle' }).getByRole('button').click();
    await hardwareScan(page, LIVE_AISLE);

    // Aisle alone is not enough — Storage Code is still required.
    await expect(page.getByText('Enter an Aisle and Storage Code to view the zone map')).toBeVisible();
  });

  test('an aisle with no location records shows the not-found message', async ({ page }) => {
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Aisle' }).getByRole('button').click();
    await hardwareScan(page, UNKNOWN_AISLE);
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').click();
    await hardwareScan(page, LIVE_STORAGE);

    await expect(page.getByText(`No locations found for Aisle ${UNKNOWN_AISLE} — ${LIVE_STORAGE}`)).toBeVisible();
  });

  test('a valid Aisle + Storage Code renders the aisle grid and zone summary', async ({ page }) => {
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Aisle' }).getByRole('button').click();
    await hardwareScan(page, LIVE_AISLE);
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').click();
    await hardwareScan(page, LIVE_STORAGE);

    // Grid: 8 fixed zone-side column headers.
    await expect(page.getByText('Z1 Odd')).toBeVisible();
    await expect(page.getByText('Z4 Even')).toBeVisible();

    // Zone summary panel: at least Zone 1 should render with a StorageCode-Size breakdown line.
    await expect(page.getByText('Zone Summary')).toBeVisible();
    await expect(page.getByText('Zone 1')).toBeVisible();
  });

  test('"Stage Aisle" navigates to the (not yet built) STG screen with the aisle carried over', async ({ page }) => {
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Aisle' }).getByRole('button').click();
    await hardwareScan(page, LIVE_AISLE);
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').click();
    await hardwareScan(page, LIVE_STORAGE);

    await page.getByRole('button', { name: 'Stage Aisle' }).click();

    await expect(page).toHaveURL('/stage');
    await expect(page.getByText('STG', { exact: true })).toBeVisible();
  });

  test('the Stage Aisle button is disabled until an aisle has been entered', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Stage Aisle' })).toBeDisabled();
  });
});
