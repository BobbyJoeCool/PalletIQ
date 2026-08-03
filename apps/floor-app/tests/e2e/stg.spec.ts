import { test, expect, type Page } from '@playwright/test';
import { pickCode, tapKeys } from './helpers';

// GitHub #156 — corrected from 305 (CR digit 5 is Half Small only, never Large — see
// seed.ts's `patternSize`) and its predecessor 304 (Small only). CR's block is 300-309
// (`standardAisles`), one aisle per pattern digit; digit 3 is Medium on level 1, Large on
// levels 2+ — aisle 303 is that digit. The *real* fully-staged Large aisle is 302
// (`STAGED_AISLES` in seed.ts, 100% staged — the actual aisle the old "is fully staged"
// comment here meant, mislabeled as 304); 303 isn't in `STAGED_AISLES` at all (0% staged,
// full room). Re-seed (`cd api && npx prisma db seed`) if this test starts failing with
// unplaced pallets.
const LIVE_AISLE = '303';
const LIVE_STORAGE = 'CR';
const LIVE_SIZE = 'L';

/** Scopes one of the three stack boxes riding the forks (issue #81) by its visible label —
 *  "Staging" (front/rightmost, the only slot that ever computes locations or stages),
 *  "Next", or "On Deck" (see STGPage.tsx's STACK_LABELS). Needed because all three render
 *  identical Aisle/Storage/Size/Qty fields, and an unscoped `hasText: 'Aisle'` lookup would
 *  also match the "Unstage Aisle" button. */
function stackBox(page: Page, label: 'Staging' | 'Next' | 'On Deck') {
  return page.locator('div.flex-1.min-w-0.flex.flex-col.items-stretch.gap-1.h-full', { hasText: label });
}

/** Scopes a labeled field button (Aisle/Storage/Qty) within a given stack box — label and
 *  value share the same `<button>`, per PalletBox. */
function stackField(page: Page, boxLabel: 'Staging' | 'Next' | 'On Deck', fieldLabel: string) {
  return stackBox(page, boxLabel).locator('button', { hasText: fieldLabel }).first();
}

/** Qty has no fixed length, so committing it needs an explicit OK tap. Aisle (issue #161,
 *  `useAisleField`'s `maxLength=3`), Storage, and Size (both `PalletCodePicker` instances
 *  with `maxLength=2`/a single-letter `earlyCommit`) all auto-submit — and close the input
 *  panel, taking its OK button with it — the instant a full-length value is typed, so
 *  there's never an OK left to tap for them by the time this function's own explicit tap
 *  would run (GitHub #156 — this function previously assumed every field needed one,
 *  stale since Aisle moved onto the shared hook and Storage/Size gained fixed lengths).
 *  Tolerates both: taps OK only if it's still there. On-screen taps are used rather than
 *  `hardwareScan` here: `deliverScan`'s synthetic-Enter handoff (NumpadContext's
 *  setKeyHandler) has a pre-existing quirk where the panel can stay open after a scan-
 *  committed field with nothing refocused afterward — reproducible even against
 *  unrelated, unmodified screens (e.g. PII's Pallet ID field), so it's out of scope for
 *  this issue batch to fix; on-screen taps sidestep it and are just as representative of
 *  real kiosk usage. */
async function tapAndCommit(page: Page, keys: string) {
  await tapKeys(page, keys);
  const ok = page.getByRole('button', { name: 'Enter', exact: true });
  try {
    await ok.waitFor({ state: 'visible', timeout: 500 });
    await ok.click();
  } catch {
    // Already auto-submitted (maxLength/earlyCommit reached) — no OK button left to tap.
  }
}

/** Fills one stack box with the live Aisle/Storage/Size and a given quantity. Each of
 *  Aisle/Storage/Size starts as an `InheritedDisplay` (not yet overridden) — tapping it
 *  arms the override and auto-focuses the real field in one action (GitHub #156), so a
 *  single click + type-and-commit per field is enough; no separate OVERRIDE-toggle tap or
 *  native `<select>` (Size stopped being one — STG fix, tap-to-type-or-pick like Storage). */
async function fillStack(page: Page, boxLabel: 'Staging' | 'Next' | 'On Deck', quantity = '5') {
  await stackField(page, boxLabel, 'Aisle').click();
  await tapAndCommit(page, LIVE_AISLE);
  await stackField(page, boxLabel, 'Storage').click();
  await tapAndCommit(page, LIVE_STORAGE);
  await stackField(page, boxLabel, 'Size').click();
  await tapAndCommit(page, LIVE_SIZE);
  await stackField(page, boxLabel, 'Qty').click();
  await tapAndCommit(page, quantity);
}

