import { test, expect } from '@playwright/test';
import { hardwareScan } from './helpers';

// Aisle 304 is a standard "L"-type aisle (see api/prisma/seed.ts's AISLE_PATTERN),
// storage code CR (aisles 304-310), size L on levels 2-5 (512 locations at 10% empty
// probability — overwhelmingly likely to have at least one empty CR-L location).
// Re-seed (`cd api && npx prisma db seed`) if these tests start failing with no results.
const LIVE_STORAGE = 'CR';
const LIVE_SIZE = 'L';
const LIVE_AISLE = '304';

// A storage code that does not exist in the seed data (see STORAGE_CODES in seed.ts) —
// guarantees a "no results" response without depending on exhausting real inventory.
const UNKNOWN_STORAGE = 'ZZ';

/**
 * Covers ELA's filter-completeness gating, query trigger, results table, row selection,
 * and the two pre-population navigation actions described in DevNotes/Screen-Specs/ELA.md.
 *
 * Not covered:
 * - Dynamic multi-size column rendering: as of issue #4's fix, getLocationsEmptyByAisle
 *   returns every size present in a qualifying aisle (e.g. aisle 304 is CR with level 1 = M
 *   and levels 2-5 = L, per AISLE_PATTERN in api/prisma/seed.ts), so a real multi-column case
 *   now exists against seed data — just not yet asserted here.
 * - The blank/E/E(S)/(S) cell format's staged branch: no seed data sets Location.status
 *   to STAGED, so `E(S)` and `(S)` cannot be produced against a real dataset.
 */
test.describe('ELA — Empty Locations by Aisle', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/empty/aisle');
  });

  test('shows an idle prompt until both Storage Code and Size are filled', async ({ page }) => {
    await expect(page.getByText('Enter a Storage Code and select a Size to see available locations')).toBeVisible();

    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').click();
    await hardwareScan(page, LIVE_STORAGE);

    // Storage Code alone is not enough — Size is still required.
    await expect(page.getByText('Enter a Storage Code and select a Size to see available locations')).toBeVisible();
  });

  test('a Storage Code with no matching seed data shows the no-results message', async ({ page }) => {
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').click();
    await hardwareScan(page, UNKNOWN_STORAGE);
    await page.locator('select').selectOption(LIVE_SIZE);

    await expect(page.getByText(`No empty or staged locations found for ${UNKNOWN_STORAGE} — ${LIVE_SIZE}`)).toBeVisible();
  });

  test('a valid Storage Code + Size loads a results table with an aisle row', async ({ page }) => {
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').click();
    await hardwareScan(page, LIVE_STORAGE);
    await page.locator('select').selectOption(LIVE_SIZE);

    await expect(page.getByText(LIVE_SIZE, { exact: true }).first()).toBeVisible(); // size column header
    await expect(page.getByRole('button').filter({ hasText: new RegExp(`^${LIVE_AISLE}`) })).toBeVisible();
  });

  test('selecting a row activates navigation buttons; tapping it again deselects', async ({ page }) => {
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').click();
    await hardwareScan(page, LIVE_STORAGE);
    await page.locator('select').selectOption(LIVE_SIZE);

    const viewZoneMap = page.getByRole('button', { name: 'View Zone Map' });
    const stageAisle = page.getByRole('button', { name: 'Stage Aisle' });
    await expect(viewZoneMap).toBeDisabled();
    await expect(stageAisle).toBeDisabled();

    const row = page.getByRole('button').filter({ hasText: new RegExp(`^${LIVE_AISLE}`) });
    await row.click();
    await expect(viewZoneMap).toBeEnabled();
    await expect(stageAisle).toBeEnabled();

    await row.click(); // deselect
    await expect(viewZoneMap).toBeDisabled();
    await expect(stageAisle).toBeDisabled();
  });

  test('changing a filter clears the current selection', async ({ page }) => {
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').click();
    await hardwareScan(page, LIVE_STORAGE);
    await page.locator('select').selectOption(LIVE_SIZE);

    const row = page.getByRole('button').filter({ hasText: new RegExp(`^${LIVE_AISLE}`) });
    await row.click();
    await expect(page.getByRole('button', { name: 'View Zone Map' })).toBeEnabled();

    // Re-select the same size — filter "changes" (re-fires the query) and must clear selection.
    await page.locator('select').selectOption({ index: 0 });
    await page.locator('select').selectOption(LIVE_SIZE);
    await expect(page.getByRole('button', { name: 'View Zone Map' })).toBeDisabled();
  });

  test('"View Zone Map" navigates to ELZ pre-populated with aisle and storage code', async ({ page }) => {
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').click();
    await hardwareScan(page, LIVE_STORAGE);
    await page.locator('select').selectOption(LIVE_SIZE);

    await page.getByRole('button').filter({ hasText: new RegExp(`^${LIVE_AISLE}`) }).click();
    await page.getByRole('button', { name: 'View Zone Map' }).click();

    await expect(page).toHaveURL('/empty/zone');
    await expect(page.locator('div.flex.flex-col.gap-1', { hasText: 'Aisle' }).getByRole('button')).toHaveText(LIVE_AISLE);
    await expect(page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button')).toHaveText(LIVE_STORAGE);
  });

  test('"Stage Aisle" navigates to the (not yet built) STG screen', async ({ page }) => {
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').click();
    await hardwareScan(page, LIVE_STORAGE);
    await page.locator('select').selectOption(LIVE_SIZE);

    await page.getByRole('button').filter({ hasText: new RegExp(`^${LIVE_AISLE}`) }).click();
    await page.getByRole('button', { name: 'Stage Aisle' }).click();

    await expect(page).toHaveURL('/stage');
    await expect(page.getByText('STG', { exact: true })).toBeVisible();
  });
});
