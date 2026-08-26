import { test, expect, type Page } from '@playwright/test';

/**
 * Demo scanner combination tests for MNP — destination gates (contraction, hold,
 * occupied, staged) and pallet status rejections.
 *
 * Gate tests exercise the full scan→location→level→confirm flow and verify the
 * correct popup or error message appears for each gate. Contraction uses the real
 * demo scanner (seed data has contracted locations at level 1). Hold and occupied
 * gates mock the confirm endpoint since the required DB state isn't seeded reliably.
 *
 * IM+ override tests use stateful mocks: first confirm call returns the gate error,
 * second (after the worker clicks "Complete Put") returns success.
 */

async function scanPallet(page: Page, mode: 'put' | 'move') {
  await page.getByRole('button', { name: 'Pallet ID by Status' }).click();
  if (mode === 'move') {
    const statusDropdown = page.locator('div.relative.inline-flex', { hasText: 'Status' });
    await statusDropdown.getByRole('button').first().click();
    await statusDropdown.getByRole('button', { name: 'Stored', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(page.getByText('Item', { exact: true })).toBeVisible();
}

async function pickDestination(page: Page, statusLabel: 'Empty' | 'Stored') {
  await page.getByRole('button', { name: 'Location by Filter' }).click();
  const statusDropdown = page.locator('div.relative.inline-flex', { hasText: 'Status' });
  await statusDropdown.getByRole('button').first().click();
  await statusDropdown.getByRole('button', { name: statusLabel, exact: true }).click();
  await page.getByRole('button', { name: 'Find', exact: true }).click();
}

async function pickDemoFilter(page: Page, label: string, optionLabel: string) {
  const dropdown = page.locator('div.relative.inline-flex', { hasText: label });
  await dropdown.getByRole('button').first().click();
  await dropdown.getByRole('button', { name: optionLabel, exact: true }).click();
}

async function confirmLevel(page: Page) {
  const modal = page.getByRole('heading', { name: 'What level was the pallet placed at?' }).locator('xpath=..');
  await modal.getByRole('button', { name: 'Enter', exact: true }).click();
}

const MOCK_SUCCESS = {
  location: '30405601',
  level: 1,
  wasMove: false,
  clearedLocation: null,
  destinationWasOccupied: false,
  destinationWasStaged: false,
};

// ── Worker gate tests ───────────────────────────────────────────────────────

test.describe('MNP — Destination gates (Worker)', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/put/manual');
  });

  test('a contracted destination blocks Worker with an error message', async ({ page }) => {
    await scanPallet(page, 'put');

    await page.getByRole('button', { name: 'Location by Filter' }).click();
    await pickDemoFilter(page, 'Contraction', 'Contracted');
    await pickDemoFilter(page, 'Status', 'Empty');
    await page.getByRole('button', { name: 'Find', exact: true }).click();

    await confirmLevel(page);

    await expect(page.getByText('This location is on contraction — put not allowed')).toBeVisible();
  });

  test('a held destination blocks Worker with an error message', async ({ page }) => {
    await scanPallet(page, 'put');

    await page.route('**/api/puts/manual/confirm', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'DESTINATION_ON_HOLD' }),
          })
        : route.continue(),
    );

    await pickDestination(page, 'Empty');
    await confirmLevel(page);

    await expect(page.getByText('This location is on hold — put not allowed')).toBeVisible();
  });

  test('a Hold Permanent destination blocks all roles', async ({ page }) => {
    await scanPallet(page, 'put');

    await page.route('**/api/puts/manual/confirm', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'DESTINATION_HOLD_PERM' }),
          })
        : route.continue(),
    );

    await pickDestination(page, 'Empty');
    await confirmLevel(page);

    await expect(page.getByText('This location is on Hold Permanent — put not allowed')).toBeVisible();
  });

  test('an occupied destination (different DPCI) shows the Location Already Occupied popup', async ({ page }) => {
    await scanPallet(page, 'put');

    await page.route('**/api/puts/manual/confirm', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'DESTINATION_OCCUPIED',
              occupantPalletId: 99999,
              occupantDpci: '999-99-9999',
              matchesDpci: false,
              wasStaged: false,
            }),
          })
        : route.continue(),
    );

    await pickDestination(page, 'Empty');
    await confirmLevel(page);

    await expect(page.getByText('Location Already Occupied')).toBeVisible();
    await expect(page.getByText('Pallet 99999 (DPCI 999-99-9999) is already stored here')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Proceed Anyway' })).toBeVisible();
  });

  test('a staged destination completes with a "(was staged)" warning', async ({ page }) => {
    await scanPallet(page, 'put');

    await page.route('**/api/puts/manual/confirm', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ...MOCK_SUCCESS, destinationWasStaged: true }),
          })
        : route.continue(),
    );

    await pickDestination(page, 'Empty');
    await confirmLevel(page);

    await expect(page.getByText(/\(was staged\)$/)).toBeVisible();
  });

  test('a CANCELED pallet shows the generic scan-failed error', async ({ page }) => {
    await page.route('**/api/puts/manual/scan', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'CANCELED' }),
          })
        : route.continue(),
    );

    await page.getByRole('button', { name: '✓ Valid Pallet ID' }).click();

    await expect(page.getByText('Scan failed — please try again')).toBeVisible();
  });

  test('a pull-pending pallet shows the generic scan-failed error', async ({ page }) => {
    await page.route('**/api/puts/manual/scan', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'BLOCKED_BY_PENDING_PULL' }),
          })
        : route.continue(),
    );

    await page.getByRole('button', { name: '✓ Valid Pallet ID' }).click();

    await expect(page.getByText('Scan failed — please try again')).toBeVisible();
  });
});

