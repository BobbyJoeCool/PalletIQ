import { test, expect, type Page } from '@playwright/test';
import { hardwareScan, tapKeys } from './helpers';

/**
 * Status-matrix coverage (#197): drives each screen through the real Demo Scanner filter
 * popups (Status × Storage Code × Size for pallets; Status × Hold × Contraction for
 * locations) and asserts the expected outcome for every meaningful combination, instead of
 * screen-specific demo buttons that go stale whenever a screen's UI changes.
 *
 * Combinations the current seed data can't supply (the demo popup reports "unavailable")
 * are skipped, not failed — the matrix asserts behavior, not data availability.
 */

/** Picks an option in one of a demo popup's labeled dropdowns. */
async function pick(page: Page, label: string, option: string) {
  const dropdown = page.locator('div.relative.inline-flex', { hasText: label }).first();
  await dropdown.getByRole('button').first().click();
  await dropdown.getByRole('button', { name: option, exact: true }).click();
}

/** Skips the current test if the demo scanner couldn't find data for the filters. */
async function skipIfUnavailable(page: Page, text: string) {
  // isVisible() doesn't wait; the message arrives after the demo fetch resolves.
  const appeared = await page.getByText(text).waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false);
  if (appeared) {
    test.skip(true, 'seed data has no record for this combination');
  }
}

// ── SDP — Pallet Status × Storage Code × Size ─────────────────────────────────

test.describe('Status matrix — SDP directed put', () => {
  test.use({ storageState: 'playwright/.auth/im.json' });

  // Aisle 304 is a CR aisle holding Small locations only (seed.ts patternSize).
  const AISLE = '304';

  async function directByStatus(page: Page, status: string, storage = 'Any', size = 'Any') {
    await page.goto('/put/directed');
    await tapKeys(page, AISLE);
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await page.getByRole('button', { name: 'Pallet ID by Status' }).click();
    await pick(page, 'Status', status);
    if (storage !== 'Any') await pick(page, 'Storage Code', storage);
    if (size !== 'Any') await pick(page, 'Size', size);
    await page.getByRole('button', { name: 'Find', exact: true }).click();
    await skipIfUnavailable(page, 'Demo pallet unavailable');
  }

  // Eligibility is checked before any location search, so Storage Code/Size don't matter.
  const INELIGIBLE: [string, string][] = [
    ['CA Pull Pending', 'Invalid Pallet: Pull Pending'],
    ['FP Pull Pending', 'Invalid Pallet: Pull Pending'],
    ['Canceled', 'Invalid Pallet: Canceled'],
    ['Consolidated', 'Invalid Pallet: No Cartons'],
    ['Pulled', 'Invalid Pallet: No Cartons'],
  ];
  for (const [status, message] of INELIGIBLE) {
    test(`${status} pallet → "${message}"`, async ({ page }) => {
      await directByStatus(page, status);
      await expect(page.getByText(message)).toBeVisible();
      await expect(page.getByTestId('sdp-verify-put-modal')).not.toBeVisible();
    });
  }

  // Put Pending / Stored × Storage Code × Size against aisle 304's CR/Small-only stock.
  const ELIGIBLE: { status: string; storage: string; size: string; directed: boolean }[] = [
    { status: 'Put Pending', storage: 'Conveyable Reserve', size: 'Small', directed: true },
    { status: 'Stored', storage: 'Conveyable Reserve', size: 'Small', directed: true },
    { status: 'Put Pending', storage: 'Conveyable Reserve', size: 'Large', directed: false },
    { status: 'Put Pending', storage: 'Non-Conveyable Reserve', size: 'Small', directed: false },
  ];
  for (const c of ELIGIBLE) {
    test(`${c.status} ${c.storage}/${c.size} in aisle ${AISLE} → ${c.directed ? 'directed' : 'no eligible location'}`, async ({ page }) => {
      await directByStatus(page, c.status, c.storage, c.size);
      if (c.directed) {
        await expect(page.getByTestId('sdp-verify-put-modal')).toBeVisible();
        if (c.status === 'Stored') await expect(page.getByText(/currently stored in .* — directing as move/)).toBeVisible();
        // Release the reservation so the matrix leaves no state behind.
        await page.getByTestId('sdp-verify-put-modal').getByRole('button', { name: 'Unassign' }).click();
        await expect(page.getByText(/^Reservation cleared/)).toBeVisible();
      } else {
        await expect(page.getByText(`No eligible locations available in aisle ${AISLE}`)).toBeVisible();
      }
    });
  }
});