/** The Locations panel showing the front ("Staging") stack's computed destination-location
 *  bubbles — scoped to its specific class combination (not a bare `div`), since a generic
 *  `hasText` match would otherwise also match every broader ancestor div up the tree. Width
 *  is 378px (GitHub #156 — stale at 340px here, whichever earlier version of the panel that
 *  matched). */
function locationsPanel(page: Page) {
  return page.locator('div.w-\\[378px\\].shrink-0', { hasText: 'Locations' });
}

/** Just the bubble list within the Locations panel — excludes the panel's own STAGE
 *  button, which also happens to be a `<button>`. Scoping to this instead of the whole
 *  panel avoids a race where `getByRole('button').first()` can resolve to STAGE (the only
 *  button present before the async location fetch resolves) rather than the first bubble. */
function locationBubbles(page: Page) {
  return page.getByTestId('location-bubbles');
}

/**
 * Covers STG's three-stack-queue fill/stage flow (issue #81 — three independent stack
 * boxes ride the forks; only the front "Staging" slot ever computes locations or stages,
 * and staging it compacts the queue so a filled "Next"/"On Deck" slot slides up), master
 * control's live inheritance into all three slots (issue #99 — replaced the earlier "Fill
 * All" button), the location suggestion
 * reject/hold flow, the manual Refresh button (issue #76), the Unstage-Aisle role gate and
 * per-type panel (issue #58, styled larger/red per issue #74), and the collapsible log
 * panel. See DevNotes/Screen-Specs/STG.md.
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
    await fillStack(page, 'Staging');
    await expect(page.getByRole('button', { name: 'STAGE', exact: true })).toBeEnabled();
    await expect(locationsPanel(page)).toContainText(/\d{3}-\d{3}-\d{2}/);
  });

  test('staging completes and resets the front stack while keeping Aisle/Storage/Size', async ({ page }) => {
    await fillStack(page, 'Staging');
    await expect(page.getByRole('button', { name: 'STAGE', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'STAGE', exact: true }).click();

    // .first() — the same text appears twice once staged: once in the message bar, once
    // in the log panel's collapsed preview (a <button>, not a plain span); either match
    // confirms the stage actually happened.
    await expect(page.getByText(new RegExp(`pallets staged in Aisle ${LIVE_AISLE}`)).first()).toBeVisible();
    // Quantity clears (Stage disables again) but Aisle/Storage persist for a repeat stage,
    // since nothing was queued behind it to slide into the front slot instead.
    await expect(page.getByRole('button', { name: 'STAGE', exact: true })).toBeDisabled();
    await expect(stackField(page, 'Staging', 'Aisle')).toContainText(LIVE_AISLE);
    await expect(stackField(page, 'Staging', 'Storage')).toContainText(LIVE_STORAGE);
  });

  test('staging the front slot shifts a queued "Next" stack into its place', async ({ page }) => {
    await fillStack(page, 'Staging', '1');
    await fillStack(page, 'Next', '2');
    await page.getByRole('button', { name: 'STAGE', exact: true }).click();
    await expect(page.getByText(new RegExp(`pallets staged in Aisle ${LIVE_AISLE}`)).first()).toBeVisible();

    // "Next"'s data (Qty 2) slid up into "Staging"; "Next" is now the empty slot.
    await expect(stackField(page, 'Staging', 'Qty')).toContainText('2');
    await expect(stackField(page, 'Staging', 'Aisle')).toContainText(LIVE_AISLE);
    await expect(stackField(page, 'Next', 'Qty')).toContainText('—');
    await expect(page.getByRole('button', { name: 'STAGE', exact: true })).toBeEnabled();
  });

  test('staging the front slot skips an empty "Next" and pulls "On Deck" all the way up', async ({ page }) => {
    await fillStack(page, 'Staging', '1');
    await fillStack(page, 'On Deck', '3'); // "Next" (the slot in between) stays empty
    await page.getByRole('button', { name: 'STAGE', exact: true }).click();
    await expect(page.getByText(new RegExp(`pallets staged in Aisle ${LIVE_AISLE}`)).first()).toBeVisible();

    // "On Deck"'s data (Qty 3) jumps past the empty "Next" slot straight into "Staging".
    await expect(stackField(page, 'Staging', 'Qty')).toContainText('3');
    await expect(stackField(page, 'Staging', 'Aisle')).toContainText(LIVE_AISLE);
    await expect(stackField(page, 'Next', 'Qty')).toContainText('—');
    await expect(stackField(page, 'On Deck', 'Qty')).toContainText('—');
  });

  test('master control Aisle/Storage/Size live-inherit into every stack slot with no separate fill step', async ({ page }) => {
    // GitHub #156 — "Fill All" was removed in issue #99: every stack now live-inherits
    // Master Control's current Aisle/Storage/Size unless it has its own override armed (see
    // StackBox/`effectiveStack`), so there's no button click needed to push values into the
    // three slots — this test previously exercised the now-removed button (`getByRole` for
    // "Fill All" found nothing), rewritten to verify the inheritance itself instead.
    // Aisle first, deliberately: Master Control's Storage Code uses `strictToAisle`, which
    // validates against the codes narrowed to the *current* Aisle — with no Aisle yet,
    // that narrowed list is empty (not "loading"), so any Storage Code typed first is
    // rejected outright regardless of validity. Filed as a possible real UX gap (Storage
    // Code sits left of Aisle in Master Control's own layout, so a worker filling boxes
    // left-to-right would hit this every time) — sidestepped here rather than silently
    // fixed, since it's outside #191/#192/#156's scope.
    // Scoped by Master Control's specific width class (w-[120px], see FieldDisplay usage in
    // STGPage.tsx) — an unscoped `hasText: 'Aisle'` lookup now also matches all three stack
    // boxes' own "Aisle" fields (issue #81's StackBox wrapper happens to share the generic
    // "flex flex-col gap-1" classes with FieldDisplay's wrapper).
    await page.locator('div.flex.flex-col.gap-1.w-\\[120px\\]', { hasText: 'Aisle' }).getByRole('button').click();
    await tapKeys(page, LIVE_AISLE); // fixed 3-char length — auto-commits
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Storage Code' }).getByRole('button').first().click();
    await tapKeys(page, LIVE_STORAGE); // fixed 2-char length — auto-commits
    await pickCode(page, 'Master Size', LIVE_SIZE);

    for (const label of ['Staging', 'Next', 'On Deck'] as const) {
      await expect(stackField(page, label, 'Storage')).toContainText(LIVE_STORAGE);
      await expect(stackField(page, label, 'Aisle')).toContainText(LIVE_AISLE);
      await expect(stackField(page, label, 'Size')).toContainText(LIVE_SIZE);
    }

    // Arming one stack's own override stops that one slot (only) from tracking Master
    // Control any further — the other two keep inheriting live.
    await stackField(page, 'Next', 'Aisle').click();
    const otherAisle = String(Number(LIVE_AISLE) + 1);
    await tapAndCommit(page, otherAisle);
    await expect(stackField(page, 'Next', 'Aisle')).toContainText(otherAisle);
    await expect(stackField(page, 'Staging', 'Aisle')).toContainText(LIVE_AISLE);
    await expect(stackField(page, 'On Deck', 'Aisle')).toContainText(LIVE_AISLE);
  });

  test('the log panel starts collapsed and expands on tap', async ({ page }) => {
    await expect(page.getByText('No staging activity this session — tap to expand')).toBeVisible();
    await page.getByText('No staging activity this session — tap to expand').click();
    await expect(page.getByText('Staging Log')).toBeVisible();
  });

  test('log entries appear after staging and persist in the expanded view', async ({ page }) => {
    await fillStack(page, 'Staging');
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
    await fillStack(page, 'Staging');
    const suggestionBtn = locationBubbles(page).getByRole('button').first();
    const rejected = await suggestionBtn.textContent();

    await suggestionBtn.click();
    await expect(page.getByText('Reject suggested location?')).toBeVisible();
    // Defaults to the "Blocked" reason code, editable via the dropdown before confirming.
    // `exact: true` (GitHub #156) — unqualified `getByLabel('Reason')` also matches the
    // field's own "Reason options" popup-toggle button (a substring match on aria-label by
    // default). `toHaveText`, not `toHaveValue` (stale here) — this is a CodePickerField-
    // family button, not a native input/select, so it has no `.value` to assert on.
    await expect(page.getByLabel('Reason', { exact: true })).toHaveText('B05');
    await page.getByRole('button', { name: 'Confirm Hold' }).click();

    await expect(page.getByText(new RegExp(`${rejected} held`))).toBeVisible();
    // Staging never happened — Stage is still enabled with the same Quantity/aisle intact.
    await expect(page.getByRole('button', { name: 'STAGE', exact: true })).toBeEnabled();
    await expect(locationBubbles(page).getByRole('button').first()).not.toHaveText(rejected ?? '');
  });

  test('cancelling the reject/hold dialog leaves the original suggestion untouched', async ({ page }) => {
    await fillStack(page, 'Staging');
    const suggestionBtn = locationBubbles(page).getByRole('button').first();
    const original = await suggestionBtn.textContent();

    await suggestionBtn.click();
    await expect(page.getByText('Reject suggested location?')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByText('Reject suggested location?')).not.toBeVisible();
    await expect(locationBubbles(page).getByRole('button').first()).toHaveText(original ?? '');
  });

  test('IM sees the larger, red Unstage Aisle button and can open its per-type panel', async ({ page }) => {
    // The per-type panel only has rows for freight types actually STAGED in the aisle
    // (GET /api/staging/staged-types) — stage one first so there's a CR-L row to assert on.
    await fillStack(page, 'Staging', '1');
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
