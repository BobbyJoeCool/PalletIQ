import { test, expect } from '@playwright/test';
import { hardwareScan, pickCode, tapKeys } from './helpers';

// GitHub #156 — corrected from aisle 304 (never actually stocks Size L; see seed.ts's
// `patternSize`, digit 4 is Small-only) and its predecessor 302 (real Large aisle, but
// `STAGED_AISLES` marks it 100% staged — zero room). CR's block is 300-309 (`standardAisles`
// in api/prisma/seed.ts), one aisle per pattern digit; digit 3 (`patternSize` case 2/3) is
// Medium on level 1, Large on levels 2+ — aisle 303 is that digit, and isn't in
// `STAGED_AISLES` at all (0% staged, full room). Re-seed (`cd api && npx prisma db seed`)
// if these tests start failing with no results.
const LIVE_STORAGE = 'CR';
const LIVE_SIZE = 'L';
const LIVE_AISLE = '303';

// An aisle range (GitHub #156 — fixed from a genuinely nonexistent "ZZ" storage code,
// which trips ELA's invalid-code handling instead of ever reaching a real query, since
// StorageCodeField validates against the real STORAGE_CODES reference list) guaranteed to
// match zero locations for any real storage code — every seeded aisle falls within
// 100-129, 200-204, 300-329, or 730 (see api/prisma/seed.ts's standardAisles/
// xsOverflowAisles/foldedZoneOf), so 900-999 is safely outside all of them.
const EMPTY_AISLE_START = '900';
const EMPTY_AISLE_END = '999';

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

  test('shows an idle prompt until Storage Code is filled; Size alone is never required', async ({ page }) => {
    // Stale since v1.6.4 (Storage-Code-only browsing) — Size has not been required for a
    // real query to run in a long time; this test previously asserted the pre-v1.6.4
    // behavior verbatim (fixed as part of GitHub #156's investigation).
    await expect(page.getByText('Enter a Storage Code to see available locations (add a Size to narrow further)')).toBeVisible();

    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').first().click();
    await hardwareScan(page, LIVE_STORAGE);

    // Storage Code alone is enough — the idle prompt clears and the "Displaying" banner
    // for it appears without a Size ever being entered.
    await expect(page.getByText('Enter a Storage Code to see available locations (add a Size to narrow further)')).not.toBeVisible();
    await expect(page.getByText(`Displaying ${LIVE_STORAGE}:`)).toBeVisible();
  });

  test('an aisle range with no matching data shows the no-results message', async ({ page }) => {
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').first().click();
    await hardwareScan(page, LIVE_STORAGE);
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Start Aisle' }).getByRole('button').click();
    await tapKeys(page, EMPTY_AISLE_START);
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'End Aisle' }).getByRole('button').click();
    await tapKeys(page, EMPTY_AISLE_END);

    await expect(page.getByText(`No empty or staged locations found for ${LIVE_STORAGE}`)).toBeVisible();
  });

  test('a valid Storage Code + Size loads a results table with an aisle row', async ({ page }) => {
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').first().click();
    await hardwareScan(page, LIVE_STORAGE);
    await pickCode(page, 'Size', LIVE_SIZE);

    // Size column header — scoped to the results table (not the Size field's own button,
    // which also now shows "L" once picked — see issue #80's dropdown-helper field).
    await expect(page.locator('div.flex-1.overflow-hidden').getByText(LIVE_SIZE, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button').filter({ hasText: new RegExp(`^${LIVE_AISLE}`) })).toBeVisible();
  });

  test('selecting a row activates navigation buttons; tapping it again deselects', async ({ page }) => {
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').first().click();
    await hardwareScan(page, LIVE_STORAGE);
    await pickCode(page, 'Size', LIVE_SIZE);

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
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').first().click();
    await hardwareScan(page, LIVE_STORAGE);
    await pickCode(page, 'Size', LIVE_SIZE);

    const row = page.getByRole('button').filter({ hasText: new RegExp(`^${LIVE_AISLE}`) });
    await row.click();
    await expect(page.getByRole('button', { name: 'View Zone Map' })).toBeEnabled();

    // Re-picking the same Size still fires ELA's onChange (which unconditionally clears the
    // current selection) — the dropdown-helper popup has no blank/reset option to route
    // through first, unlike the old native <select>, but the app doesn't need one to prove
    // "changing" (re-committing) the filter clears the selection.
    await pickCode(page, 'Size', LIVE_SIZE);
    await expect(page.getByRole('button', { name: 'View Zone Map' })).toBeDisabled();
  });

  test('"View Zone Map" navigates to ELZ pre-populated with aisle and storage code', async ({ page }) => {
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').first().click();
    await hardwareScan(page, LIVE_STORAGE);
    await pickCode(page, 'Size', LIVE_SIZE);

    await page.getByRole('button').filter({ hasText: new RegExp(`^${LIVE_AISLE}`) }).click();
    await page.getByRole('button', { name: 'View Zone Map' }).click();

    await expect(page).toHaveURL('/empty/zone');
    // Scoped to ELZ's own Aisle field width (w-[160px], see ELZPage.tsx) rather than the
    // bare `hasText: 'Aisle'` used elsewhere — that alone is ambiguous for a brief moment
    // right after this SPA navigation, since ELA's own "Start Aisle"/"End Aisle" fields
    // (w-[110px], both literally containing "Aisle" in their label) can still be in the DOM
    // for a tick before React finishes swapping in ELZ's tree, and `toHaveText`'s strict
    // mode hard-fails on that transient double-match instead of retrying past it (GitHub #156).
    await expect(page.locator('div.flex.flex-col.gap-1.w-\\[160px\\]', { hasText: 'Aisle' }).getByRole('button')).toHaveText(LIVE_AISLE);
    await expect(page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').first()).toHaveText(LIVE_STORAGE);
  });

  test('"Stage Aisle" navigates to the (not yet built) STG screen', async ({ page }) => {
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').first().click();
    await hardwareScan(page, LIVE_STORAGE);
    await pickCode(page, 'Size', LIVE_SIZE);

    await page.getByRole('button').filter({ hasText: new RegExp(`^${LIVE_AISLE}`) }).click();
    await page.getByRole('button', { name: 'Stage Aisle' }).click();

    await expect(page).toHaveURL('/stage');
    // STG no longer renders its own jump code as standalone page text (the header shows
    // "Stage Aisle" as the full screen title instead) — "Master Control" is STG's own
    // distinctive, still-current heading (GitHub #156, stale since whenever that changed).
    await expect(page.getByText('Master Control', { exact: true })).toBeVisible();
  });
});
