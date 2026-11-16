import { test, expect, type Page } from '@playwright/test';
import { pickCode } from './helpers';

/**
 * Covers WLH's location resolution, hold placement + reason-code entry, hold removal,
 * and role-gated visibility of hold-type buttons. See DevNotes/Screen-Specs/WLH.md.
 */

/** Opens the Location ID Demo Scanner's Filter popup, sets the Hold dropdown, and submits
 *  (Feature 9, Phase 2) — used in place of WLH's now-retired "Find Held/Available
 *  Location" buttons, which the Hold axis's "Any Status" default reproduces exactly
 *  (those buttons never cared about occupancy either). */
async function findByHold(page: Page, holdLabel: string) {
  await page.getByRole('button', { name: 'Location by Filter' }).click();
  const holdDropdown = page.locator('div.relative.inline-flex', { hasText: 'Hold' }).first();
  await holdDropdown.getByRole('button').first().click();
  await holdDropdown.getByRole('button', { name: holdLabel, exact: true }).click();
  await page.getByRole('button', { name: 'Find', exact: true }).click();
}

test.describe('WLH — Warehouse Location Hold', () => {
  test.use({ storageState: 'playwright/.auth/im.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/hold');
  });

  test('loading a valid location shows the hold panel with no current hold', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Valid Location' }).click();
    await expect(page.getByText('Current Hold', { exact: true })).toBeVisible();
    await expect(page.getByText('None', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hold Inbound' })).toBeVisible();
  });

  test('an unknown location shows a not-found error', async ({ page }) => {
    await page.getByRole('button', { name: '✗ Invalid Location' }).click();
    await expect(page.getByText('Location not found')).toBeVisible();
  });

  // Issue #15 — the demo reseed seeds held locations, so Hold Any always finds one.
  test('finding a Hold Any location loads a location that is on hold', async ({ page }) => {
    await findByHold(page, 'Hold Any');
    await expect(page.getByText('Current Hold', { exact: true })).toBeVisible();
    await expect(page.getByText('None', { exact: true })).not.toBeVisible();
  });

  test('placing a hold requires a reason code and shows a success message', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Valid Location' }).click();
    await page.getByRole('button', { name: 'Hold Both' }).click();

    const confirmBtn = page.getByRole('button', { name: 'Confirm Hold' });
    await expect(confirmBtn).toBeDisabled();

    await pickCode(page, 'Reason Number', '01');
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    await expect(page.getByText(/Hold Both placed on/)).toBeVisible();
  });

  test('removing an active hold clears it back to None', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Valid Location' }).click();
    await page.getByRole('button', { name: 'Hold Both' }).click();
    await pickCode(page, 'Reason Number', '01');
    await page.getByRole('button', { name: 'Confirm Hold' }).click();
    await expect(page.getByText(/Hold Both placed on/)).toBeVisible();

    await page.getByRole('button', { name: 'Remove Hold' }).click();
    await expect(page.getByText(/Hold removed from/)).toBeVisible();
    await expect(page.getByText('None', { exact: true })).toBeVisible();
  });

  // Issue #15 — Hold axis in the Demo Scanner's Filter popup, replacing WLH's own
  // dedicated "Find Held/Available Location" buttons.
  test('finding a Not Held location loads some location with no current hold', async ({ page }) => {
    await findByHold(page, 'Not Held');
    await expect(page.getByText('Current Hold', { exact: true })).toBeVisible();
    await expect(page.getByText('None', { exact: true })).toBeVisible();
  });

  test('finding a specific hold type loads a location with that hold', async ({ page }) => {
    // Place one first so a Hold Both location is guaranteed to exist.
    await page.getByRole('button', { name: '✓ Valid Location' }).click();
    await page.getByRole('button', { name: 'Hold Both' }).click();
    await pickCode(page, 'Reason Number', '01');
    await page.getByRole('button', { name: 'Confirm Hold' }).click();
    await expect(page.getByText(/Hold Both placed on/)).toBeVisible();

    // The Location demo bar shows only while the Location field is focused — a fresh load
    // autofocuses it.
    await page.goto('/hold');
    await findByHold(page, 'Hold Both');
    await expect(page.getByText('Hold Both', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('None', { exact: true })).not.toBeVisible();
  });
});

