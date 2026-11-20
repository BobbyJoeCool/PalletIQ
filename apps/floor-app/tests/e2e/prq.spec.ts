import { test, expect, type Page } from '@playwright/test';
import { fieldBox, tapKeys } from './helpers';

/**
 * PRQ — Pull Request by Label (test plan Part 4, #239): pick an aisle and a container
 * status, read the batch/function summary, zoom in to the locations and open one's pull
 * detail. The aisle is the one holding a printed container from the demo sampler, so the
 * flow always has data after a reseed.
 */

/** The aisle of a pallet with a printed container, looked up through the API in-page. */
async function aisleWithPrintedContainer(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const token = localStorage.getItem('palletiq_token') ?? '';
    const headers = { 'X-Auth-Token': token };
    const { containerId } = await (await fetch('/api/demo/container?status=PRINTED&type=91', { headers })).json() as { containerId: string };
    const c = await (await fetch(`/api/containers/inquiry/${containerId}`, { headers })).json() as { location: { aisle: number } | null };
    if (!c.location) throw new Error(`container ${containerId} has no location`);
    return String(c.location.aisle).padStart(3, '0');
  });
}

async function chooseStatus(page: Page, label: string) {
  await page.locator('div', { has: page.getByText('Status', { exact: true }) }).getByRole('button', { name: '— Select —' }).last().click();
  await page.getByRole('button', { name: label, exact: true }).click();
}

test.describe('PRQ — Pull Request by Label', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/reporting/pull-request');
  });

  test('asks for an aisle and status before showing anything', async ({ page }) => {
    await expect(page.getByText('Select an aisle or range and a container status to see information.')).toBeVisible();
  });

  test('an aisle that does not exist is refused', async ({ page }) => {
    await fieldBox(page, 'Aisle').click();
    await tapKeys(page, '997');
    await expect(page.getByText('Aisle 997 does not exist')).toBeVisible();
  });

  test('aisle + Printed shows the summary; zooming in lists locations and opens the pull detail', async ({ page }) => {
    const aisle = await aisleWithPrintedContainer(page);
    await fieldBox(page, 'Aisle').click();
    await tapKeys(page, aisle);
    await chooseStatus(page, 'Printed');

    await expect(page.getByText('Level 1')).toBeVisible();
    await expect(page.getByText(/^Batch Date:/).first()).toBeVisible();
    const zoom = page.getByRole('button', { name: 'Zoom In ▸' });
    await expect(zoom).toBeDisabled();
    await page.getByRole('button', { name: /Cartons: \d+ +Locations:/ }).first().click();
    await expect(zoom).toBeEnabled();
    await zoom.click();

    // A single aisle skips the per-aisle level and goes straight to its locations.
    await expect(page.getByText('Level 3')).toBeVisible();
    await page.getByRole('button', { name: new RegExp(`^${aisle}-\\d{3}-\\d{2}`) }).first().click();
    await zoom.click();
    await expect(page.getByText(/^Pull Qty:/)).toBeVisible();
  });
});
