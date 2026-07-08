import { test, expect } from '@playwright/test';
import { hardwareScan } from './helpers';

test.use({ storageState: 'playwright/.auth/worker.json' });

/**
 * Covers every decision diamond in Documentation/Flowcharts-ERDs/pip-flow.mmd.
 *
 * Not covered — node PID_OK / ALT_OK -> WRONG_PULL_FUNCTION: by the time a label reaches
 * the `verifying` state, node FN_CHECK has already gated it to the selected pull function,
 * so /api/pulls/verify's WRONG_PULL_FUNCTION response is a defensive server-side check with
 * no reachable path through the UI to trigger it.
 */
test.describe('PIP — Pallet ID Pull flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pull');
  });

  /** Selects a pull function on the selectFunction screen, advancing to `ready`. */
  async function selectFunction(page: import('@playwright/test').Page, desc: string) {
    await page.getByRole('button', { name: desc }).click();
  }

  // Node L_FOUND {Found?} -> NOT_FOUND
  test('scanning an unknown label shows an error and stays in ready', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    await page.getByRole('button', { name: '✗ Scan Label' }).click();

    await expect(page.getByText('Label not found')).toBeVisible();
    // Verifying-only fields never appeared.
    await expect(page.getByText('Pallet ID', { exact: true })).not.toBeVisible();
  });

  // Node FN_CHECK {pullFunction match?} -> Mismatch
  test('scanning a label for a different pull function shows a mismatch error', async ({ page, request }) => {
    const token = await page.evaluate(() => localStorage.getItem('palletiq_token'));
    await selectFunction(page, 'Carton Air'); // selects CA

    const res = await request.get('/api/demo/label?fn=CF', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { labelId } = (await res.json()) as { labelId: string };

    await hardwareScan(page, labelId);

    await expect(page.getByText('Wrong function — label requires CF')).toBeVisible();
  });

  // Node L_FOUND {Found?} -> OK, entering State 3 (verifying)
  test('a valid label scan shows every State 2 field', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    await page.getByRole('button', { name: '✓ Scan Label' }).click();

    await expect(page.getByText('Location', { exact: true })).toBeVisible();
    await expect(page.getByText('Item', { exact: true })).toBeVisible();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();
    await expect(page.getByText('Pull qty', { exact: true })).toBeVisible();
    await expect(page.getByText('In location', { exact: true })).toBeVisible();
    await expect(page.getByText('Remaining', { exact: true })).toBeVisible();
    await expect(page.getByText('Pallet ID', { exact: true })).toBeVisible();
    await expect(page.getByText('Alternate ID', { exact: true })).toBeVisible();
  });

  // Node RESCAN {New label scanned while verifying?} -> Yes
  // Issue #45: this used to show a "Label not verified" warning that could stomp on a
  // still-relevant previous message — removed entirely (no status-bar update on a plain
  // rescan, only on an actual error) rather than fixed to fire at the "right" time.
  test('rescanning while verifying reloads with the new label and shows no warning', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/demo/label') && r.ok()),
      page.getByRole('button', { name: '✓ Scan Label' }).click(),
    ]);
    const { labelId } = (await resp.json()) as { labelId: string };
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();

    // Refocus the label field (its button's accessible name is its current value) and rescan.
    await page.getByRole('button', { name: labelId, exact: true }).click();
    await page.getByRole('button', { name: '✓ Scan Label' }).click();

    await expect(page.getByText('Label not verified')).not.toBeVisible();
    // Still showing verifying-state data (reloaded, not kicked back to ready).
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();
  });

  // Node PID_OK {Result?} -> PALLET_MISMATCH
  test('an incorrect Pallet ID shows an error and stays in verifying', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    await page.getByRole('button', { name: '✓ Scan Label' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: '✗ Scan PID' }).click();

    await expect(page.getByText('Incorrect Pallet ID')).toBeVisible();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible(); // still in verifying
  });

  // Node PID_OK {Result?} -> OK -> SUCCESS, including the "message persists" behavior
  test('verifying by Pallet ID completes the pull and the message persists through the next scan', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    await page.getByRole('button', { name: '✓ Scan Label' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: '✓ Scan PID' }).click();

    await expect(page.getByText(/^Last Pull .* — /)).toBeVisible();

    // Scanning the next label should not clear the "Last Pull" message before State 2 re-renders.
    await page.getByRole('button', { name: '✓ Scan Label' }).click();
    await expect(page.getByText(/^Last Pull .* — /)).toBeVisible();
  });

  // Node ALT_OK {Result?} -> ALTERNATE_MISMATCH
  test('an invalid Alternate ID shows an error and stays in verifying', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    await page.getByRole('button', { name: '✓ Scan Label' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();

    // The Alt ID demo buttons only render once the Alternate ID field is focused
    // (PID auto-focuses on entering verifying; Alt ID doesn't) — tap it first.
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Alternate ID' }).getByRole('button').click();
    await page.getByRole('button', { name: '✗ Alt ID' }).click();

    await expect(page.getByText('Invalid Alternate ID')).toBeVisible();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();
  });

  // Node ALT_OK {Result?} -> OK -> SUCCESS (verification via the alternate path instead of Pallet ID)
  test('verifying by Alternate ID completes the pull', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    await page.getByRole('button', { name: '✓ Scan Label' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();

    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Alternate ID' }).getByRole('button').click();
    await page.getByRole('button', { name: '✓ Alt ID' }).click();

    await expect(page.getByText(/^Last Pull .* — /)).toBeVisible();
  });

  // Node L_FOUND {Found?} -> BAD STATUS (a label already Pulled)
  test('re-scanning an already-pulled label shows an invalid status error', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/demo/label') && r.ok()),
      page.getByRole('button', { name: '✓ Scan Label' }).click(),
    ]);
    const { labelId } = (await resp.json()) as { labelId: string };

    await page.getByRole('button', { name: '✓ Scan PID' }).click();
    await expect(page.getByText(/^Last Pull .* — /)).toBeVisible();

    // Re-scan the same label ID — it's now PULLED, not PRINTED.
    await hardwareScan(page, labelId);

    await expect(page.getByText('Invalid status: PULLED')).toBeVisible();
  });

  // Issues #48/#49: FP Alt-ID level mismatch prompts a confirm dialog instead of rejecting
  // outright. Mocked at the API layer — crafting real seed data where a pallet's actual
  // level is known to differ from a scannable one would be too flaky to rely on.
  test('an FP level mismatch on Alt ID prompts a confirm dialog; confirming completes the pull', async ({ page }) => {
    let verifyCalls = 0;
    await page.route('**/api/pulls/verify', async (route) => {
      verifyCalls++;
      const body = route.request().postDataJSON() as { confirmLevelMismatch?: boolean };
      if (!body.confirmLevelMismatch) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'LEVEL_MISMATCH', scannedLevel: 1, actualLevel: 4 }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ location: '30105604', updatedQuantity: { pallets: 0, cartons: 0, ssps: 0 } }),
        });
      }
    });

    await selectFunction(page, 'Full Pallet');
    await page.getByRole('button', { name: '✓ Scan Label' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();

    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Alternate ID' }).getByRole('button').click();
    await page.getByRole('button', { name: '✓ Alt ID' }).click();

    await expect(page.getByText("Level doesn't match")).toBeVisible();
    await expect(page.getByText(/You scanned Level 1.*Level 4/)).toBeVisible();

    await page.getByRole('button', { name: 'Confirm Pull' }).click();

    await expect(page.getByText(/^Last Pull .* — /)).toBeVisible();
    expect(verifyCalls).toBe(2);
  });
});
