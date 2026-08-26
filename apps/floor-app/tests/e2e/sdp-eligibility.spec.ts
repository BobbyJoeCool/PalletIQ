import { test, expect, type Page } from '@playwright/test';
import { pickCode, tapKeys } from './helpers';

test.use({ storageState: 'playwright/.auth/im.json' });

async function pickDemoFilter(page: Page, label: string, optionLabel: string) {
  const dropdown = page.locator('div.relative.inline-flex', { hasText: label });
  await dropdown.getByRole('button').first().click();
  await dropdown.getByRole('button', { name: optionLabel, exact: true }).click();
}

function modal(page: Page) {
  return page.getByTestId('sdp-verify-put-modal');
}

/**
 * Demo scanner combination tests for SDP — storage code/size mismatches, override
 * resolution, and pallet status rejections.
 *
 * Mismatch tests exploit the fact that the demo popup's Find button does NOT filter by
 * aisle (only the ✓ Valid Pallet ID button does), so setting Storage Code = "Conveyable
 * Reserve" in the popup returns a CR pallet from any aisle, which the real directedPut
 * API then rejects against an FD-only aisle.
 *
 * Aisle seed pattern (api/prisma/seed.ts):
 *   CR: 300-309, FD: 310-319    digit 0 → all M, digit 4 → L1=M rest=S
 */
test.describe('SDP — Storage code and size eligibility via demo scanner', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/put/directed');
  });

  test.afterEach(async ({ page }) => {
    const unassign = modal(page).getByRole('button', { name: 'Unassign' });
    const cancel = modal(page).getByRole('button', { name: 'Cancel' });
    if (await unassign.isVisible().catch(() => false)) {
      await unassign.click();
    } else if (await cancel.isVisible().catch(() => false)) {
      await cancel.click();
    }
  });

  // ── Mismatch tests (real API rejection) ─────────────────────────────────────

  test('a CR pallet in an FD-only aisle shows no-eligible-locations', async ({ page }) => {
    await tapKeys(page, '310');
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await page.getByRole('button', { name: 'Pallet ID by Status' }).click();
    await pickDemoFilter(page, 'Storage Code', 'Conveyable Reserve');
    await page.getByRole('button', { name: 'Find', exact: true }).click();

    await expect(page.getByText('No eligible locations available in aisle 310')).toBeVisible();
  });

  test('a Small pallet in an all-Medium aisle shows no-eligible-locations', async ({ page }) => {
    await tapKeys(page, '300');
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await page.getByRole('button', { name: 'Pallet ID by Status' }).click();
    await pickDemoFilter(page, 'Storage Code', 'Conveyable Reserve');
    await pickDemoFilter(page, 'Size', 'Small');
    await page.getByRole('button', { name: 'Find', exact: true }).click();

    await expect(page.getByText('No eligible locations available in aisle 300')).toBeVisible();
  });

  // ── Override resolution tests (real API with overrides) ─────────────────────

  test('a Size override resolves a Small→Medium mismatch', async ({ page }) => {
    await tapKeys(page, '300');
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await pickCode(page, 'Size', 'M');

    await page.getByRole('button', { name: 'Pallet ID by Status' }).click();
    await pickDemoFilter(page, 'Storage Code', 'Conveyable Reserve');
    await pickDemoFilter(page, 'Size', 'Small');
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/puts/directed') && r.ok()),
      page.getByRole('button', { name: 'Find', exact: true }).click(),
    ]);
    const result = await resp.json();

    await expect(modal(page)).toBeVisible();
    expect(result.directedLocationSize).toBe('M');
  });

  test('a Storage Code override resolves a CR→FD mismatch', async ({ page }) => {
    await tapKeys(page, '310');
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await pickCode(page, 'Size', 'M');
    await pickCode(page, 'Storage', 'FD');

    await expect(page.getByRole('button', { name: 'Pallet ID by Status' })).toBeVisible();
    await page.getByRole('button', { name: 'Pallet ID by Status' }).click();
    await pickDemoFilter(page, 'Storage Code', 'Conveyable Reserve');
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/puts/directed') && r.ok()),
      page.getByRole('button', { name: 'Find', exact: true }).click(),
    ]);
    const result = await resp.json();

    await expect(modal(page)).toBeVisible();
    expect(result.directedLocationStorageCode).toBe('FD');
  });

  test('Size + Storage Code double override resolves both mismatches simultaneously', async ({ page }) => {
    await tapKeys(page, '310');
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await pickCode(page, 'Size', 'M');
    await pickCode(page, 'Storage', 'FD');

    await expect(page.getByRole('button', { name: 'Applying Constraints' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Size M', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Pallet ID by Status' }).click();
    await pickDemoFilter(page, 'Storage Code', 'Conveyable Reserve');
    await pickDemoFilter(page, 'Size', 'Small');
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/puts/directed') && r.ok()),
      page.getByRole('button', { name: 'Find', exact: true }).click(),
    ]);
    const result = await resp.json();

    await expect(modal(page)).toBeVisible();
    expect(result.directedLocationStorageCode).toBe('FD');
    expect(result.directedLocationSize).toBe('M');
  });

  // ── Pallet status rejection (mocked directedPut) ────────────────────────────

  test('a CANCELED pallet shows "Invalid Pallet: Canceled"', async ({ page }) => {
    await tapKeys(page, '304');
    await page.getByRole('button', { name: 'Enter', exact: true }).click();

    await page.route('**/api/puts/directed', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'CANCELED' }),
          })
        : route.continue(),
    );

    await page.getByRole('button', { name: '✓ Valid Pallet ID' }).click();

    await expect(page.getByText('Invalid Pallet: Canceled')).toBeVisible();
  });

  test('a pull-pending pallet shows "Invalid Pallet: Pull Pending"', async ({ page }) => {
    await tapKeys(page, '304');
    await page.getByRole('button', { name: 'Enter', exact: true }).click();

    await page.route('**/api/puts/directed', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'BLOCKED_BY_PENDING_PULL' }),
          })
        : route.continue(),
    );

    await page.getByRole('button', { name: '✓ Valid Pallet ID' }).click();

    await expect(page.getByText('Invalid Pallet: Pull Pending')).toBeVisible();
  });
});
