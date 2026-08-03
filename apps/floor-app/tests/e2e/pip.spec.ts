import { test, expect } from '@playwright/test';
import { hardwareScan, tapKeys } from './helpers';

test.use({ storageState: 'playwright/.auth/worker.json' });

/**
 * Covers every decision diamond in Documentation/Flowcharts-ERDs/pip-flow.mmd, plus the
 * GitHub #185/#186/#187/#188/#183 batch (2026-08-01): CID's 3-state valid/neutral/invalid
 * status gating Pallet ID/UPC/Location, the bottom section always rendering (blank
 * placeholders instead of being gated behind a scan), Pallet ID/UPC/Location washing red
 * and keeping their entered value on an invalid attempt instead of clearing, the Hold
 * button's current/previous location picker, and LocationEntryFields' locked-field
 * mismatch messaging.
 *
 * Not covered — node PID_OK / UPC_OK / LOC_BIN -> WRONG_PULL_FUNCTION: by the time a container reaches
 * the `verifying` state, node FN_CHECK has already gated it to the selected pull function,
 * so /api/pulls/verify's WRONG_PULL_FUNCTION response is a defensive server-side check with
 * no reachable path through the UI to trigger it.
 */
test.describe('PIP — Pallet ID Pull flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pull');
  });

  /** Picks a Pull Function from PIP's persistent dropdown. No-ops if `desc` is already the
   *  current selection (the trigger button's own text always contains it, so a plain
   *  substring click on the trigger would otherwise just toggle the list open and leave its
   *  full-screen backdrop covering the page — the trigger and every option share the same
   *  "CODE — Desc" text, so option clicks are scoped to the open popup's own container to
   *  disambiguate from the closed trigger). */
  async function selectFunction(page: import('@playwright/test').Page, desc: string) {
    const trigger = page.locator('div.relative.inline-flex').getByRole('button').first();
    if ((await trigger.innerText()).includes(desc)) return;
    await trigger.click();
    await page.locator('div.absolute.z-50').getByRole('button', { name: desc }).click();
  }

  /** Scopes the Pallet ID/UPC/Location field-wrapper buttons by their label — same
   *  pattern used throughout this suite for every other screen's numpad-driven field. */
  function pidBox(page: import('@playwright/test').Page) {
    return page.locator('div.flex.flex-col.gap-1', { hasText: 'Pallet ID' }).getByRole('button');
  }
  function upcBox(page: import('@playwright/test').Page) {
    return page.locator('div.flex.flex-col.gap-1', { hasText: 'UPC' }).getByRole('button');
  }
  function labelBox(page: import('@playwright/test').Page) {
    return page.locator('div.flex.flex-col.gap-1', { hasText: 'Scan Label' }).getByRole('button');
  }

  // Node L_FOUND {Found?} -> NOT_FOUND
  test('scanning an unknown label shows an error and stays in ready', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    await page.getByRole('button', { name: '✗ Invalid Label' }).click();

    await expect(page.getByText('Label not found')).toBeVisible();
    // Issue #187 — Pallet ID is always rendered now (not gated behind a scan), but issue
    // #188 gates it disabled until the Label field is 'valid'.
    await expect(page.getByText('Pallet ID', { exact: true })).toBeVisible();
    await expect(pidBox(page)).toBeDisabled();
  });

  // Node FN_CHECK {pullFunction match?} -> Mismatch
  // Mocked at the API layer — the seed data gives every container `pullFunction: 'CA'`
  // (see api/prisma/seed.ts), so there's no real CF-function label to scan for this case.
  test('scanning a label for a different pull function shows a mismatch error', async ({ page }) => {
    await page.route('**/api/containers/TESTCF1', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        container: { id: 'TESTCF1', pullFunction: 'CF', quantity: { pallets: 1, cartons: 0, ssps: 0 }, dpci: '085-02-0006', descShort: 'Test Item' },
        pallet: { id: 1, quantity: { pallets: 1, cartons: 0, ssps: 0 } },
        location: { id: null },
      }),
    }));
    await selectFunction(page, 'Carton Air'); // selects CA
    // PIPPage auto-focuses the label field 50ms after mount — wait for its footer demo
    // buttons (proof the field is actually the active numpad target) before scanning,
    // otherwise a keystroke sent this fast lands with no field registered to receive it.
    await expect(page.getByRole('button', { name: '✓ Valid Label' })).toBeVisible();

    await hardwareScan(page, 'TESTCF1');

    await expect(page.getByText('Wrong function — label requires CF')).toBeVisible();
  });

  // Node L_FOUND {Found?} -> OK, entering State 3 (verifying)
  test('a valid label scan populates State 2 and enables Pallet ID/UPC/Location (issue #188)', async ({ page }) => {
    await selectFunction(page, 'Carton Air');

    // Issue #187 — every field below is already visible even before a label is scanned,
    // and issue #188 gates Pallet ID/UPC/Location disabled until then.
    await expect(page.getByText('Location', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Item', { exact: true })).toBeVisible();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();
    await expect(page.getByText('Current', { exact: true })).toBeVisible();
    await expect(page.getByText('Pull', { exact: true })).toBeVisible();
    await expect(page.getByText('Remaining', { exact: true })).toBeVisible();
    await expect(pidBox(page)).toBeDisabled();
    await expect(upcBox(page)).toBeDisabled();

    await page.getByRole('button', { name: '✓ Valid Label' }).click();

    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();
    // Issue #188 — Label field itself shows the blue "valid" wash; Pallet ID/UPC/Location
    // are no longer disabled now that there's something to verify against.
    await expect(pidBox(page)).toBeEnabled();
    await expect(upcBox(page)).toBeEnabled();
  });

  // Node RESCAN {New label scanned while verifying?} -> Yes
  // Issue #45: this used to show a "Label not verified" warning that could stomp on a
  // still-relevant previous message — removed entirely (no status-bar update on a plain
  // rescan, only on an actual error) rather than fixed to fire at the "right" time.
  test('rescanning while verifying reloads with the new label and shows no warning', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/demo/container') && r.ok()),
      page.getByRole('button', { name: '✓ Valid Label' }).click(),
    ]);
    const { containerId } = (await resp.json()) as { containerId: string };
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();
    // Wait out PIPPage's own 50ms auto-focus-PID timer (fired on entering 'verifying')
    // before refocusing the label field below — refocusing inside that window loses the
    // focus race to the pending timer, which steals it back to Pallet ID a moment later.
    // A real worker's own reaction time never lands inside a 50ms window; this only
    // matters for a script clicking as fast as this one does. Waiting for Pallet ID's own
    // demo buttons (not just pidBox's disabled state, which flips the instant cidStatus
    // goes valid — well before the separate delayed-focus effect actually runs) is what
    // proves the timer has already fired.
    await expect(page.getByRole('button', { name: '✓ Scan PID' })).toBeVisible();

    // Refocus the label field (its button's accessible name is its current value) and rescan.
    await page.getByRole('button', { name: containerId, exact: true }).click();
    await page.getByRole('button', { name: '✓ Valid Label' }).click();

    await expect(page.getByText('Label not verified')).not.toBeVisible();
    // Still showing verifying-state data (reloaded, not kicked back to ready).
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();
  });

  // Node PID_OK {Result?} -> PALLET_MISMATCH
  test('an incorrect Pallet ID washes red, keeps the entered value, and stays in verifying (issue #185)', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    await page.getByRole('button', { name: '✓ Valid Label' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: '✗ Scan PID' }).click();

    await expect(page.getByText('Incorrect Pallet ID')).toBeVisible();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible(); // still in verifying
    // Issue #185 — the bad value stays on screen (previously cleared to "—").
    await expect(pidBox(page)).toContainText('INVALID-PID-000');
  });

  // Node PID_OK {Result?} -> OK -> SUCCESS, including the "message persists" behavior
  test('verifying by Pallet ID completes the pull and the message persists through the next scan (issue #188)', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    await page.getByRole('button', { name: '✓ Valid Label' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: '✓ Scan PID' }).click();

    await expect(page.getByText(/^Last Pull .* — /)).toBeVisible();
    // Issue #188 — CID resets to 'neutral' (not the message bar) after a successful pull;
    // Pallet ID/UPC/Location disable again until the next label is scanned.
    await expect(pidBox(page)).toBeDisabled();
    // 2026-08-01 — the box's own value clears too, not just its disabled state. A reentrant
    // Blur (fired when onPullSuccess moves focus to the Label field) used to re-run this
    // same submit handler a second time and silently restore the just-verified value.
    await expect(pidBox(page)).toHaveText('—');

    // Scanning the next label is a neutral → valid transition, which must NOT clear the
    // "Last Pull" confirmation — that's the exact bug #188 fixes.
    await page.getByRole('button', { name: '✓ Valid Label' }).click();
    await expect(page.getByText(/^Last Pull .* — /)).toBeVisible();
    await expect(pidBox(page)).toBeEnabled();
  });

  // Node UPC_OK {Result?} -> ALTERNATE_MISMATCH, via the UPC field (issue #82 split)
  test('an invalid UPC washes red, keeps the entered value, and stays in verifying (issue #185)', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    await page.getByRole('button', { name: '✓ Valid Label' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();

    // The UPC demo buttons only render once the UPC field is focused (PID auto-focuses
    // on entering verifying; UPC/Location don't) — tap it first.
    await upcBox(page).click();
    await page.getByRole('button', { name: '✗ UPC' }).click();

    await expect(page.getByText('Invalid UPC')).toBeVisible();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();
    // Issue #185 — the bad value stays on screen (previously cleared to "—").
    await expect(upcBox(page)).toContainText('000000000000');
  });

  // Node UPC_OK {Result?} -> OK -> SUCCESS, via the UPC field
  test('verifying by UPC completes the pull', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    await page.getByRole('button', { name: '✓ Valid Label' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();

    await upcBox(page).click();
    await page.getByRole('button', { name: '✓ UPC' }).click();

    await expect(page.getByText(/^Last Pull .* — /)).toBeVisible();
  });

  // Node LOC_BIN {Result?} -> ALTERNATE_MISMATCH, via the Location field (issue #82 split)
  // Issue #183's follow-up — Aisle is locked to the pallet's real value across every pull
  // function, and the Location demo's "✗" fill (00000000) always disagrees with it, so
  // this now short-circuits client-side as a locked-field mismatch rather than ever
  // reaching the server — see the dedicated locked-mismatch tests below for that path.
  // This test now covers the *editable* Bin box's own generic mismatch instead, which is
  // still the server-side ALTERNATE_MISMATCH path (issue #185's wash-and-keep behavior).
  test('an incorrect Bin (Aisle/Level correct) shows an error, washes, and keeps the entered value', async ({ page }) => {
    await selectFunction(page, 'Full Pallet'); // FP — Aisle locked, Bin+Level editable
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/demo/container') && r.ok()),
      page.getByRole('button', { name: '✓ Valid Label' }).click(),
    ]);
    const { containerId: _unused } = (await resp.json()) as { containerId: string };
    void _unused;
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();
    // Wait out PIPPage's own 50ms auto-focus-PID timer before focusing Bin below — inside
    // that window the timer wins the focus race a moment later and steals typed digits
    // meant for Bin (see the identical wait in the rescan test above).
    await expect(page.getByRole('button', { name: '✓ Scan PID' })).toBeVisible();

    const lockedAisle = await page
      .locator('div.flex.flex-col.gap-1.w-\\[120px\\]', { hasText: 'Aisle' })
      .locator('div')
      .innerText();

    // Scoped by width class (matches the pre-existing Aisle-box locator pattern above) —
    // an unqualified `hasText: 'Bin'` match is ambiguous between Bin's own box and the
    // outer "Location" group wrapper (which also contains "Bin" via Bin's nested label),
    // and unioned with Level's own box once its value happens to overlap Bin's. Aisle and
    // Bin share the same default `w-[120px]` width class, but only Bin's own div's text
    // contains "Bin".
    await page.locator('div.flex.flex-col.gap-1.w-\\[120px\\]', { hasText: 'Bin' }).getByRole('button').click();
    // tapKeys, not repeated raw button clicks — once Bin shows "9" mid-entry, its own box
    // is itself a button whose accessible name is also "9", making an unscoped page-wide
    // lookup ambiguous (see tapKeys's own doc comment).
    await tapKeys(page, '999');
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    // Bin's own auto-advance moves to Level; complete it with an equally-implausible value
    // so the combination reaches the server as a whole-value mismatch, not a locked one.
    await tapKeys(page, '99');
    await page.getByRole('button', { name: 'Enter', exact: true }).click();

    await expect(page.getByText('Invalid Location')).toBeVisible();
    // Issue #185 — Bin's own entered value stays visible (washed, not cleared).
    await expect(page.locator('div.flex.flex-col.gap-1.w-\\[120px\\]', { hasText: 'Bin' }).getByRole('button')).toContainText('999');
    // Aisle is unchanged — still showing its own locked (correct) value throughout.
    await expect(
      page.locator('div.flex.flex-col.gap-1.w-\\[120px\\]', { hasText: 'Aisle' }).locator('div'),
    ).toContainText(lockedAisle);
  });

  // Issue #183's follow-up — a scanned Location whose Aisle segment disagrees with the
  // pallet's own locked (known-correct) Aisle is caught client-side, never reaching the
  // server, with a message calling out exactly which field and value was wrong.
  test('a scanned Location with the wrong Aisle names the field and value in the error (issue #183)', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    await page.getByRole('button', { name: '✓ Valid Label' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '✓ Scan PID' })).toBeVisible();

    const aisleBox = page.locator('div.flex.flex-col.gap-1.w-\\[120px\\]', { hasText: 'Aisle' }).locator('div');
    const lockedAisle = await aisleBox.innerText();

    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Location' }).getByRole('button').first().click();
    // The "✗ Location" demo delivers 00000000 — always a wrong Aisle, since Aisle locks to
    // the pallet's real (non-zero) value regardless of pull function.
    await page.getByRole('button', { name: '✗ Location' }).click();

    await expect(page.getByText('Scanned Location incorrect Aisle (000)')).toBeVisible();
    // 2026-08-01 follow-up — the locked Aisle box keeps showing its own known-correct value
    // throughout; only the message bar surfaces the mismatch (an earlier version of this fix
    // swapped the box's own display to the scanned wrong value, found confusing on a
    // greyed-out/disabled-looking box and reverted, direct instruction).
    await expect(aisleBox).toContainText(lockedAisle);
    // Bin isn't locked on CA, so it still reflects exactly what was scanned.
    const binBox = page.locator('div.flex.flex-col.gap-1.w-\\[120px\\]', { hasText: 'Bin' }).getByRole('button');
    await expect(binBox).toContainText('000');
  });

  // Node LOC_BIN {Result?} -> OK -> SUCCESS, via the Location field
  test('verifying by Location completes the pull', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    await page.getByRole('button', { name: '✓ Valid Label' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();

    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Location' }).getByRole('button').first().click();
    await page.getByRole('button', { name: '✓ Location' }).click();

    await expect(page.getByText(/^Last Pull .* — /)).toBeVisible();
  });

  // Node L_FOUND {Found?} -> BAD STATUS (a container already Pulled)
  test('re-scanning an already-pulled label shows an invalid status error', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/demo/container') && r.ok()),
      page.getByRole('button', { name: '✓ Valid Label' }).click(),
    ]);
    const { containerId } = (await resp.json()) as { containerId: string };

    await page.getByRole('button', { name: '✓ Scan PID' }).click();
    await expect(page.getByText(/^Last Pull .* — /)).toBeVisible();

    // Re-scan the same container ID — it's now PULLED, not PRINTED.
    await hardwareScan(page, containerId);

    await expect(page.getByText('Invalid status: PULLED')).toBeVisible();
    // Issue #188 — an invalid rescan disables Pallet ID/UPC/Location again, even though
    // the previous (now-stale) container's data is still on screen.
    await expect(pidBox(page)).toBeDisabled();
  });

  // Issue #186 — the Hold button offers a choice between the currently-scanned location
  // and the previous pull's, since a worker often only realizes a location needs holding
  // after they've already scanned the next label.
  test('Hold offers a choice between current and previous location once both exist', async ({ page }) => {
    await selectFunction(page, 'Carton Air');
    await page.getByRole('button', { name: '✓ Valid Label' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();

    // Before any pull, only a "current" location exists — Hold goes straight to the panel.
    await page.getByRole('button', { name: 'Hold', exact: true }).click();
    await expect(page.getByText('Place Hold').or(page.getByText('Hold', { exact: true }))).toBeVisible();
    await page.keyboard.press('Escape').catch(() => {});
    await page.getByRole('button', { name: 'Close' }).click().catch(() => {});

    await page.getByRole('button', { name: '✓ Scan PID' }).click();
    await expect(page.getByText(/^Last Pull .* — /)).toBeVisible();
    await page.getByRole('button', { name: '✓ Valid Label' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();

    // Now both a current and a previous location exist — Hold shows the picker instead.
    await page.getByRole('button', { name: 'Hold', exact: true }).click();
    await expect(page.getByText('Current Location')).toBeVisible();
    await expect(page.getByText('Previous Location')).toBeVisible();
  });

  // Issues #48/#49/#72: FP Location-field level mismatch prompts a popup to type the level
  // the pallet was actually pulled from (not just confirm/reject the scanned-but-wrong one).
  // Mocked at the API layer — crafting real seed data where a pallet's actual level is
  // known to differ from a scannable one would be too flaky to rely on.
  test('an FP level mismatch on Location prompts a correction popup; entering the actual level completes the pull', async ({ page }) => {
    // The seed data has no FP-function containers at all (see api/prisma/seed.ts's demo-
    // container comment — every seeded container defaults to CA), so /api/demo/container?fn=FP
    // always 404s. Mock the container lookup too, not just verify, so this test doesn't
    // depend on seed data that structurally can't support it.
    await page.route('**/api/demo/container*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ containerId: 'TESTCONTAINER1' }),
    }));
    await page.route('**/api/containers/TESTCONTAINER1', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        container: { id: 'TESTCONTAINER1', pullFunction: 'FP', quantity: { pallets: 1, cartons: 0, ssps: 0 }, dpci: '085-02-0006', descShort: 'Test Item' },
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
    await page.getByRole('button', { name: '✓ Valid Label' }).click();
    await expect(page.getByText('DPCI', { exact: true })).toBeVisible();
    // Wait for the container fetch to actually resolve (issue #187 renders the DPCI label
    // unconditionally, so its visibility alone doesn't prove data has loaded) — Aisle
    // isn't locked, and so still renders as a plain (ambiguous, third) button, until then.
    await expect(pidBox(page)).toBeEnabled();

    // Focus the Location field, then deliver the scan directly via the hardware-scan path
    // rather than the "✓ Location" footer demo button — a more direct simulation of a real
    // barcode scan than a demo button click. Aisle+Bin (301/056) agree with the mocked
    // container's own locked Aisle (301), so this reaches the server as intended — only
    // the Level (01 vs the mocked actual 04) mismatches, which the server (not the locked-
    // field client-side check) is what surfaces here. Aisle is locked at this point, so the
    // first editable button in the group is Bin's.
    await page.locator('div.flex.flex-col.gap-1', { hasText: 'Location' }).getByRole('button').first().click();
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
