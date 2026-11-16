import { test, expect, type Page } from '@playwright/test';
import { pickCode, tapKeys, messageBarTone } from './helpers';
import { fmtLocation } from '../../src/lib/fmt';

// Aisle 304 is a standard aisle seeded with plenty of EMPTY locations (see api/prisma/seed.ts,
// AISLE_PATTERN). If the dev DB has been heavily exercised without a re-seed, this aisle can
// fill up — re-seed (`cd api && npx prisma db seed`) if these tests start failing with NO_LOCATIONS.
const LIVE_AISLE = '304';
// Aisle 200 has confirmed XS (Hand Put) stock, unlike 304 — used only by the Hand-body tests
// below, which force an XS search via SDP's own Size override rather than relying on a
// random pallet's native type (see directPalletHand's own comment).
const LIVE_AISLE_XS = '200';

interface DirectedResult {
  reservationId: number;
  directedLocation: string;
  directedLocationSize: string;
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
 * taps Find, and returns the API result. Always lands on a Rack (non-XS) location, since
 * "Conveyable Reserve"/"Small" is never Hand Put — see `directPalletHand` for that case.
 */
async function directPallet(page: Page, aisle: string, mode: 'put' | 'move'): Promise<DirectedResult> {
  await tapKeys(page, aisle);
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  // A random demo pick can occasionally be undirectable (e.g. its own storage code/size
  // has no open location left in this aisle on a late-day reseed, or a pull is pending) —
  // retry with a fresh pick rather than waiting out a success that will never come (#197).
  const codes: string[] = [];
  for (let attempt = 1; ; attempt++) {
    await page.getByRole('button', { name: 'Pallet ID by Status' }).click();
    if (mode === 'move') await pickDemoFilter(page, 'Status', 'Stored');
    await pickDemoFilter(page, 'Storage Code', 'Conveyable Reserve');
    await pickDemoFilter(page, 'Size', 'Small');
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/puts/directed')),
      page.getByRole('button', { name: 'Find', exact: true }).click(),
    ]);
    if (resp.ok()) return resp.json();
    codes.push(((await resp.json().catch(() => ({}))) as { error?: string }).error ?? String(resp.status()));
    if (attempt >= 4) throw new Error(`directPallet: no directable ${mode} pallet after ${attempt} picks (${codes.join(', ')})`);
  }
}

/**
 * Directs a pallet onto an XS (Hand Put) location — forces the search via SDP's own IM+
 * Size override (`pickCode`, issue #80's `CodePickerField`-based field, not the demo
 * popup's own Storage/Size filters, which only constrain the *starting pallet's* native
 * type) rather than relying on a random pallet's own type happening to be XS.
 *
 * A Storage Code filter is still needed on the *starting pallet*, though: `findNextLocation`
 * matches on `effective.storageCode` too (falling back to the pallet's own inherited value
 * with no override set here), and Aisle 200's own EMPTY/XS locations are all storage code
 * `BS` ("Security") — confirmed via the local DB (`SELECT storageCode, COUNT(*) FROM
 * Location WHERE size='XS' AND status='EMPTY' AND aisle=200 GROUP BY storageCode`). An
 * unfiltered "Any" pick lands on a random pallet whose own storage code rarely matches,
 * producing a spurious `NO_LOCATIONS` 409 that looks like an aisle-out-of-stock problem but
 * isn't.
 */
async function directPalletHand(page: Page, aisle: string): Promise<DirectedResult> {
  await tapKeys(page, aisle);
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  await pickCode(page, 'Size', 'XS');
  await page.getByRole('button', { name: 'Pallet ID by Status' }).click();
  await pickDemoFilter(page, 'Storage Code', 'Security');
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/puts/directed') && r.ok()),
    page.getByRole('button', { name: 'Find', exact: true }).click(),
  ]);
  return resp.json();
}

/** Scopes to the Verify-Put Modal (GitHub #151) — every one of its own fields/buttons
 *  (Confirm Location, Unassign, Hold Location, Carton Quantity, Exists Elsewhere) lives
 *  inside this, disambiguating from the page behind it (e.g. the page's own "Put in"
 *  readout, which also renders a `LiveId` for the same location). */
function modal(page: Page) {
  return page.getByTestId('sdp-verify-put-modal');
}

