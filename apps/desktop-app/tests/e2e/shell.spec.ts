import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { USERS, launchApp, openScreen, signInAs } from './helpers';

// The signed-in shell (#140): navigation, built screens vs Coming Soon.

let app: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  ({ app, window } = await launchApp());
  await signInAs(window, USERS.lww);
});

test.afterAll(async () => {
  await app.close();
});

test('the nav marks only unbuilt screens as Soon', async () => {
  const nav = window.getByRole('navigation', { name: 'Screens' });
  await expect(nav.getByText('Soon', { exact: true })).toHaveCount(2);
  await expect(nav.getByRole('link', { name: /DPCI Setup Edit/ })).toContainText('Soon');
  await expect(nav.getByRole('link', { name: /Hung Pallet/ })).toContainText('Soon');
  await expect(nav.getByRole('link', { name: /Audit Tool/ })).not.toContainText('Soon');
});

test('an unbuilt screen shows its Coming Soon page with its issue', async () => {
  await openScreen(window, /DPCI Setup Edit/);
  await expect(window.getByText('Coming soon', { exact: true })).toBeVisible();
  await expect(window.getByText('Tracked as issue #142.')).toBeVisible();
});

test('Home lists every Manager screen', async () => {
  await window.getByRole('navigation', { name: 'Screens' }).getByRole('link', { name: 'Home' }).click();
  await expect(window.getByRole('main').getByRole('link')).toHaveCount(7);
});
