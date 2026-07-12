import { test, expect } from '@playwright/test';

/**
 * Covers WLH's location resolution, hold placement + reason-code entry, hold removal,
 * and role-gated visibility of hold-type buttons. See DevNotes/Screen-Specs/WLH.md.
 */
test.describe('WLH — Warehouse Location Hold', () => {
  test.use({ storageState: 'playwright/.auth/im.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/hold');
  });

  test('loading a valid location shows the hold panel with no current hold', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Load Location' }).click();
    await expect(page.getByText('Current Hold', { exact: true })).toBeVisible();
    await expect(page.getByText('None', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hold Inbound' })).toBeVisible();
  });

  test('an unknown location shows a not-found error', async ({ page }) => {
    await page.getByRole('button', { name: '✗ Bad Location' }).click();
    await expect(page.getByText('Location not found')).toBeVisible();
  });

  // Issue #15 — must run before any test below places a hold (e.g. "placing a hold
  // requires a reason code" deliberately leaves its hold in place), since this asserts
  // on the state where nothing anywhere is on hold yet — true only at fresh-seed state.
  test('Find Held Location shows a not-found message when nothing is currently on hold', async ({ page }) => {
    await page.getByRole('button', { name: 'Find Held Location' }).click();
    await expect(page.getByText('No locations currently on hold.')).toBeVisible();
  });

  test('placing a hold requires a reason code and shows a success message', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Load Location' }).click();
    await page.getByRole('button', { name: 'Hold Both' }).click();

    const confirmBtn = page.getByRole('button', { name: 'Confirm Hold' });
    await expect(confirmBtn).toBeDisabled();

    await page.getByLabel('Reason code').selectOption('B01');
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    await expect(page.getByText(/Hold Both placed on/)).toBeVisible();
  });

  test('removing an active hold clears it back to None', async ({ page }) => {
    await page.getByRole('button', { name: '✓ Load Location' }).click();
    await page.getByRole('button', { name: 'Hold Both' }).click();
    await page.getByLabel('Reason code').selectOption('B01');
    await page.getByRole('button', { name: 'Confirm Hold' }).click();
    await expect(page.getByText(/Hold Both placed on/)).toBeVisible();

    await page.getByRole('button', { name: 'Remove Hold' }).click();
    await expect(page.getByText(/Hold removed from/)).toBeVisible();
    await expect(page.getByText('None', { exact: true })).toBeVisible();
  });

  // Issue #15 — helper-bar buttons to find a held/unheld location without typing one in blind.
  test('Find Available Location loads some location with no current hold', async ({ page }) => {
    await page.getByRole('button', { name: 'Find Available Location' }).click();
    await expect(page.getByText('Current Hold', { exact: true })).toBeVisible();
    await expect(page.getByText('None', { exact: true })).toBeVisible();
  });

  test('Find Held Location loads a location once one is actually on hold', async ({ page }) => {
    // Place a hold first (seed data starts with none), then confirm the helper button can find it.
    await page.getByRole('button', { name: '✓ Load Location' }).click();
    await page.getByRole('button', { name: 'Hold Both' }).click();
    await page.getByLabel('Reason code').selectOption('B01');
    await page.getByRole('button', { name: 'Confirm Hold' }).click();
    await expect(page.getByText(/Hold Both placed on/)).toBeVisible();

    await page.getByRole('button', { name: 'Find Held Location' }).click();
    await expect(page.getByText('Current Hold', { exact: true })).toBeVisible();
    await expect(page.getByText('None', { exact: true })).not.toBeVisible();
  });
});

