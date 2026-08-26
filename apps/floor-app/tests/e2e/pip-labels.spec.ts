import { test, expect, type Page } from '@playwright/test';
import { hardwareScan } from './helpers';

test.use({ storageState: 'playwright/.auth/worker.json' });

async function selectFunction(page: Page, desc: string) {
  const trigger = page.locator('div.relative.inline-flex').getByRole('button').first();
  if ((await trigger.innerText()).includes(desc)) return;
  await trigger.click();
  await page.locator('div.absolute.z-50').getByRole('button', { name: desc }).click();
}

async function pickDemoFilter(page: Page, label: string, optionLabel: string) {
  const popup = page.locator('div.flex.flex-col.gap-4', { has: page.getByRole('heading', { name: 'Find a Label' }) });
  const dropdown = popup.locator('div.relative.inline-flex', { hasText: label });
  await dropdown.getByRole('button').first().click();
  await dropdown.getByRole('button', { name: optionLabel, exact: true }).click();
}

/**
 * Demo scanner combination tests for PIP label scanning — pull function mismatches
 * and non-PRINTED container statuses.
 *
 * Function mismatch tests use the real Label by Status popup (all seeded containers
 * are pullFunction: 'CA', so fetching one while the screen is on CF/FP always triggers
 * the mismatch check). Status tests mock the container endpoint since the DB may not
 * have containers in every non-PRINTED status.
 */
test.describe('PIP — Pull function mismatch via demo scanner', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pull');
  });

  test('a CA label scanned in CF mode shows wrong-function error', async ({ page }) => {
    await selectFunction(page, 'Carton Floor');
    await page.getByRole('button', { name: 'Label by Status' }).click();
    await pickDemoFilter(page, 'Pull Function', 'CA — Carton Air');
    await page.getByRole('button', { name: 'Find', exact: true }).click();

    await expect(page.getByText('Wrong function — label requires CA')).toBeVisible();
  });

  test('a CA label scanned in FP mode shows wrong-function error', async ({ page }) => {
    await selectFunction(page, 'Full Pallet');
    await page.getByRole('button', { name: 'Label by Status' }).click();
    await pickDemoFilter(page, 'Pull Function', 'CA — Carton Air');
    await page.getByRole('button', { name: 'Find', exact: true }).click();

    await expect(page.getByText('Wrong function — label requires CA')).toBeVisible();
  });
});

test.describe('PIP — Invalid container status', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pull');
  });

  test('a PULLED label shows "Invalid status: PULLED"', async ({ page }) => {
    await page.route('**/api/containers/MOCK-PULLED*', (route) => route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'PULLED' }),
    }));
    await selectFunction(page, 'Carton Air');
    await expect(page.getByRole('button', { name: '✓ Valid Label' })).toBeVisible();
    await hardwareScan(page, 'MOCK-PULLED');

    await expect(page.getByText('Invalid status: PULLED')).toBeVisible();
  });

  test('a CANCELED label shows "Invalid status: CANCELED"', async ({ page }) => {
    await page.route('**/api/containers/MOCK-CANCELED*', (route) => route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'CANCELED' }),
    }));
    await selectFunction(page, 'Carton Air');
    await expect(page.getByRole('button', { name: '✓ Valid Label' })).toBeVisible();
    await hardwareScan(page, 'MOCK-CANCELED');

    await expect(page.getByText('Invalid status: CANCELED')).toBeVisible();
  });

  test('a DIVERTED label shows "Invalid status: DIVERTED"', async ({ page }) => {
    await page.route('**/api/containers/MOCK-DIVERTED*', (route) => route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'DIVERTED' }),
    }));
    await selectFunction(page, 'Carton Air');
    await expect(page.getByRole('button', { name: '✓ Valid Label' })).toBeVisible();
    await hardwareScan(page, 'MOCK-DIVERTED');

    await expect(page.getByText('Invalid status: DIVERTED')).toBeVisible();
  });
});