/**
 * Covers every decision diamond in Documentation/Flowcharts-ERDs/sdp-flow.mmd.
 *
 * Not covered:
 * - DIR_OK -> NO_CARTONS: no demo endpoint returns a pallet with zero stored cartons, and
 *   hardcoding a specific pallet ID would break on re-seed (see Test Data Strategy).
 * - CONF_OK / UN_OK -> NOT_FOUND (reservation expired): real 5-minute server-side timeout,
 *   not worth a real-clock-dependent test.
 */
// Consolidating-mode puts skip STAGED locations, so they need EMPTY, unheld, uncontracted
// CR/S stock in the live aisle — which the demo reseed's shift simulator can use up (every
// EMPTY CR/S location in 304 contracted or held). Before the suite, re-stage 6 fewer than
// are currently staged (STG's restage endpoint clears the type, then stages N), leaving
// 6 fresh EMPTY locations while the regular put tests still land on STAGED ones (#197).
test.beforeAll(async ({ request }) => {
  const login = await request.post('/api/auth/login', { data: { zNumber: 'z002p22', pin: '1234' } });
  const { token } = await login.json() as { token: string };
  const headers = { 'X-Auth-Token': token };
  const types = (await (await request.get(`/api/staging/staged-types?aisle=${LIVE_AISLE}`, { headers })).json()) as { storageCode: string; size: string; staged: number }[];
  const crs = types.find((t) => t.storageCode === 'CR' && t.size === 'S');
  if (!crs || crs.staged <= 6) return;
  await request.post('/api/staging/restage', {
    headers,
    data: { aisle: Number(LIVE_AISLE), types: [{ storageCode: 'CR', size: 'S', quantity: crs.staged - 6 }] },
  });
});

