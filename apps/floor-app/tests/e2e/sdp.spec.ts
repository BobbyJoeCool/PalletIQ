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
  await page.getByRole('button', { name: 'OK', exact: true }).click();
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
test.describe('SDP — System Directed Put flow', () => {
  test.use({ storageState: 'playwright/.auth/im.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/put/directed');
  });

  // Release any reservation a test leaves open so it doesn't tie up a location for 5 minutes.
  test.afterEach(async ({ page }) => {
    const unassign = modal(page).getByRole('button', { name: 'Unassign' });
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
    await expect(modal(page).getByText('Item', { exact: true })).toBeVisible();
    await expect(modal(page).getByText('DPCI', { exact: true })).toBeVisible();
    await expect(modal(page).getByText('Confirm Location', { exact: true })).toBeVisible();
    await expect(modal(page).getByText('Carton Quantity', { exact: true })).not.toBeVisible();
    await expect(modal(page).getByRole('button', { name: '⇄ Exists Elsewhere' })).not.toBeVisible();
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

  // Node ACTION {Worker action?} -> Hold Location. Replaces the old "Blocked Put" test
  // entirely (issue #151 — Hold Location embeds the shared HoldPanel and stops; no more
  // auto-continue to a new location, no more hardcoded Hold Both).
  test('Hold Location places a hold via the shared HoldPanel and returns to entry, no auto-continue', async ({ page }) => {
    const { directedLocation } = await directPallet(page, LIVE_AISLE, 'move');
    await modal(page).getByRole('button', { name: 'Hold Location' }).click();

    // HoldPanel itself (same component PIP/MNP/WLH already use) — pick a type, a reason
    // code, and confirm.
    // Not `exact: true` — the button's accessible name is its type name plus its "blocks"
    // description span concatenated ("Hold BothBlocks puts and new label generation"), same
    // pattern as the demo popup's own Size options ("XS\n— Extra Small (Hand Put)"). No other
    // Hold Type name starts with "Hold Both", so an anchored prefix regex is unambiguous.
    await expect(page.getByText('Hold Type', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Hold Both/ }).click();
    await pickCode(page, 'Reason Code', 'B01');
    await page.getByRole('button', { name: 'Confirm Hold', exact: true }).click();

    await expect(page.getByText(`Hold Both placed on ${fmtLocation(directedLocation)}`)).toBeVisible();
    // No auto-continue — back to entry, not re-directed to a new location.
    await expect(modal(page)).not.toBeVisible();
  });

  // Hand Put's "Exists elsewhere" redirect+consolidate flow — mocked at the API layer
  // (same rationale PIP's own FP level-mismatch test uses: crafting real seed data with
  // two known XS locations of the same DPCI, one stored and one about to be freshly
  // directed, would be too flaky against a shared, mutating dev DB to rely on).
  //
  // The mocked "same location as the one directed to" entry needs the *real* directed
  // location (only known after `directPalletHand` resolves), not a hardcoded fake ID — an
  // earlier version of this test hardcoded '20001902' for that entry, which the real
  // search obviously never actually lands on, so it silently skipped the self-filter
  // rather than testing it (surfaced as the modal showing an unwanted extra "4 cartons"
  // row). The route handler is registered before `directPalletHand` (it must be, to catch
  // the modal's own fetch-on-mount), but its response is deferred behind
  // `resolveDirectedLocation` — the request just waits on the wire until that's called.
  test('Exists Elsewhere redirects the put and consolidates into the picked location', async ({ page }) => {
    let resolveDirectedLocation!: (loc: string) => void;
    const directedLocationPromise = new Promise<string>((res) => { resolveDirectedLocation = res; });

    await page.route('**/api/items/dpci/*/locations', async (route) => {
      const selfLocation = await directedLocationPromise;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          dpci: '085-02-0006',
          descShort: 'Test Item',
          locations: [
            { locationId: '20001901', palletId: 1, storageCode: 'BS', size: 'XS', currentPallets: 0, currentCartons: 12, currentSSPs: 0, vcp: 1, ssp: 1 },
            // Same location as the one actually directed-to — must be filtered out of the
            // popup rather than offered as its own "elsewhere."
            { locationId: selfLocation, palletId: 2, storageCode: 'BS', size: 'XS', currentPallets: 0, currentCartons: 4, currentSSPs: 0, vcp: 1, ssp: 1 },
            // Non-XS match — must also be filtered out (Hand Put only consolidates into
            // other hand-stock locations).
            { locationId: '20001903', palletId: 3, storageCode: 'BS', size: 'HS', currentPallets: 1, currentCartons: 40, currentSSPs: 0, vcp: 1, ssp: 1 },
          ],
        }),
      });
    });
    let confirmBody: { destinationLocation?: string; resolution?: string } | null = null;
    await page.route('**/api/puts/manual/confirm', async (route) => {
      confirmBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ location: '20001901', level: 1, wasMove: false, clearedLocation: null, destinationWasStaged: false, destinationWasOccupied: true }),
      });
    });

    const { directedLocation } = await directPalletHand(page, LIVE_AISLE_XS);
    resolveDirectedLocation(directedLocation);

    await modal(page).getByRole('button', { name: '⇄ Exists Elsewhere' }).click();
    await expect(page.getByText('Exists Elsewhere', { exact: true })).toBeVisible();
    // The non-elsewhere (self) and non-XS rows are filtered client-side — only one row.
    await expect(page.getByText('12 cartons')).toBeVisible();
    await expect(page.getByText('4 cartons')).not.toBeVisible();
    await expect(page.getByText('40 cartons')).not.toBeVisible();

    await page.getByText('12 cartons').click();

    await expect(page.getByText(/^Redirected — consolidated into/)).toBeVisible();
    await expect(modal(page)).not.toBeVisible();
    expect(confirmBody).not.toBeNull();
    expect(confirmBody!.destinationLocation).toBe('20001901');
    expect(confirmBody!.resolution).toBe('consolidate');
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

  // A Worker can reach Hand Put (Size is worker-visible, see above), but "Exists Elsewhere"
  // must stay hidden even when a real candidate exists — `manual/confirm`'s own
  // `resolution: 'consolidate'` is hard-gated `requireRole(auth, 'IM')` server-side
  // (`api/functions/puts.ts`), so showing the button to a Worker would let them unassign
  // the original reservation successfully and then hit a 403 on the redirect, orphaning the
  // pallet as `PUT_PENDING` with no reservation. The candidate is mocked to guarantee this
  // is actually exercising the role gate, not just "no real match happened to exist."
  test('Worker does not see Exists Elsewhere even when a candidate exists', async ({ page }) => {
    await page.route('**/api/items/dpci/*/locations', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        dpci: '085-02-0006',
        descShort: 'Test Item',
        locations: [
          { locationId: '20001901', palletId: 1, storageCode: 'BS', size: 'XS', currentPallets: 0, currentCartons: 12, currentSSPs: 0, vcp: 1, ssp: 1 },
        ],
      }),
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
    await expect(modal(page).getByRole('button', { name: '⇄ Exists Elsewhere' })).not.toBeVisible();
  });
});
