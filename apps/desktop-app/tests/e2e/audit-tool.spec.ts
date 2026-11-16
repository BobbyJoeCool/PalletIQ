import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { USERS, launchApp, openScreen, signInAs } from './helpers';

// Audit Tool (#148): read-only three-pane lookup with cross-reference chips and export.

let app: ElectronApplication;
let window: Page;
const pane = (n: number) => window.getByRole('region', { name: `Pane ${n}`, exact: true });

test.beforeAll(async () => {
  ({ app, window } = await launchApp());
  await signInAs(window, USERS.lww);
  await openScreen(window, /Audit Tool/);
});

test.afterAll(async () => {
  await app.close();
});

test('an aisle lookup shows its summary and merged trail', async () => {
  await pane(1).getByLabel('Pane 1 lookup type').selectOption('AISLE');
  await pane(1).getByLabel('Pane 1 identifier').fill('318');
  await pane(1).getByLabel('Pane 1 identifier').press('Enter');
  await expect(pane(1).getByRole('heading', { name: 'Aisle 318' })).toBeVisible();
  await expect(pane(1).locator('ol > li').first()).toBeVisible();
});

test('a chip opens its record in another pane from the click menu', async () => {
  const chip = pane(1).locator('ol > li').first().getByRole('button').first();
  await chip.click();
  await window.getByRole('menuitem', { name: 'Open in Pane 2' }).click();
  await expect(pane(2).getByRole('heading', { level: 2 }).nth(1)).toBeVisible();
  await expect(pane(1).getByRole('heading', { name: 'Aisle 318' })).toBeVisible();
});

test('a lookup that finds nothing only affects its own pane', async () => {
  await pane(3).getByLabel('Pane 3 lookup type').selectOption('PALLET');
  await pane(3).getByLabel('Pane 3 identifier').fill('999999999');
  await pane(3).getByRole('button', { name: 'Look up' }).click();
  await expect(pane(3).getByRole('alert')).toHaveText('No record found.');
  await expect(pane(1).getByRole('heading', { name: 'Aisle 318' })).toBeVisible();
});

test('Export All saves one workbook', async () => {
  const file = join(tmpdir(), `palletiq-e2e-audit-${Date.now()}.xlsx`);
  await app.evaluate(({ session }, savePath) => {
    session.defaultSession.once('will-download', (_e, item) => item.setSavePath(savePath));
  }, file);
  await window.getByRole('button', { name: 'Export All' }).click();
  await expect.poll(() => existsSync(file) && statSync(file).size > 0, { timeout: 15_000 }).toBe(true);
  rmSync(file, { force: true });
});
