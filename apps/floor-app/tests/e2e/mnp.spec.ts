import { test, expect, type Page } from '@playwright/test';
import { tapKeys, messageBarTone } from './helpers';

test.use({ storageState: 'playwright/.auth/worker.json' });

/**
 * Opens the Pallet ID Demo Scanner's by-status popup and taps Find (Feature 9, Phase 1 —
 * MNP no longer has its own dedicated ✓ Put/✓ Move buttons, or the popup's own former
 * quick presets; Status defaults to Put Pending, matching the `put` case with no extra
 * step, `move` explicitly selects Stored first), then waits for the pallet_scanned state
 * to render.
 */
async function scanPallet(page: Page, mode: 'put' | 'move') {
  await page.getByRole('button', { name: 'Pallet ID by Status' }).click();
  if (mode === 'move') {
    const statusDropdown = page.locator('div.relative.inline-flex', { hasText: 'Status' });
    await statusDropdown.getByRole('button').first().click();
    await statusDropdown.getByRole('button', { name: 'Stored', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(page.getByText('Item', { exact: true })).toBeVisible();
}

/**
 * Opens the Location ID Demo Scanner's Filter popup, sets Status, and taps Find (Feature
 * 9, Phase 2 — MNP no longer has its own dedicated ✓ Empty/~ Occupied buttons).
 */
async function pickDestination(page: Page, statusLabel: 'Empty' | 'Stored') {
  await page.getByRole('button', { name: 'Location by Filter' }).click();
  const statusDropdown = page.locator('div.relative.inline-flex', { hasText: 'Status' });
  await statusDropdown.getByRole('button').first().click();
  await statusDropdown.getByRole('button', { name: statusLabel, exact: true }).click();
  await page.getByRole('button', { name: 'Find', exact: true }).click();
}

/**
 * Confirms the (already-open) LevelModal's own pre-filled level via Enter, without typing
 * a digit — deliberately not a fixed literal like `'1'`: `api/prisma/seed.ts`'s
 * `isContractedLocation` makes level 1 *always* contracted in every standard-pattern
 * aisle, so a hardcoded "always type 1" would collide with that real, deliberate seed
 * pattern whenever the randomly-fetched demo location happened to be in one (most of
 * them — only the folded/XS-overflow aisles are exempt). The pre-fill is already the
 * correct, real level for whichever location was actually fetched — confirming it as-is
 * both matches the common real-world case (a worker confirming a level the system already
 * resolved) and avoids fighting the contraction pattern entirely.
 */
async function confirmLevel(page: Page) {
  const modal = page.getByRole('heading', { name: 'What level was the pallet placed at?' }).locator('xpath=..');
  await modal.getByRole('button', { name: 'Enter', exact: true }).click();
}

/**
 * Covers every decision diamond in Documentation/Flowcharts-ERDs/mnp-flow.mmd.
 *
 * Not covered:
 * - SCAN_OK -> NO_CARTONS: no demo endpoint returns a zero-carton pallet, and hardcoding
 *   a specific pallet ID would break on re-seed (see Test Data Strategy in the tutoring brief).
 * - CONF_OK -> NOT_FOUND / General error: both require the destination location to become
 *   invalid between LOC_OK's validation and the confirm call — not reachable through the UI.
 * - The "MNP_SCAN is always logged, even on failure" behavior noted on the flowchart isn't
 *   checkable from the UI alone — there's no activity-log query endpoint built yet.
 */
test.describe('MNP — Manual Put flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/put/manual');
  });

  // Node SCAN_OK {Result?} -> PALLET_NOT_FOUND
  test('an unknown pallet ID shows an error and stays in ready', async ({ page }) => {
    await page.getByRole('button', { name: '✗ Invalid Pallet ID' }).click();

    await expect(page.getByText('Pallet not found')).toBeVisible();
    await expect(page.getByText('Item', { exact: true })).not.toBeVisible();
  });

  // Node ELIG_CHECK {alreadyStored?} -> Yes
  test('scanning an already-stored pallet shows a non-blocking move message', async ({ page }) => {
    await scanPallet(page, 'move');

    await expect(page.getByText(/currently stored in .* — proceeding as move/)).toBeVisible();
    // Non-blocking: the flow still advances to pallet_scanned.
    await expect(page.getByText('Item', { exact: true })).toBeVisible();
  });

  // Node LOC_OK {Found?} -> Not found
  test('an unknown destination location shows an error and stays in pallet_scanned', async ({ page }) => {
    await scanPallet(page, 'put');
    await tapKeys(page, '999999');
    await page.getByRole('button', { name: 'OK', exact: true }).click();

    await expect(page.getByText('Location not found')).toBeVisible();
    await expect(page.getByText('Destination Location', { exact: true })).toBeVisible(); // still pallet_scanned
  });

  // Node CLR {Worker taps Clear} -> back to ready
  test('the Clear button resets to ready', async ({ page }) => {
    await scanPallet(page, 'put');
    await page.getByRole('button', { name: 'Clear' }).click();

    await expect(page.getByText('Destination Location', { exact: true })).not.toBeVisible();
    const palletField = page
      .locator('div.flex.flex-col.gap-1', { hasText: 'Scan Pallet ID' })
      .getByRole('button');
    await expect(palletField).toBeEnabled();
  });

  // Node S3 {level_modal} — the modal fully replaces the prior screen's interactive controls
  test('a valid destination opens the blocking level-selection modal', async ({ page }) => {
    await scanPallet(page, 'put');
    await pickDestination(page, 'Empty');

    await expect(page.getByRole('heading', { name: 'What level was the pallet placed at?' })).toBeVisible();
    // The pallet_scanned screen's own controls are gone — the modal is the only interaction surface.
    await expect(page.getByText('Destination Location', { exact: true })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear' })).not.toBeVisible();
  });

  // Node CONF_OK {Result?} -> OK, destination was empty
  test('confirming a level on an empty location completes the put', async ({ page }) => {
    await scanPallet(page, 'put');
    await pickDestination(page, 'Empty');
    await confirmLevel(page);

    await expect(page.getByText(/^Put complete — \d{3}-\d{3}-\d{2} Level \d+$/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What level was the pallet placed at?' })).not.toBeVisible();
  });

  // Node CONF_OK {Result?} -> OK, destination was occupied (non-blocking warning, contrasted with the modal's blocking behavior above)
  test('confirming a level on an occupied location still succeeds, with a warning', async ({ page }) => {
    await scanPallet(page, 'put');
    await pickDestination(page, 'Stored');
    await confirmLevel(page);

    await expect(page.getByText(/\(was occupied\)$/)).toBeVisible();
    expect(await messageBarTone(page)).toBe('warning');
    // Non-blocking: put still completed and the screen reset, unlike the blocking level modal.
    await expect(page.getByRole('heading', { name: 'What level was the pallet placed at?' })).not.toBeVisible();
  });
});
