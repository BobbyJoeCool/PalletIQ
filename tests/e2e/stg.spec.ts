import { test, expect, type Page } from '@playwright/test';
import { pickCode, tapKeys } from './helpers';

// Chosen for a healthy empty CR-L count under the current seed. Aisle 304 (this spec's
// original choice, pre-issue-#77) is now fully staged — see api/prisma/seed.ts's demo-
// staging comment ("Aisle 304 is fully staged") — so it no longer has room to stage into.
// Re-seed (`cd api && npx prisma db seed`) if this test starts failing with unplaced pallets.
const LIVE_AISLE = '305';
const LIVE_STORAGE = 'CR';
const LIVE_SIZE = 'L';

/** The front-stack box's root container, scoped by its specific class combination —
 *  needed because an unscoped `hasText: 'Aisle'` button lookup also matches the
 *  "Unstage Aisle" button (both contain the substring "Aisle"). */
function frontStackBox(page: Page) {
  return page.locator('div.w-\\[300px\\].shrink-0.flex.flex-col.gap-2');
}

/** Scopes a labeled field box in the front-stack panel (Aisle/Storage/Qty) — issue #77
 *  collapsed STG down to one stageable "front stack" box (label + value share the same
 *  `<button>`, per PalletBox — see STGPage.tsx), so there's only ever one of each label,
 *  unlike the pre-#77 three-independent-stacks UI this superseded. Master Control's own
 *  Aisle/Storage Code fields render their label in a sibling `<span>` outside the button
 *  (see FieldDisplay/StorageCodeField), so this never ambiguously matches those instead. */
function frontField(page: Page, label: string) {
  return frontStackBox(page).locator('button', { hasText: label }).first();
}

/** Front-stack Aisle/Storage/Qty have no fixed length (unlike Master Control's Aisle/
 *  Storage, which auto-commit at a fixed length — see useNumpadField's maxLength), so
 *  committing them needs an explicit OK tap. On-screen taps are used rather than
 *  `hardwareScan` here: `deliverScan`'s synthetic-Enter handoff (NumpadContext's
 *  setKeyHandler) has a pre-existing quirk where the panel can stay open after a scan-
 *  committed field with nothing refocused afterward — reproducible even against
 *  unrelated, unmodified screens (e.g. PII's Pallet ID field), so it's out of scope for
 *  this issue batch to fix; on-screen taps sidestep it and are just as representative of
 *  real kiosk usage. */
