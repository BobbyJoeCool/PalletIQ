import { test, expect } from '@playwright/test';
import { hardwareScan } from './helpers';

test.use({ storageState: 'playwright/.auth/worker.json' });

/**
 * Covers every decision diamond in Documentation/Flowcharts-ERDs/pip-flow.mmd.
 *
 * Not covered — node PID_OK / UPC_OK / LOC_BIN -> WRONG_PULL_FUNCTION: by the time a label reaches
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

    // "Location" now appears twice — once as the resolved-location DataRow, once as the
    // new input field's label (issue #82) — .first() targets the DataRow specifically;
    // the field itself is asserted again, unambiguously, further down.
    await expect(page.getByText('Location', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Item', { exact: true })).toBeVisible();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();
    // Combined Current/Pull/Remaining quantity table (issue #62) — replaces the old
    // three separate "Pull qty"/"In location"/"Remaining" rows.
    await expect(page.getByText('Current', { exact: true })).toBeVisible();
    await expect(page.getByText('Pull', { exact: true })).toBeVisible();
    await expect(page.getByText('Remaining', { exact: true })).toBeVisible();
    await expect(page.getByText('Pallet ID', { exact: true })).toBeVisible();
    // Issue #82 — UPC and Location fields replace the old single Alternate ID field.
    await expect(page.getByText('UPC', { exact: true })).toBeVisible();
    await expect(page.getByText('Location', { exact: true }).last()).toBeVisible();
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

  // Node UPC_OK {Result?} -> ALTERNATE_MISMATCH, via the UPC field (issue #82 split)
  test('an invalid UPC shows an error and stays in verifying', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    await page.getByRole('button', { name: '✓ Scan Label' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();

    // The UPC demo buttons only render once the UPC field is focused (PID auto-focuses
    // on entering verifying; UPC/Location don't) — tap it first.
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'UPC' }).getByRole('button').click();
    await page.getByRole('button', { name: '✗ UPC' }).click();

    await expect(page.getByText('Invalid UPC')).toBeVisible();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();
  });

  // Node UPC_OK {Result?} -> OK -> SUCCESS, via the UPC field
  test('verifying by UPC completes the pull', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    await page.getByRole('button', { name: '✓ Scan Label' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();

    await page.locator('div.flex.flex-col.gap-1', { hasText: 'UPC' }).getByRole('button').click();
    await page.getByRole('button', { name: '✓ UPC' }).click();

    await expect(page.getByText(/^Last Pull .* — /)).toBeVisible();
  });

  // Node LOC_BIN {Result?} -> ALTERNATE_MISMATCH, via the Location field (issue #82 split)
  test('an invalid Location shows an error and stays in verifying', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    await page.getByRole('button', { name: '✓ Scan Label' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();

    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Location' }).getByRole('button').click();
    await page.getByRole('button', { name: '✗ Location' }).click();

    await expect(page.getByText('Invalid Location')).toBeVisible();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();
  });

  // Node LOC_BIN {Result?} -> OK -> SUCCESS, via the Location field
  test('verifying by Location completes the pull', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    await page.getByRole('button', { name: '✓ Scan Label' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();

    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Location' }).getByRole('button').click();
    await page.getByRole('button', { name: '✓ Location' }).click();

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

  // Issues #48/#49/#72: FP Location-field level mismatch prompts a popup to type the level
  // the pallet was actually pulled from (not just confirm/reject the scanned-but-wrong one).
  // Mocked at the API layer — crafting real seed data where a pallet's actual level is
  // known to differ from a scannable one would be too flaky to rely on.
  test('an FP level mismatch on Location prompts a correction popup; entering the actual level completes the pull', async ({ page }) => {
    // The seed data has no FP-function labels at all (see api/prisma/seed.ts's demo-label
    // comment — every seeded label defaults to CA), so /api/demo/label?fn=FP always 404s.
    // Mock the label lookup too, not just verify, so this test doesn't depend on seed data
    // that structurally can't support it.
    await page.route('**/api/demo/label*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ labelId: 'TESTLABEL1' }),
    }));
    await page.route('**/api/labels/TESTLABEL1', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        label: { id: 'TESTLABEL1', pullFunction: 'FP', quantity: { pallets: 1, cartons: 0, ssps: 0 }, dpci: '085-02-0006', descShort: 'Test Item' },
        pallet: { id: 12345, quantity: { pallets: 1, cartons: 0, ssps: 0 } },
        location: { id: '30105601' },
      }),
    }));

    let verifyCalls = 0;
    let secondCallBody: { location?: string; confirmLevelMismatch?: boolean } | null = null;
    await page.route('**/api/pulls/verify', async (route) => {
      verifyCalls++;
      const body = route.request().postDataJSON() as { confirmLevelMismatch?: boolean; location?: string };
      if (!body.confirmLevelMismatch) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'LEVEL_MISMATCH', scannedLevel: 1, actualLevel: 4 }),
        });
      } else {
        secondCallBody = body;
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

    // Focus the Location field, then deliver the scan directly via the hardware-scan path
    // rather than the "✓ Location" footer demo button — a more direct simulation of a real
    // barcode scan than a demo button click. The scanned value's digits don't matter to the
    // mocked /api/pulls/verify route above, only whether confirmLevelMismatch is set.
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Location' }).getByRole('button').click();
    await hardwareScan(page, '30105601');

    const dialog = page.getByTestId('level-correction-dialog');
    await expect(dialog.getByText('What level was this pallet actually pulled from?')).toBeVisible();
    await expect(dialog.getByText(/You scanned Level 1.*Level 4/)).toBeVisible();

    // Type the corrected level (4) on the popup's own keypad and confirm.
    await dialog.getByRole('button', { name: '4', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirm Level' }).click();

    await expect(page.getByText(/^Last Pull .* — /)).toBeVisible();
    expect(verifyCalls).toBe(2);
    // The resubmitted location's level digits are the worker's correction (04), not the
    // original scanned-but-wrong level (01) — aisle+bin are carried over unchanged.
    expect(secondCallBody?.location?.slice(-2)).toBe('04');
  });
});