// ── WLH — Location Hold filter → Current Hold ─────────────────────────────────

test.describe('Status matrix — WLH current hold', () => {
  test.use({ storageState: 'playwright/.auth/im.json' });

  async function findLocation(page: Page, hold: string) {
    await page.goto('/hold');
    await page.getByRole('button', { name: 'Location by Filter' }).click();
    await pick(page, 'Hold', hold);
    await page.getByRole('button', { name: 'Find', exact: true }).click();
    await skipIfUnavailable(page, 'Demo location unavailable');
    await expect(page.getByText('Current Hold', { exact: true })).toBeVisible();
  }

  const HOLDS: [string, string][] = [
    ['Not Held', 'None'],
    ['Hold In', 'Hold Inbound'],
    ['Hold Out', 'Hold Outbound'],
    ['Hold Both', 'Hold Both'],
    ['Hold Perm', 'Hold Permanent'],
  ];
  for (const [filter, shown] of HOLDS) {
    test(`Hold filter "${filter}" → Current Hold "${shown}"`, async ({ page }) => {
      await findLocation(page, filter);
      const currentHold = page.locator('div', { has: page.getByText('Current Hold', { exact: true }) }).last();
      await expect(currentHold.getByText(shown, { exact: true })).toBeVisible();
    });
  }

  // Placing is blocked while a hold exists that the role can't remove (#212's holdTransition).
  test('IM on a Hold Permanent location sees no placeable hold types', async ({ page }) => {
    await findLocation(page, 'Hold Perm');
    await expect(page.getByRole('button', { name: /^Hold Inbound/ })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /^Hold Both/ })).not.toBeVisible();
  });
});

// ── PAR — Location Status × Hold × Contraction → reinstate warning ────────────

test.describe('Status matrix — PAR location warning', () => {
  test.use({ storageState: 'playwright/.auth/im.json' });

  // PAR's footer demo slot is its Item scanner (it registers unconditionally), so the
  // Location demo popup never shows here. Fetch a matching location from the same demo
  // endpoint that popup uses, then scan it into the Location field like a real scanner.
  async function enterLocation(page: Page, filters: { status: string; hold: string; contraction: string }) {
    const login = await page.request.post('/api/auth/login', { data: { zNumber: 'z002p22', pin: '1234' } });
    const { token } = await login.json() as { token: string };
    const params = new URLSearchParams(filters);
    const res = await page.request.get(`/api/demo/location?${params}`, { headers: { 'X-Auth-Token': token } });
    test.skip(!res.ok(), 'seed data has no location for this combination');
    const { locationId, level } = await res.json() as { locationId: string; level: number };

    await page.goto('/pallet/reinstate');
    // The Location Aisle box: the first field box after the "Location (optional)" label.
    await page.locator("xpath=//span[contains(., 'Location (optional)')]/following::button[@data-numpad-field][1]").click();
    await hardwareScan(page, locationId + String(level).padStart(2, '0'));
  }

  /** The amber inline summary next to the Location label (empty when no warning). */
  const warning = (page: Page) => page.locator('span.text-\\[\\#DDAA00\\]').first();

  const CASES: { name: string; filters: { status: string; hold: string; contraction: string }; expect: string | null }[] = [
    { name: 'empty, unheld, not contracted', filters: { status: 'empty', hold: 'not', contraction: 'no' }, expect: null },
    // #212: Hold Outbound is outbound-only — no reinstate warning.
    { name: 'empty, Hold Out', filters: { status: 'empty', hold: 'out', contraction: 'no' }, expect: null },
    { name: 'empty, Hold In', filters: { status: 'empty', hold: 'in', contraction: 'no' }, expect: 'Hold Inbound' },
    { name: 'empty, Hold Both', filters: { status: 'empty', hold: 'both', contraction: 'no' }, expect: 'Hold Both' },
    { name: 'empty, contracted', filters: { status: 'empty', hold: 'not', contraction: 'yes' }, expect: 'Contracted' },
    { name: 'stored', filters: { status: 'stored', hold: 'not', contraction: 'no' }, expect: 'STORED' },
  ];
  for (const c of CASES) {
    test(`location ${c.name} → ${c.expect ? `warns "${c.expect}"` : 'no warning'}`, async ({ page }) => {
      await enterLocation(page, c.filters);
      if (c.expect) await expect(warning(page)).toContainText(c.expect);
      else await expect(warning(page)).toHaveCount(0);
    });
  }
});
