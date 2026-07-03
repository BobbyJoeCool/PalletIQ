import { test, expect, type Page } from '@playwright/test';
import { hardwareScan } from './helpers';

// See ela.spec.ts / elz.spec.ts — same aisle/storage-code/size combination, chosen
// because it's overwhelmingly likely to have several empty CR-sized locations under
// the current seed. Re-seed (`cd api && npx prisma db seed`) if these tests start
// failing with unplaced pallets.
const LIVE_AISLE = '304';
const LIVE_STORAGE = 'CR';
const LIVE_SIZE = 'L';

/** Scopes a labeled field (Aisle/Storage/Qty) to one of the three stack columns by
 *  DOM order — stacks always render Stack 1, Stack 2, Stack 3 left to right, and each
 *  label ("Aisle", "Storage", "Qty") appears exactly once per stack (see STGPage.tsx's
 *  FieldDisplay). There is no per-stack test id in this codebase's convention. */
function stackField(page: Page, stackIndex: 0 | 1 | 2, label: string) {
  return page.locator('div.flex.flex-col.gap-1', { hasText: label }).nth(stackIndex).getByRole('button');
}

function stageButton(page: Page, stackIndex: 0 | 1 | 2) {
  return page.getByRole('button', { name: 'Stage', exact: true }).nth(stackIndex);
}

/** Fills Stack 1 with the live Aisle/Storage/Size and a 1-pallet quantity. */
async function fillStackOne(page: Page, quantity = '1') {
  await stackField(page, 0, 'Aisle').click();
  await hardwareScan(page, LIVE_AISLE);
  await stackField(page, 0, 'Storage').click();
  await hardwareScan(page, LIVE_STORAGE);
  await page.getByLabel('Stack 1 Size').selectOption(LIVE_SIZE);
  await stackField(page, 0, 'Qty').click();
  await hardwareScan(page, quantity);
}

/**
 * Covers STG's per-stack fill/stage flow, master control "Fill All", the
 * Unstage-Aisle role gate, and the collapsible log panel. See DevNotes/Screen-Specs/STG.md.
 *
 * Not covered:
 * - The Unstage/Restage modal's actual submission (Clear Aisle / Restage N) — its plain
 *   number inputs and confirmation step are exercised for visibility only, not committed,
 *   to avoid mutating a shared aisle's staged state in a way other tests then depend on.
 * - Shortfall ("No location available") and multi-stack independence — would require
 *   either exhausting an aisle's empty locations or a much larger requested quantity,
 *   both flaky against a shared, mutating dev DB (same reasoning as sdp.spec.ts).
 * - Session persistence across navigation — Playwright's `page.goto` inside a test
 *   remounts the whole app fresh in this suite's setup, so it doesn't exercise the
 *   in-memory StagingContext the way a real client-side route change would.
 */
test.describe('STG — Stage Aisle', () => {
  test.use({ storageState: 'playwright/.auth/im.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/stage');
  });

  test('a stack with no inputs filled has a disabled Stage button', async ({ page }) => {
    await expect(stageButton(page, 0)).toBeDisabled();
  });

  test('filling Aisle + Storage + Size + Quantity populates a destination location and enables Stage', async ({ page }) => {
    await fillStackOne(page);
    await expect(stageButton(page, 0)).toBeEnabled();
  });

  test('staging completes and resets the stack while keeping Aisle/Storage/Size', async ({ page }) => {
    await fillStackOne(page);
    await expect(stageButton(page, 0)).toBeEnabled();
    await stageButton(page, 0).click();

    await expect(page.getByText(/pallets staged in Aisle 304/)).toBeVisible();
    // Quantity clears (Stage disables again) but Aisle/Storage persist for a repeat stage.
    await expect(stageButton(page, 0)).toBeDisabled();
    await expect(stackField(page, 0, 'Aisle')).toHaveText(LIVE_AISLE);
    await expect(stackField(page, 0, 'Storage')).toHaveText(LIVE_STORAGE);
  });

  test('master control "Fill All" populates unconfigured stacks only', async ({ page }) => {
    // Pre-configure Stack 2 with a Quantity so Fill All must skip it.
    await stackField(page, 1, 'Qty').click();
    await hardwareScan(page, '2');

    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').click();
    await hardwareScan(page, LIVE_STORAGE);
    await page.getByLabel('Master Size').selectOption(LIVE_SIZE);
    await page.getByRole('button', { name: 'Fill All' }).click();

    // Stack 1 (no quantity entered) inherits the master values.
    await expect(stackField(page, 0, 'Storage')).toHaveText(LIVE_STORAGE);
    // Stack 2 (quantity already entered) is left alone.
    await expect(stackField(page, 1, 'Storage')).toHaveText('—');
  });

  test('the log panel starts collapsed and expands on tap', async ({ page }) => {
    await expect(page.getByText('No staging activity this session — tap to expand')).toBeVisible();
    await page.getByText('No staging activity this session — tap to expand').click();
    await expect(page.getByText('Staging Log')).toBeVisible();
  });

  test('log entries appear after staging and persist in the expanded view', async ({ page }) => {
    await fillStackOne(page);
    await stageButton(page, 0).click();
    await expect(page.getByText(/pallets staged in Aisle 304/)).toBeVisible();

    await page.getByText(/pallets staged in Aisle 304/).click();
    await expect(page.getByText('Staging Log')).toBeVisible();
    await expect(page.getByText(/pallets staged in Aisle 304 → next location/)).toBeVisible();
  });

  test('IM sees the Unstage Aisle button and can open its modal', async ({ page }) => {
    const unstageBtn = page.getByRole('button', { name: 'Unstage Aisle' });
    await expect(unstageBtn).toBeVisible();
    await unstageBtn.click();

    await expect(page.getByText('Unstage Aisle', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear all staged locations' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restage with N pallets' })).toBeVisible();

    // Dismiss without submitting — this suite doesn't commit an unstage/restage.
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Unstage Aisle', { exact: true })).not.toBeVisible();
  });
});

test.describe('STG — Worker role gating', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  test('Worker does not see the Unstage Aisle button', async ({ page }) => {
    await page.goto('/stage');
    await expect(page.getByRole('button', { name: 'Unstage Aisle' })).not.toBeVisible();
  });
});