test.describe('SDP — System Directed Put flow', () => {
  test.use({ storageState: 'playwright/.auth/im.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/put/directed');
  });

  // Release any reservation a test leaves open so it doesn't tie up a location for 5
  // minutes. Once a test has redirected via Exists Elsewhere, Unassign is replaced by
  // Cancel (#151 follow-up) — the underlying reservation is already gone by then (no
  // location tied up either way), but this still closes the modal cleanly.
  test.afterEach(async ({ page }) => {
    const unassign = modal(page).getByRole('button', { name: 'Unassign' });
    const cancel = modal(page).getByRole('button', { name: 'Cancel' });
    if (await unassign.isVisible().catch(() => false)) {
      await unassign.click();
    } else if (await cancel.isVisible().catch(() => false)) {
      await cancel.click();
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
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await page.getByRole('button', { name: '✗ Invalid Pallet ID' }).click();

    await expect(page.getByText('Pallet ID not found')).toBeVisible();
  });

  // Node DIR_OK {Result?} -> NO_LOCATIONS, reframed: the Aisle field itself (`useAisleField`,
  // issue #161) now owns an internal existence check and fires as soon as 3 digits are
  // typed — no OK tap needed, and a nonexistent aisle never reaches the Pallet ID step or
  // `directedPut` at all, so the old "type 5 digits, tap OK, search, get NO_LOCATIONS from
  // the API" flow this test used to cover no longer exists. '999' (3 digits, confirmed
  // absent from the local DB) exercises the same "worker enters an aisle that isn't real"
  // case at the point it's actually caught today.
  test('a nonexistent aisle shows an error and re-focuses for retry', async ({ page }) => {
    await tapKeys(page, '999');

    await expect(page.getByText('Aisle 999 does not exist')).toBeVisible();
    // Cleared and re-focused, not left showing the rejected value.
    await expect(page.getByRole('button', { name: 'Pallet ID by Status' })).not.toBeVisible();
  });

  // Node DIR_OK {Result?} -> OK, and node MOVE_CHECK {alreadyStored?} -> No
  test('directing an unlocated pallet opens the Verify-Put Modal with no move message', async ({ page }) => {
    await directPallet(page, LIVE_AISLE, 'put');

    await expect(modal(page)).toBeVisible();
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

  // Verify-Put Modal (#151) — Rack body: straight port of Item/DPCI/Pallet ID/Confirm
  // Location, no Carton Quantity or Exists Elsewhere (Hand-only fields).
  test('the modal shows the Rack body for a non-XS directed location', async ({ page }) => {
    const { directedLocationSize } = await directPallet(page, LIVE_AISLE, 'put');
    expect(directedLocationSize).not.toBe('XS');

    await expect(modal(page).getByText('Pallet ID', { exact: true })).toBeVisible();
    await expect(modal(page).getByText('Description', { exact: true })).toBeVisible();
    await expect(modal(page).getByText('DPCI', { exact: true })).toBeVisible();
    await expect(modal(page).getByText('Confirm Location', { exact: true })).toBeVisible();
    await expect(modal(page).getByText('Carton Quantity', { exact: true })).not.toBeVisible();
    await expect(modal(page).getByRole('button', { name: '⇄ Exists Elsewhere' })).not.toBeVisible();
  });

  // #151 follow-up (direct instruction, post-ship) — the modal must show the actual
  // directed-to location, not just an empty Confirm Location entry panel, plus a
  // Storage Code+Size badge next to it and a Storage Code-only badge next to the DPCI.
  test('the modal shows the directed-to location and Storage Code badges', async ({ page }) => {
    const { directedLocation } = await directPallet(page, LIVE_AISLE, 'put');

    await expect(modal(page).getByText('Directed To', { exact: true })).toBeVisible();
    // fmtLocation's own dashed display form, not the raw 8-digit id.
    await expect(modal(page).getByText(fmtLocation(directedLocation))).toBeVisible();
    // Aisle 304's own seeded eligible type (see directPallet's own comment) is Conveyable
    // Reserve/Small — "CR" is the badge text, "CR-M"/"CR-L" etc. would only appear for a
    // different Size; Small isn't itself shown on the badge, only Storage Code(+Size).
    await expect(modal(page).getByText('CR-S', { exact: true })).toBeVisible();
    await expect(modal(page).getByText('CR', { exact: true })).toBeVisible();
  });

  // Verify-Put Modal (#151) — Hand body: Rack's own fields plus a standalone Carton
  // Quantity field beside Location. Exists Elsewhere is covered separately below (needs
  // mocked same-DPCI-elsewhere data, too flaky to rely on real seed coincidences for).
  test('the modal shows the Hand body for an XS directed location, with Carton Quantity', async ({ page }) => {
    const { directedLocationSize, directedLocation } = await directPalletHand(page, LIVE_AISLE_XS);
    expect(directedLocationSize).toBe('XS');
    void directedLocation;

    await expect(modal(page).getByText('Carton Quantity', { exact: true })).toBeVisible();
  });

  // Node CONF_OK {Result?} -> LOCATION_MISMATCH
  test('confirming the wrong location shows an error and keeps the modal open', async ({ page }) => {
    // `Move`, not `Put` — this test only cares about the confirm step, and `Move` is
    // reliably backed by real seed data (see the "no eligible locations" test's own note).
    const { directedLocation } = await directPallet(page, LIVE_AISLE, 'move');
    await page.getByRole('button', { name: '✗ Location' }).click();

    await expect(page.getByText(`Wrong location — directed to ${directedLocation}`)).toBeVisible();
    await expect(modal(page)).toBeVisible();
  });

  // Node CONF_OK {Result?} -> OK
  test('confirming the correct location completes the put and closes the modal', async ({ page }) => {
    const { directedLocation } = await directPallet(page, LIVE_AISLE, 'move');
    await page.getByRole('button', { name: '✓ Location' }).click();

    // `Move`, not `Put` (see directPallet's own note) — a Move's completion message is
    // "Move complete — {cleared} → {directed}", not "Put complete — {directed}" — no `$`
    // anchor after the location, since landing on an EMPTY (not pre-staged) location adds
    // a further "— location was not staged" suffix.
    await expect(page.getByText(new RegExp(`^Move complete — .* → ${fmtLocation(directedLocation)}`))).toBeVisible();
    await expect(modal(page)).not.toBeVisible();
  });

  // Node ACTION {Worker action?} -> Unassign -> node UN_OK {Result?} -> OK
  test('unassigning releases the reservation without completing a put', async ({ page }) => {
    const { directedLocation } = await directPallet(page, LIVE_AISLE, 'move');
    await modal(page).getByRole('button', { name: 'Unassign' }).click();

    await expect(page.getByText(`Reservation cleared — ${directedLocation} released`)).toBeVisible();
    await expect(modal(page)).not.toBeVisible();
    await expect(page.getByText(/^Put complete/)).not.toBeVisible();
  });

  // Node ACTION {Worker action?} -> Hold Location. A locked Hold Both / reason-70 confirm
  // (LockedHoldConfirmDialog, same shape as MNP's occupied-location gate), not the full
  // HoldPanel; it stops once placed (no auto-continue to a new location).
  test('Hold Location places Hold Both on the reserved location and returns to entry, no auto-continue', async ({ page }) => {
    const { directedLocation } = await directPallet(page, LIVE_AISLE, 'put');
    await modal(page).getByRole('button', { name: 'Hold Location' }).click();

    await expect(page.getByText('Place Hold Both — Blocked Location')).toBeVisible();
    await pickCode(page, 'Reason Number', '70');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    await expect(page.getByText(`Hold Both placed on ${fmtLocation(directedLocation)}`)).toBeVisible();
    await expect(modal(page)).not.toBeVisible();
  });

  // Hand Put's "Exists elsewhere" redirect flow — mocked at the API layer (same
  // rationale PIP's own FP level-mismatch test uses: crafting real seed data with known
  // XS matches of the same DPCI would be too flaky against a shared, mutating dev DB to
  // rely on).
  //
  // #151 follow-up: picking a candidate must *retarget* the put, not complete it — the
  // worker still confirms the new location. #215 keeps the reservation live through the
  // redirect and completes it via confirmPut with a targetLocation.
  test('Exists Elsewhere redirects without completing, then Confirm finishes the consolidation', async ({ page }) => {
    // #215: candidates come from the server (already filtered — same DPCI, XS, cartons > 0,
    // reserved location excluded), a redirect keeps the reservation (no unassign), and the
    // confirm goes through confirmPut with the redirect target.
    await page.route('**/api/puts/*/consolidation-candidates', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ locations: [
          { locationId: '20001901', storageCode: 'BS', currentCartons: 12, palletId: 1 },
          { locationId: '20001905', storageCode: 'BS', currentCartons: 9, palletId: 5 },
        ] }),
      });
    });
    let unassignCalls = 0;
    await page.route('**/api/puts/*/unassign', async (route) => {
      unassignCalls++;
      await route.continue();
    });
    let confirmBody: { scannedLocation?: string; targetLocation?: string } | null = null;
    await page.route('**/api/puts/*/confirm', async (route) => {
      confirmBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ consolidated: true, targetPalletId: 5, location: '20001905' }),
      });
    });

    await directPalletHand(page, LIVE_AISLE_XS);

    await modal(page).getByRole('button', { name: '⇄ Exists Elsewhere' }).click();
    await expect(page.getByText('Exists Elsewhere', { exact: true })).toBeVisible();
    await page.getByText('12 cartons').click();

    // Redirect only — no completion, and the reservation stays live (no unassign).
    await expect(page.getByText('Redirected to 200-019-01 — confirm the new location to complete')).toBeVisible();
    await expect(modal(page)).toBeVisible();
    expect(confirmBody).toBeNull();
    expect(unassignCalls).toBe(0);

    // Unassign still offered (it releases the live reservation); Hold Location hidden while
    // redirected; Return to {reserved location} offered.
    await expect(modal(page).getByRole('button', { name: 'Unassign' })).toBeVisible();
    await expect(modal(page).getByRole('button', { name: 'Hold Location' })).not.toBeVisible();
    await expect(modal(page).getByRole('button', { name: /^Return to/ })).toBeVisible();

    // A second pick is a local retarget too; the current target drops out of the list.
    await modal(page).getByRole('button', { name: '⇄ Exists Elsewhere' }).click();
    await expect(page.getByText('12 cartons')).not.toBeVisible();
    await page.getByText('9 cartons').click();
    expect(unassignCalls).toBe(0);

    // Confirm — confirmPut with the redirect target.
    await page.getByRole('button', { name: '✓ Location' }).click();

    await expect(page.getByText(/^Redirected — consolidated into/)).toBeVisible();
    await expect(modal(page)).not.toBeVisible();
    expect(confirmBody).not.toBeNull();
    expect(confirmBody!.targetLocation).toBe('20001905');
  });

  // Return to the reserved location is a local retarget — no server call at all (#215:
  // the reservation was never released, so there's nothing to re-acquire).
  test('Return to Original swaps the target back with no further API call', async ({ page }) => {
    await page.route('**/api/puts/*/consolidation-candidates', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ locations: [{ locationId: '20001901', storageCode: 'BS', currentCartons: 12, palletId: 1 }] }),
      });
    });
    let writeCalls = 0;
    await page.route('**/api/puts/**', async (route) => {
      if (route.request().method() !== 'GET') writeCalls++;
      await route.fallback(); // let the candidates mock above answer its request
    });

    await directPalletHand(page, LIVE_AISLE_XS);
    writeCalls = 0; // Reset after the directedPut itself.

    await modal(page).getByRole('button', { name: '⇄ Exists Elsewhere' }).click();
    await page.getByText('12 cartons').click();
    await expect(modal(page).getByRole('button', { name: /^Return to/ })).toBeVisible();

    await modal(page).getByRole('button', { name: /^Return to/ }).click();

    await expect(modal(page).getByRole('button', { name: /^Return to/ })).not.toBeVisible();
    await expect(modal(page).getByRole('button', { name: '⇄ Exists Elsewhere' })).toBeVisible();
    await expect(modal(page).getByRole('button', { name: 'Hold Location' })).toBeVisible();
    expect(writeCalls).toBe(0);
  });

  test.describe('role gating (IM+ overrides)', () => {
    test('IM sees Size, Storage, and Zone override fields', async ({ page }) => {
      await expect(page.getByText('Size', { exact: true })).toBeVisible();
      await expect(page.getByText('Storage', { exact: true })).toBeVisible();
      await expect(page.getByText('Zone', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Consolidating' })).toBeVisible();
    });
  });

  // Issue #50: no Applying-constraints bubbles until at least one override is actually
  // set, then one bubble appears per selected override (not just one) — confirms overrides
  // combine with AND rather than the system only acting on a single one. Issue #64 split
  // the original single "Applying: Size M + Storage CR" summary bubble into a leading
  // "Applying / Constraints" bubble plus one independently-clickable bubble per constraint
  // (`SDPPage.tsx`'s own comment on this row) — assert the bubbles that actually render
  // today, not the retired single-string format.
  test('the "Applying Constraints" bubbles list every selected override', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Applying Constraints' })).not.toBeVisible();

    await pickCode(page, 'Size', 'M');
    // Zone is also a CodePickerField now (issue #80), not a native <select> — pickCode,
    // not .selectOption().
    await pickCode(page, 'Zone', '2');

    await expect(page.getByRole('button', { name: 'Applying Constraints' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Size M', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zone 2', exact: true })).toBeVisible();
  });
});

