import { test, expect, type Page } from '@playwright/test';
import { tapKeys, messageBarTone } from './helpers';

// Aisle 304 is a standard aisle seeded with plenty of EMPTY locations (see api/prisma/seed.ts,
// AISLE_PATTERN). If the dev DB has been heavily exercised without a re-seed, this aisle can
// fill up — re-seed (`cd api && npx prisma db seed`) if these tests start failing with NO_LOCATIONS.
const LIVE_AISLE = '304';

interface DirectedResult {
  reservationId: number;
  directedLocation: string;
  alreadyStored: boolean;
}

/** Types + submits the Aisle field, then taps a demo Pallet ID button, and returns the API result. */
async function directPallet(page: Page, aisle: string, demoButtonName: string): Promise<DirectedResult> {
  await tapKeys(page, aisle);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/puts/directed') && r.ok()),
    page.getByRole('button', { name: demoButtonName }).click(),
  ]);
  return resp.json();
}

/**
 * Covers every decision diamond in Documentation/Flowcharts-ERDs/sdp-flow.mmd.
 *
 * Not covered:
 * - DIR_OK -> NO_CARTONS: no demo endpoint returns a pallet with zero stored cartons, and
 *   hardcoding a specific pallet ID would break on re-seed (see Test Data Strategy).
 * - CONF_OK / UN_OK / BLK_OK -> NOT_FOUND (reservation expired): real 5-minute server-side
 *   timeout, not worth a real-clock-dependent test.
 * - BLK_OK -> NO_LOCATIONS: would require exhausting every eligible location in an aisle
 *   first, which is flaky against a shared, mutating dev DB.
 */