test.describe('WLH — Worker role gating', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  test('Worker only sees Hold Both among placeable hold types', async ({ page }) => {
    await page.goto('/hold');
    await page.getByRole('button', { name: '✓ Load Location' }).click();

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
// once. Uses a real, narrow, out-of-the-way sub-range within seeded aisle 301 (bins
// 191-192, odd-only = 13 locations) rather than mocking the API — small enough to be fast,
// and unlikely enough to collide with the random single-location picks the tests above use
// (13 out of 36624 locations) to be an acceptable, already-established level of risk in this
// suite (see pip.spec.ts's similar reasoning for demo-label pool sharing).
test.describe('WLH — Range mode (issue #14)', () => {
  test.use({ storageState: 'playwright/.auth/im.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/hold');
    await page.getByRole('button', { name: 'Range', exact: true }).click();
  });

  /** Types digits into the numpad, scoped to the panel to avoid ambiguous digit-button matches. */
  async function typeDigits(page: import('@playwright/test').Page, value: string) {
    const panel = page.locator('[data-testid="numpad-panel"]');
    for (const ch of value) await panel.getByRole('button', { name: ch, exact: true }).click();
  }

  /** Fills Aisle/Start Bin/End Bin via the panel's auto-advancing 3-digit chain. The 100ms
   *  waits clear the Aisle→Start Bin (synchronous) and Start Bin→End Bin (its own explicit
   *  50ms setTimeout, mirroring LocationEntryFields' identical field-to-field delay) focus
   *  transitions before the next segment's digits are typed — typing immediately lands the
   *  next segment's first digit(s) in the field that's still active mid-transition. */
  async function fillRange(page: import('@playwright/test').Page, aisle: string, startBin: string, endBin: string) {
    await page.locator('div.flex.flex-col.gap-1.w-\\[120px\\]', { hasText: 'Aisle' }).getByRole('button').click();
    await typeDigits(page, aisle);
    await page.waitForTimeout(100);
    await typeDigits(page, startBin);
    await page.waitForTimeout(100);
    await typeDigits(page, endBin);
  }

  test('IM does not see Hold Permanent as a placeable range hold type', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Hold Permanent' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Hold Inbound' })).toBeVisible();
  });

  test('placing a range hold previews the exact range, then shows a breakdown and resets the form', async ({ page }) => {
    await fillRange(page, '301', '191', '192');
    await page.getByRole('button', { name: 'Odd only' }).click();
    await page.getByRole('button', { name: 'Hold Inbound' }).click();
    await page.getByLabel('Reason Code').selectOption('B01');

    await page.getByRole('button', { name: 'Review Hold' }).click();
    await expect(page.getByText('Place range hold?')).toBeVisible();
    await expect(page.getByText(/Aisle 301, Bin 191 through Bin 192 \(Odd bins only\) — 13 locations in range\./)).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByText('Placed Hold Inbound on 13 locations — Aisle 301, Bin 191–192 (Odd bins only)')).toBeVisible();
    // Form resets after a successful submit, including the Reason Code dropdown, which
    // doesn't reset on its own since it stays mounted across submits (see 12.1/#14 log).
    await expect(page.getByLabel('Reason Code')).toHaveValue('');
  });

  test('placing the opposite directional hold upgrades the range to Hold Both', async ({ page }) => {
    await fillRange(page, '301', '191', '192');
    await page.getByRole('button', { name: 'Odd only' }).click();
    await page.getByRole('button', { name: 'Hold Outbound' }).click();
    await page.getByLabel('Reason Code').selectOption('B01');
    await page.getByRole('button', { name: 'Review Hold' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByText(/Upgraded 13 to Hold Both/)).toBeVisible();
  });

  test('releasing a range clears the holds', async ({ page }) => {
    // Self-contained: place a hold on the range first rather than relying on any other
    // test in this file having left one there, so this passes regardless of run order.
    await fillRange(page, '301', '191', '192');
    await page.getByRole('button', { name: 'Odd only' }).click();
    await page.getByRole('button', { name: 'Hold Both' }).click();
    await page.getByLabel('Reason Code').selectOption('B01');
    await page.getByRole('button', { name: 'Review Hold' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText(/Placed Hold Both on 13 locations/)).toBeVisible();

    await fillRange(page, '301', '191', '192');
    await page.getByRole('button', { name: 'Odd only' }).click();
    await page.getByRole('button', { name: 'Release', exact: true }).click();
    // Hold Type/Reason Code are hidden for Release, matching the single-location flow's
    // own precedent (no reason code required to remove a hold).
    await expect(page.getByText('Hold Type', { exact: true })).not.toBeVisible();

    await page.getByRole('button', { name: 'Review Release' }).click();
    await expect(page.getByText('Release range holds?')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByText('Holds released on 13 locations (Aisle 301, Bin 191–192 (Odd bins only))')).toBeVisible();
  });
});