async function tapAndCommit(page: Page, keys: string) {
  await tapKeys(page, keys);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

/** Fills the front stack with the live Aisle/Storage/Size and a given quantity. */
async function fillFrontStack(page: Page, quantity = '5') {
  await frontField(page, 'Aisle').click();
  await tapAndCommit(page, LIVE_AISLE);
  await frontField(page, 'Storage').click();
  await tapAndCommit(page, LIVE_STORAGE);
  await page.getByLabel('Front Stack Size').selectOption(LIVE_SIZE);
  await frontField(page, 'Qty').click();
  await tapAndCommit(page, quantity);
}

/** The "Pallets Go To" destination-location list/box next to the front-stack fields —
 *  scoped to its specific class combination (not a bare `div`), since a generic `hasText`
 *  match would otherwise also match every broader ancestor div up the tree. */
function locationsBox(page: Page) {
  return page.locator('div.flex-1.min-w-0.flex.flex-col.gap-1', { hasText: 'Pallets Go To' });
}

/**
 * Covers STG's front-stack fill/stage flow (issue #77's single-stageable-position
 * redesign), master control "Fill All", the location suggestion reject/hold flow, the
 * manual Refresh button (issue #76), the Unstage-Aisle role gate and per-type panel
 * (issue #58, styled larger/red per issue #74), and the collapsible log panel. See
 * DevNotes/Screen-Specs/STG.md.
 *
 * Not covered:
 * - The Unstage/Restage modal's actual Apply submission — exercised for visibility/row
 *   content only, not committed, to avoid mutating a shared aisle's staged state in a way
 *   other tests then depend on.
 * - Shortfall ("No location available") and the reject flow's "no valid location remains"
 *   error — both would require exhausting an aisle's empty locations, which is flaky
 *   against a shared, mutating dev DB (same reasoning as sdp.spec.ts).
 * - Session persistence across navigation — Playwright's `page.goto` inside a test
 *   remounts the whole app fresh in this suite's setup, so it doesn't exercise the
 *   in-memory StagingContext the way a real client-side route change would.
 */
test.describe('STG — Stage Aisle', () => {
  test.use({ storageState: 'playwright/.auth/im.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/stage');
  });

  test('the front stack has a disabled Stage button until fully filled', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'STAGE', exact: true })).toBeDisabled();
  });

  test('filling Aisle + Storage + Size + Quantity populates destination locations and enables Stage', async ({ page }) => {
    await fillFrontStack(page);
    await expect(page.getByRole('button', { name: 'STAGE', exact: true })).toBeEnabled();
    await expect(locationsBox(page)).toContainText(/\d{3}-\d{3}-\d{2}/);
  });

  test('staging completes and resets the front stack while keeping Aisle/Storage/Size', async ({ page }) => {
    await fillFrontStack(page);
    await expect(page.getByRole('button', { name: 'STAGE', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'STAGE', exact: true }).click();

    // .first() — the same text appears twice once staged: once in the message bar, once
    // in the log panel's collapsed preview (a <button>, not a plain span); either match
    // confirms the stage actually happened.
    await expect(page.getByText(new RegExp(`pallets staged in Aisle ${LIVE_AISLE}`)).first()).toBeVisible();
    // Quantity clears (Stage disables again) but Aisle/Storage persist for a repeat stage.
    await expect(page.getByRole('button', { name: 'STAGE', exact: true })).toBeDisabled();
    await expect(frontField(page, 'Aisle')).toContainText(LIVE_AISLE);
    await expect(frontField(page, 'Storage')).toContainText(LIVE_STORAGE);
  });

  test('master control "Fill All" only fills the front stack when it has no Quantity yet', async ({ page }) => {
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').first().click();
    await tapKeys(page, LIVE_STORAGE); // fixed 2-char length — auto-commits
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Aisle' }).getByRole('button').click();
    await tapKeys(page, LIVE_AISLE); // fixed 3-char length — auto-commits
    await pickCode(page, 'Master Size', LIVE_SIZE);

    const fillAllBtn = page.getByRole('button', { name: 'Fill All' });
    await expect(fillAllBtn).toBeEnabled();
    await fillAllBtn.click();
    await expect(frontField(page, 'Storage')).toContainText(LIVE_STORAGE);
    await expect(frontField(page, 'Aisle')).toContainText(LIVE_AISLE);

    // Once the front stack already has a Quantity, Fill All has nothing left to do.
    await frontField(page, 'Qty').click();
    await tapAndCommit(page, '1');
    await expect(fillAllBtn).toBeDisabled();
  });

  test('the log panel starts collapsed and expands on tap', async ({ page }) => {
    await expect(page.getByText('No staging activity this session — tap to expand')).toBeVisible();
    await page.getByText('No staging activity this session — tap to expand').click();
    await expect(page.getByText('Staging Log')).toBeVisible();
  });

  test('log entries appear after staging and persist in the expanded view', async ({ page }) => {
    await fillFrontStack(page);
    await page.getByRole('button', { name: 'STAGE', exact: true }).click();
    // .first() — the same text appears twice once staged: once in the message bar, once
    // in the log panel's collapsed preview (a <button>, not a plain span); either match
    // confirms the stage actually happened.
    await expect(page.getByText(new RegExp(`pallets staged in Aisle ${LIVE_AISLE}`)).first()).toBeVisible();

    // The log panel's own collapsed-preview bar is a <button> (distinct from the message
    // bar's plain-span rendering of the same text) — target that specifically to expand it.
    await page.getByRole('button', { name: new RegExp(`pallets staged in Aisle ${LIVE_AISLE}`) }).click();
    await expect(page.getByText('Staging Log')).toBeVisible();
    // .first() — the collapsed preview bar stays mounted underneath the expanded overlay
    // (it isn't unmounted, just covered), so this text still matches twice.
    await expect(page.getByText(new RegExp(`pallets staged in Aisle ${LIVE_AISLE} → next location`)).first()).toBeVisible();
  });

  test('the manual Refresh button reports success without changing any field', async ({ page }) => {
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').first().click();
    await tapKeys(page, LIVE_STORAGE); // fixed 2-char length — auto-commits
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.getByText('Refreshed')).toBeVisible();
    await expect(page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').first()).toHaveText(LIVE_STORAGE);
  });

  test('rejecting the suggested location holds it and suggests a new one, without staging anything', async ({ page }) => {
    await fillFrontStack(page);
    const suggestionBtn = locationsBox(page).getByRole('button').first();
    const rejected = await suggestionBtn.textContent();

    await suggestionBtn.click();
    await expect(page.getByText('Reject suggested location?')).toBeVisible();
    // Defaults to the "Blocked" reason code, editable via the dropdown before confirming.
    await expect(page.getByLabel('Reason')).toHaveValue('B05');
    await page.getByRole('button', { name: 'Confirm Hold' }).click();

    await expect(page.getByText(new RegExp(`${rejected} held`))).toBeVisible();
    // Staging never happened — Stage is still enabled with the same Quantity/aisle intact.
    await expect(page.getByRole('button', { name: 'STAGE', exact: true })).toBeEnabled();
    await expect(locationsBox(page).getByRole('button').first()).not.toHaveText(rejected ?? '');
  });

  test('cancelling the reject/hold dialog leaves the original suggestion untouched', async ({ page }) => {
    await fillFrontStack(page);
    const suggestionBtn = locationsBox(page).getByRole('button').first();
    const original = await suggestionBtn.textContent();

    await suggestionBtn.click();
    await expect(page.getByText('Reject suggested location?')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByText('Reject suggested location?')).not.toBeVisible();
    await expect(locationsBox(page).getByRole('button').first()).toHaveText(original ?? '');
  });

  test('IM sees the larger, red Unstage Aisle button and can open its per-type panel', async ({ page }) => {
    // The per-type panel only has rows for freight types actually STAGED in the aisle
    // (GET /api/staging/staged-types) — stage one first so there's a CR-L row to assert on.
    await fillFrontStack(page, '1');
    await page.getByRole('button', { name: 'STAGE', exact: true }).click();
    // .first() — the same text appears twice once staged: once in the message bar, once
    // in the log panel's collapsed preview (a <button>, not a plain span); either match
    // confirms the stage actually happened.
    await expect(page.getByText(new RegExp(`pallets staged in Aisle ${LIVE_AISLE}`)).first()).toBeVisible();

    const unstageBtn = page.getByRole('button', { name: 'Unstage Aisle' });
    await expect(unstageBtn).toBeVisible();
    await unstageBtn.click();

    await expect(page.getByText('Unstage / Restage')).toBeVisible();
    await expect(page.getByText(`${LIVE_STORAGE}-${LIVE_SIZE}`, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Max' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear Restage' }).first()).toBeVisible();

    // Dismiss without submitting — this suite doesn't commit a restage.
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByText('Unstage / Restage')).not.toBeVisible();
  });
});

test.describe('STG — Worker role gating', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  test('Worker does not see the Unstage Aisle button', async ({ page }) => {
    await page.goto('/stage');
    await expect(page.getByRole('button', { name: 'Unstage Aisle' })).not.toBeVisible();
  });
});
