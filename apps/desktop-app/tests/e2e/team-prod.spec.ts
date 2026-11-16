import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { USERS, launchApp, openScreen, signInAs } from './helpers';

// Team Prod Summary (#147): read-only cards by tier, expandable worker tables, and
// access for ICQA (shown WHS, with a note).

let app: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  ({ app, window } = await launchApp());
});

test.afterAll(async () => {
  await app.close();
});

test('an LWW sees a card per function, grouped by tier', async () => {
  await signInAs(window, USERS.lww);
  await openScreen(window, /Team Prod Summary/);
  const tracked = window.getByRole('region', { name: 'Scan-tracked functions' });
  for (const name of ['CA Carton Air', 'FP Full Pallet', 'RP Rack Puts', 'GPM GPM Staging', 'CON Consolidation']) {
    await expect(tracked.getByRole('region', { name })).toBeVisible();
  }
  await expect(window.getByRole('region', { name: 'Other functions' }).getByRole('region', { name: /^DTM/ })).toBeVisible();
  await expect(tracked.getByRole('region', { name: 'BKP Breakpack' })).toContainText('not tracked yet');
});

test('a pull card shows its gauges and expands to the worker table', async () => {
  const ca = window.getByRole('region', { name: 'CA Carton Air' });
  await expect(ca.getByRole('progressbar', { name: 'Team Prod' })).toBeVisible();
  await expect(ca.getByRole('progressbar', { name: '% to Plan' })).toBeVisible();
  await ca.getByRole('button', { name: /Expand/ }).click();
  await expect(ca.getByRole('button', { name: /Collapse/ })).toHaveAttribute('aria-expanded', 'true');
});

test('ICQA can open it and is shown the warehouse with a note', async () => {
  await signInAs(window, USERS.icqa);
  await openScreen(window, /Team Prod Summary/);
  await expect(window.getByText(/has no job functions defined yet, so WHS is shown/)).toBeVisible();
});
