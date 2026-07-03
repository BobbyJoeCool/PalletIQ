import { test, expect, type Page } from '@playwright/test';
import { tapKeys, messageBarTone } from './helpers';

test.use({ storageState: 'playwright/.auth/worker.json' });

/** Scans a pallet via the named demo button and waits for the pallet_scanned state to render. */
async function scanPallet(page: Page, demoButtonName: string) {
  await page.getByRole('button', { name: demoButtonName }).click();
  await expect(page.getByText('Item', { exact: true })).toBeVisible();
}

/** Types a digit into the (already-open) LevelModal and taps Enter, scoped to the modal itself. */
async function selectLevel(page: Page, digit: string) {
  const modal = page.getByRole('heading', { name: 'What level was the pallet placed at?' }).locator('xpath=..');
  await modal.getByRole('button', { name: digit, exact: true }).click();
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
    await page.getByRole('button', { name: '✗ PID' }).click();

    await expect(page.getByText('Pallet not found')).toBeVisible();
    await expect(page.getByText('Item', { exact: true })).not.toBeVisible();
  });

  // Node ELIG_CHECK {alreadyStored?} -> Yes
  test('scanning an already-stored pallet shows a non-blocking move message', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Move' }).click();

    await expect(page.getByText(/currently stored in .* — proceeding as move/)).toBeVisible();
    // Non-blocking: the flow still advances to pallet_scanned.
    await expect(page.getByText('Item', { exact: true })).toBeVisible();
  });

  // Node LOC_OK {Found?} -> Not found
  test('an unknown destination location shows an error and stays in pallet_scanned', async ({ page }) => {
    await scanPallet(page, '✓ Put');
    await tapKeys(page, '999999');
    await page.getByRole('button', { name: 'OK', exact: true }).click();

    await expect(page.getByText('Location not found')).toBeVisible();
    await expect(page.getByText('Destination Location', { exact: true })).toBeVisible(); // still pallet_scanned
  });

  // Node CLR {Worker taps Clear} -> back to ready
  test('the Clear button resets to ready', async ({ page }) => {
    await scanPallet(page, '✓ Put');
    await page.getByRole('button', { name: 'Clear' }).click();

    await expect(page.getByText('Destination Location', { exact: true })).not.toBeVisible();
    const palletField = page
      .locator('div.flex.flex-col.gap-1', { hasText: 'Scan Pallet ID' })
      .getByRole('button');
    await expect(palletField).toBeEnabled();
  });

  // Node S3 {level_modal} — the modal fully replaces the prior screen's interactive controls
  test('a valid destination opens the blocking level-selection modal', async ({ page }) => {
    await scanPallet(page, '✓ Put');
    await page.getByRole('button', { name: '✓ Empty' }).click();

    await expect(page.getByRole('heading', { name: 'What level was the pallet placed at?' })).toBeVisible();
    // The pallet_scanned screen's own controls are gone — the modal is the only interaction surface.
    await expect(page.getByText('Destination Location', { exact: true })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear' })).not.toBeVisible();
  });

  // Node CONF_OK {Result?} -> OK, destination was empty
  test('confirming a level on an empty location completes the put', async ({ page }) => {
    await scanPallet(page, '✓ Put');
    await page.getByRole('button', { name: '✓ Empty' }).click();
    await selectLevel(page, '1');

    await expect(page.getByText(/^Put complete — \d{3}-\d{3}-\d{2} Level 1$/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What level was the pallet placed at?' })).not.toBeVisible();
  });

  // Node CONF_OK {Result?} -> OK, destination was occupied (non-blocking warning, contrasted with the modal's blocking behavior above)
  test('confirming a level on an occupied location still succeeds, with a warning', async ({ page }) => {
    await scanPallet(page, '✓ Put');
    await page.getByRole('button', { name: '~ Occupied' }).click();
    await selectLevel(page, '1');

    await expect(page.getByText(/\(was occupied\)$/)).toBeVisible();
    expect(await messageBarTone(page)).toBe('warning');
    // Non-blocking: put still completed and the screen reset, unlike the blocking level modal.
    await expect(page.getByRole('heading', { name: 'What level was the pallet placed at?' })).not.toBeVisible();
  });
});