test.describe('SDP — System Directed Put flow', () => {
  test.use({ storageState: 'playwright/.auth/im.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/put/directed');
  });

  // Release any reservation a test leaves open so it doesn't tie up a location for 5 minutes.
  test.afterEach(async ({ page }) => {
    const unassign = page.getByRole('button', { name: 'Unassign' });
    if (await unassign.isVisible().catch(() => false)) {
      await unassign.click();
    }
  });

  // Node VALIDATE {Aisle entered?} -> No aisle
  test('the pallet field is disabled until an aisle is entered', async ({ page }) => {
    const palletField = page
      .locator('div.flex.flex-col.gap-1', { hasText: 'Scan Pallet ID' })
      .getByRole('button');
    await expect(palletField).toBeDisabled();
  });

  // Node DIR_OK {Result?} -> PALLET_NOT_FOUND
  test('an unknown pallet ID shows an error', async ({ page }) => {
    await tapKeys(page, '1');
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await page.getByRole('button', { name: '✗ PID' }).click();

    await expect(page.getByText('Pallet not found')).toBeVisible();
  });

  // Node DIR_OK {Result?} -> NO_LOCATIONS
  test('an aisle with no eligible locations shows an error', async ({ page }) => {
    await tapKeys(page, '99999');
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await page.getByRole('button', { name: '✓ Put' }).click();

    await expect(page.getByText('No eligible locations available in aisle 99999')).toBeVisible();
  });

  // Node DIR_OK {Result?} -> OK, and node MOVE_CHECK {alreadyStored?} -> No
  test('directing an unlocated pallet locks the screen with no move message', async ({ page }) => {
    await directPallet(page, LIVE_AISLE, '✓ Put');

    await expect(page.getByText('Screen locked — active reservation')).toBeVisible();
    await expect(page.getByText(/currently stored in/)).not.toBeVisible();
  });

  // Node MOVE_CHECK {alreadyStored?} -> Yes, not consolidating -> warning
  test('directing an already-stored pallet without consolidating shows a warning', async ({ page }) => {
    // Consolidating toggle defaults to off.
    await directPallet(page, LIVE_AISLE, '✓ Move');

    await expect(page.getByText(/currently stored in .* — directing as move/)).toBeVisible();
    expect(await messageBarTone(page)).toBe('warning');
  });

  // Node MOVE_CHECK {alreadyStored?} -> Yes, consolidating -> info
  test('directing an already-stored pallet while consolidating shows an info message', async ({ page }) => {
    await page.getByRole('button', { name: 'Consolidating' }).click();
    await directPallet(page, LIVE_AISLE, '✓ Move');

    await expect(page.getByText(/currently stored in .* — directing as move/)).toBeVisible();
    expect(await messageBarTone(page)).toBe('info');
  });

  // Node CONF_OK {Result?} -> LOCATION_MISMATCH
  test('confirming the wrong location shows an error and stays locked', async ({ page }) => {
    const { directedLocation } = await directPallet(page, LIVE_AISLE, '✓ Put');
    await page.getByRole('button', { name: '✗ Location' }).click();

    await expect(page.getByText(`Wrong location — directed to ${directedLocation}`)).toBeVisible();
    await expect(page.getByText('Screen locked — active reservation')).toBeVisible();
  });

  // Node CONF_OK {Result?} -> OK
  test('confirming the correct location completes the put and unlocks the screen', async ({ page }) => {
    const { directedLocation } = await directPallet(page, LIVE_AISLE, '✓ Put');
    await page.getByRole('button', { name: '✓ Location' }).click();

    await expect(page.getByText(`Put complete — ${directedLocation}`)).toBeVisible();
    await expect(page.getByText('Screen locked — active reservation')).not.toBeVisible();
  });

  // Node ACTION {Worker action?} -> Unassign -> node UN_OK {Result?} -> OK
  test('unassigning releases the reservation without completing a put', async ({ page }) => {
    const { directedLocation } = await directPallet(page, LIVE_AISLE, '✓ Put');
    await page.getByRole('button', { name: 'Unassign' }).click();

    await expect(page.getByText(`Reservation cleared — ${directedLocation} released`)).toBeVisible();
    await expect(page.getByText('Screen locked — active reservation')).not.toBeVisible();
    await expect(page.getByText(/^Put complete/)).not.toBeVisible();
  });

  // Node ACTION {Worker action?} -> Blocked Put (confirmation-gated) -> node BLK_OK {Result?} -> OK
  test('blocking the directed location holds it and redirects to a new one', async ({ page }) => {
    await directPallet(page, LIVE_AISLE, '✓ Put');
    await page.getByRole('button', { name: 'Blocked Put' }).click();

    // Confirmation gate: Cancel must not block anything.
    await expect(page.getByText('Place Hold Both?')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Place Hold Both?')).not.toBeVisible();
    await expect(page.getByText('Screen locked — active reservation')).toBeVisible();

    // Now actually confirm the block.
    await page.getByRole('button', { name: 'Blocked Put' }).click();
    await page.getByRole('button', { name: 'Hold Both' }).click();

    await expect(page.getByText(/^Hold Both placed on .* — now directed to /)).toBeVisible();
    await expect(page.getByText('Screen locked — active reservation')).toBeVisible(); // re-directed, still locked
  });

  test.describe('role gating (IM+ overrides)', () => {
    test('IM sees Size, Storage, and Zone override fields', async ({ page }) => {
      await expect(page.getByText('Size', { exact: true })).toBeVisible();
      await expect(page.getByText('Storage', { exact: true })).toBeVisible();
      await expect(page.getByText('Zone', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Consolidating' })).toBeVisible();
    });
  });

  // Issue #50: no "Applying: ..." summary until at least one override is actually set, then
  // it lists every selected override (not just one) — confirms overrides combine with AND
  // rather than the system only acting on a single one.
  test('the "Applying" summary lists every selected override', async ({ page }) => {
    await expect(page.getByText('Applying:')).not.toBeVisible();

    await page.getByRole('button', { name: 'M', exact: true }).click(); // Size quick-pick

    // The Zone wrapper also contains a "Lock" toggle button — target the field display
    // button specifically (its accessible name starts as the placeholder "—").
    const zoneField = page.locator('div.flex.flex-col.gap-1', { hasText: 'Zone' }).getByRole('button', { name: '—' });
    await zoneField.click();
    await tapKeys(page, '2');

    const summary = page.getByText(/^Applying:/);
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('Size M');
    await expect(summary).toContainText('Zone 2');
  });
});

test.describe('SDP — Worker role gating', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  test('Worker does not see IM+ override fields', async ({ page }) => {
    await page.goto('/put/directed');

    await expect(page.getByText('Size', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Storage', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Zone', { exact: true })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Consolidating' })).not.toBeVisible();
  });
});
