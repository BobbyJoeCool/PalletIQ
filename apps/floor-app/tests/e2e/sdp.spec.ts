import { test, expect, type Page } from '@playwright/test';
import { pickCode, tapKeys, messageBarTone } from './helpers';
import { fmtLocation } from '../../src/lib/fmt';

// Aisle 304 is a standard aisle seeded with plenty of EMPTY locations (see api/prisma/seed.ts,
// AISLE_PATTERN). If the dev DB has been heavily exercised without a re-seed, this aisle can
// fill up — re-seed (`cd api && npx prisma db seed`) if these tests start failing with NO_LOCATIONS.
const LIVE_AISLE = '304';

interface DirectedResult {
  reservationId: number;
  directedLocation: string;
  alreadyStored: boolean;
}

/**
 * Selects an option from one of the Pallet ID Demo Scanner popup's filter dropdowns
 * (Storage Code/Size) — scoped by the dropdown's own visible label (`Dropdown.tsx` wraps
 * label + toggle button + option list in one containing div) to disambiguate Storage Code's
 * "Any ▾" from Size's own.
 */
async function pickDemoFilter(page: Page, label: string, optionLabel: string) {
  const dropdown = page.locator('div.relative.inline-flex', { hasText: label });
  await dropdown.getByRole('button').first().click();
  await dropdown.getByRole('button', { name: optionLabel, exact: true }).click();
}

/**
 * Types + submits the Aisle field, then opens the Pallet ID Demo Scanner's by-status popup,
 * selects Storage Code/Size matching Aisle 304's own eligible CR/Small locations (direct
 * instruction — the popup's own Storage Code/Size filters pick the *starting* pallet's
 * native type; the "no eligible locations" failure this guards against is a real one, since
 * an unfiltered "Any" pick over the whole warehouse rarely lands on Aisle 304's specific
 * type), sets Status (Feature 9, Phase 1 — SDP no longer has its own dedicated ✓ Put/✓ Move
 * buttons, or the by-status popup's own former quick presets; Status defaults to Put
 * Pending, matching the `put` case with no extra step, `move` explicitly selects Stored),
 * taps Find, and returns the API result.
 */
async function directPallet(page: Page, aisle: string, mode: 'put' | 'move'): Promise<DirectedResult> {
  await tapKeys(page, aisle);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.getByRole('button', { name: 'Pallet ID by Status' }).click();
  if (mode === 'move') await pickDemoFilter(page, 'Status', 'Stored');
  await pickDemoFilter(page, 'Storage Code', 'Conveyable Reserve');
  await pickDemoFilter(page, 'Size', 'Small');
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/puts/directed') && r.ok()),
    page.getByRole('button', { name: 'Find', exact: true }).click(),
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
    await tapKeys(page, LIVE_AISLE);
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await page.getByRole('button', { name: '✗ Invalid Pallet ID' }).click();

    await expect(page.getByText('Pallet ID not found')).toBeVisible();
  });

  // Node DIR_OK {Result?} -> NO_LOCATIONS
  test('an aisle with no eligible locations shows an error', async ({ page }) => {
    // Status left at Put Pending (the popup's own default) — Aisle 99999 has zero
    // locations of any type, so any pallet still correctly hits NO_LOCATIONS. Depends on
    // `reseedTestData`/`seed-pending-pallets.ts` actually having populated some Put
    // Pending pallets — see those files' own fix for the Storage Code/Size gap.
    await tapKeys(page, '99999');
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await page.getByRole('button', { name: 'Pallet ID by Status' }).click();
    await page.getByRole('button', { name: 'Find', exact: true }).click();

    await expect(page.getByText('No eligible locations available in aisle 99999')).toBeVisible();
  });

  // Node DIR_OK {Result?} -> OK, and node MOVE_CHECK {alreadyStored?} -> No
  test('directing an unlocated pallet locks the screen with no move message', async ({ page }) => {
    await directPallet(page, LIVE_AISLE, 'put');

    await expect(page.getByText('Screen locked — active reservation')).toBeVisible();
    await expect(page.getByText(/currently stored in/)).not.toBeVisible();
  });

  // Node MOVE_CHECK {alreadyStored?} -> Yes, not consolidating -> warning
  test('directing an already-stored pallet without consolidating shows a warning', async ({ page }) => {
    // Consolidating toggle defaults to off.
    await directPallet(page, LIVE_AISLE, 'move');

    await expect(page.getByText(/currently stored in .* — directing as move/)).toBeVisible();
    expect(await messageBarTone(page)).toBe('warning');
  });

  // Node MOVE_CHECK {alreadyStored?} -> Yes, consolidating -> info
  test('directing an already-stored pallet while consolidating shows an info message', async ({ page }) => {
    await page.getByRole('button', { name: 'Consolidating' }).click();
    await directPallet(page, LIVE_AISLE, 'move');

    await expect(page.getByText(/currently stored in .* — directing as move/)).toBeVisible();
    expect(await messageBarTone(page)).toBe('info');
  });

  // Node CONF_OK {Result?} -> LOCATION_MISMATCH
  test('confirming the wrong location shows an error and stays locked', async ({ page }) => {
    // `Move`, not `Put` — this test only cares about the confirm step, and `Move` is
    // reliably backed by real seed data (see the "no eligible locations" test's own note).
    const { directedLocation } = await directPallet(page, LIVE_AISLE, 'move');
    await page.getByRole('button', { name: '✗ Location' }).click();

    await expect(page.getByText(`Wrong location — directed to ${directedLocation}`)).toBeVisible();
    await expect(page.getByText('Screen locked — active reservation')).toBeVisible();
  });

  // Node CONF_OK {Result?} -> OK
  test('confirming the correct location completes the put and unlocks the screen', async ({ page }) => {
    const { directedLocation } = await directPallet(page, LIVE_AISLE, 'move');
    await page.getByRole('button', { name: '✓ Location' }).click();

    // `Move`, not `Put` (see directPallet's own note) — a Move's completion message is
    // "Move complete — {cleared} → {directed}", not "Put complete — {directed}" — no `$`
    // anchor after the location, since landing on an EMPTY (not pre-staged) location adds
    // a further "— location was not staged" suffix.
    await expect(page.getByText(new RegExp(`^Move complete — .* → ${fmtLocation(directedLocation)}`))).toBeVisible();
    await expect(page.getByText('Screen locked — active reservation')).not.toBeVisible();
  });

  // Node ACTION {Worker action?} -> Unassign -> node UN_OK {Result?} -> OK
  test('unassigning releases the reservation without completing a put', async ({ page }) => {
    const { directedLocation } = await directPallet(page, LIVE_AISLE, 'move');
    await page.getByRole('button', { name: 'Unassign' }).click();

    await expect(page.getByText(`Reservation cleared — ${directedLocation} released`)).toBeVisible();
    await expect(page.getByText('Screen locked — active reservation')).not.toBeVisible();
    await expect(page.getByText(/^Put complete/)).not.toBeVisible();
  });

  // Node ACTION {Worker action?} -> Blocked Put (confirmation-gated) -> node BLK_OK {Result?} -> OK
  test('blocking the directed location holds it and redirects to a new one', async ({ page }) => {
    await directPallet(page, LIVE_AISLE, 'move');
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

    await pickCode(page, 'Size', 'M');
    // Zone override is a plain, never-narrowed dropdown (issue #80) — not the free-text +
    // dropdown-helper pattern Size/Storage use.
    await page.getByLabel('Zone', { exact: true }).selectOption('2');

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