test.describe('SDP — Worker role gating', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  // Size is deliberately visible/usable by every role, not IM+-gated — "the one override
  // every authenticated role can use," per SDPPage.tsx's own comment on `SizeField`'s
  // placement outside the `{isIM && (...)}` block. Storage/Zone/Consolidating are the
  // actual IM+-only fields. (Issue #177 filed this as "Worker sees Size" being a bug —
  // confirmed against the code this is the documented, intentional behavior, not a bug;
  // this test asserts the real IM+-only fields instead of the mistaken Size assumption.)
  test('Worker sees Size but not Storage/Zone/Consolidating', async ({ page }) => {
    await page.goto('/put/directed');

    await expect(page.getByText('Size', { exact: true })).toBeVisible();
    await expect(page.getByText('Storage', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Zone', { exact: true })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Consolidating' })).not.toBeVisible();
  });

  // Exists Elsewhere is open to every role since #204 (v1.8.13 — the consolidate path has
  // no role gate). The old orphaning risk this test once guarded is gone: since #215 a
  // redirect never releases the reservation. Candidate mocked so the role, not data
  // availability, is what's exercised.
  test('Worker sees Exists Elsewhere when a candidate exists', async ({ page }) => {
    await page.route('**/api/puts/*/consolidation-candidates', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ locations: [{ locationId: '20001901', storageCode: 'BS', currentCartons: 12, palletId: 1 }] }),
    }));

    await page.goto('/put/directed');
    await tapKeys(page, LIVE_AISLE_XS);
    await pickCode(page, 'Size', 'XS');
    await page.getByRole('button', { name: 'Pallet ID by Status' }).click();
    // Same Storage Code narrowing directPalletHand uses (Aisle 200's own XS/EMPTY stock is
    // all storage code BS/"Security") — the demo popup's own filters aren't IM+-gated, so
    // this is available to Worker too.
    const dropdown = page.locator('div.relative.inline-flex', { hasText: 'Storage Code' });
    await dropdown.getByRole('button').first().click();
    await dropdown.getByRole('button', { name: 'Security', exact: true }).click();
    await page.getByRole('button', { name: 'Find', exact: true }).click();

    await expect(modal(page)).toBeVisible();
    await expect(modal(page).getByRole('button', { name: '⇄ Exists Elsewhere' })).toBeVisible();
  });
});