test.describe('WLH — Worker role gating', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  test('Worker only sees Hold Both among placeable hold types', async ({ page }) => {
    await page.goto('/hold');
    await page.getByRole('button', { name: '✓ Valid Location' }).click();

    await expect(page.getByRole('button', { name: 'Hold Both' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hold Inbound' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Hold Outbound' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Hold Permanent' })).not.toBeVisible();
  });

  // Issue #14 — Range mode is IM+ only; a Worker shouldn't even see the mode toggle exists.
  test('Worker does not see the Range mode toggle at all', async ({ page }) => {
    await page.goto('/hold');
    await expect(page.getByRole('button', { name: 'Range', exact: true })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Single Location' })).not.toBeVisible();
  });
});

// Issue #14 — WLH Range mode: place/release a hold across a whole aisle's bin range at
// once. Uses a real, narrow, out-of-the-way sub-range of seeded aisle 301 (bins 125-127,
// odd only = bins 125 + 127 x 6 levels = 12 locations; the seed runs bins 1-128) rather than
// mocking the API. Each test first releases any In/Out/Both holds left in the range, so
// the tests are independent of run order (#197).
const RANGE = { aisle: '301', start: '125', end: '127', count: 12 };

test.describe('WLH — Range mode (issue #14)', () => {
  test.use({ storageState: 'playwright/.auth/im.json' });

  /** Types digits into the numpad, scoped to the panel to avoid ambiguous digit-button matches. */
  async function typeDigits(page: Page, value: string) {
    const panel = page.locator('[data-testid="numpad-panel"]');
    for (const ch of value) await panel.getByRole('button', { name: ch, exact: true }).click();
  }

  /** Fills Aisle/Start Bin/End Bin via the auto-advancing 3-digit chain, then Odd only. The
   *  100ms waits clear each field-to-field focus transition before the next digits. */
  async function fillRange(page: Page) {
    await page.locator('div.flex.flex-col.gap-1.w-\\[120px\\]', { hasText: 'Aisle' }).getByRole('button').click();
    await typeDigits(page, RANGE.aisle);
    await page.waitForTimeout(100);
    await typeDigits(page, RANGE.start);
    await page.waitForTimeout(100);
    await typeDigits(page, RANGE.end);
    await page.getByRole('button', { name: 'Odd only' }).click();
  }

  /** Places `holdName` on the range and confirms. */
  async function placeRange(page: Page, holdName: string) {
    await fillRange(page);
    await page.getByRole('button', { name: holdName }).click();
    await pickCode(page, 'Reason Number', '01');
    await page.getByRole('button', { name: 'Review Hold' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
  }

  /** Releases `levelName` on the range and confirms. */
  async function releaseRange(page: Page, levelName: string) {
    await fillRange(page);
    await page.getByRole('button', { name: 'Release', exact: true }).click();
    await page.getByRole('button', { name: levelName }).click();
    await page.getByRole('button', { name: 'Review Release' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText(/^Released /)).toBeVisible();
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/hold');
    await page.getByRole('button', { name: 'Range', exact: true }).click();
    // Clean slate: releasing Hold Both clears Both plus pure In/Out (#123).
    await releaseRange(page, 'Hold Both');
  });

  test('IM does not see Hold Permanent as a placeable range hold type', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Hold Permanent' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Hold Inbound' })).toBeVisible();
  });

  test('placing a range hold previews the exact range, then shows a breakdown and resets the form', async ({ page }) => {
    await fillRange(page);
    await page.getByRole('button', { name: 'Hold Inbound' }).click();
    await pickCode(page, 'Reason Number', '01');

    await page.getByRole('button', { name: 'Review Hold' }).click();
    await expect(page.getByText('Place range hold?')).toBeVisible();
    await expect(page.getByText(new RegExp(`Aisle ${RANGE.aisle}, Bin ${RANGE.start} through Bin ${RANGE.end} \\(Odd bins only\\) — ${RANGE.count} locations in range\\.`))).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByText(new RegExp(`^Placed Hold Inbound on ${RANGE.count} locations`))).toBeVisible();
    await expect(page.getByText(`${RANGE.count} placed (was None)`).first()).toBeVisible();
    // Form resets, including the Reason Code dropdown (it stays mounted across submits).
    await expect(page.getByRole('button', { name: 'Reason Number', exact: true })).toHaveText('—');
  });

  test('placing the opposite directional hold upgrades the range to Hold Both', async ({ page }) => {
    await placeRange(page, 'Hold Inbound');
    await expect(page.getByText(new RegExp(`^Placed Hold Inbound on ${RANGE.count} locations`))).toBeVisible();

    await placeRange(page, 'Hold Outbound');
    await expect(page.getByText(`${RANGE.count} upgraded Hold Inbound → Hold Both`).first()).toBeVisible();
  });

  test('releasing a range clears the holds', async ({ page }) => {
    await placeRange(page, 'Hold Both');
    await expect(page.getByText(new RegExp(`^Placed Hold Both on ${RANGE.count} locations`))).toBeVisible();

    await fillRange(page);
    await page.getByRole('button', { name: 'Release', exact: true }).click();
    await page.getByRole('button', { name: 'Hold Both' }).click();
    await page.getByRole('button', { name: 'Review Release' }).click();
    await expect(page.getByText('Release range holds?')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByText(new RegExp(`^Released Hold Both on ${RANGE.count} locations`))).toBeVisible();
    // The Hold Log is newest-first; the clean-slate release may have logged the same line.
    await expect(page.getByText(`${RANGE.count} released (was Hold Both)`).first()).toBeVisible();
  });
});