// ── IM+ gate override tests ────────────────────────────────────────────────

test.describe('MNP — Destination gate overrides (IM+)', () => {
  test.use({ storageState: 'playwright/.auth/im.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/put/manual');
  });

  test('IM+ can override a contracted destination via the confirmation popup', async ({ page }) => {
    await scanPallet(page, 'put');

    let confirmCalls = 0;
    await page.route('**/api/puts/manual/confirm', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      confirmCalls++;
      if (confirmCalls === 1) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'CONTRACTION_CONFIRM_REQUIRED' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_SUCCESS),
        });
      }
    });

    await pickDestination(page, 'Empty');
    await confirmLevel(page);

    await expect(page.getByText('Location On Contraction')).toBeVisible();
    await expect(page.getByText('This location is on contraction, do you want to complete the put?')).toBeVisible();
    await page.getByRole('button', { name: 'Complete Put' }).click();

    await expect(page.getByText(/^Put complete/)).toBeVisible();
    expect(confirmCalls).toBe(2);
  });

  test('IM+ can override a held destination via the confirmation popup', async ({ page }) => {
    await scanPallet(page, 'put');

    let confirmCalls = 0;
    await page.route('**/api/puts/manual/confirm', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      confirmCalls++;
      if (confirmCalls === 1) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'HOLD_CONFIRM_REQUIRED', holdCategory: 'HOLD_BOTH' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_SUCCESS),
        });
      }
    });

    await pickDestination(page, 'Empty');
    await confirmLevel(page);

    await expect(page.getByText('Location On Hold Both')).toBeVisible();
    await expect(page.getByText('This location is on hold, do you want to complete the put?')).toBeVisible();
    await page.getByRole('button', { name: 'Complete Put' }).click();

    await expect(page.getByText(/^Put complete/)).toBeVisible();
    expect(confirmCalls).toBe(2);
  });

  test('IM+ can combine same-DPCI pallets via the confirmation popup', async ({ page }) => {
    await scanPallet(page, 'put');

    let confirmCalls = 0;
    await page.route('**/api/puts/manual/confirm', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      confirmCalls++;
      if (confirmCalls === 1) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'DESTINATION_OCCUPIED',
            occupantPalletId: 99999,
            occupantDpci: '085-02-0006',
            matchesDpci: true,
            wasStaged: false,
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            consolidated: true,
            targetPalletId: 99999,
            sourcePalletId: 1234,
            location: '30405601',
          }),
        });
      }
    });

    await pickDestination(page, 'Empty');
    await confirmLevel(page);

    await expect(page.getByText('Same Item Already Stored Here')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Combine Pallets' })).toBeVisible();
    await page.getByRole('button', { name: 'Combine Pallets' }).click();

    await expect(page.getByText(/combined into Pallet 99999/)).toBeVisible();
    expect(confirmCalls).toBe(2);
  });
});
