import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { FLOOR_APP_URL, USERS, launchApp, signInAs } from './helpers';

// Embedded Floor App (#141): the floor app in a webview, signed in from the desktop
// session, kept alive while hidden, torn down on sign-out. Needs the floor app's dev
// server; skipped when it isn't running.

let app: ElectronApplication;
let window: Page;

/** Runs a snippet inside the embedded floor app; null when no webview exists. */
async function inGuest(app: ElectronApplication, script: string): Promise<unknown> {
  return app.evaluate(async ({ webContents }, code) => {
    const guest = webContents.getAllWebContents().find((c) => c.getType() === 'webview');
    return guest ? guest.executeJavaScript(code) : null;
  }, script);
}

test.beforeAll(async () => {
  const reachable = await fetch(FLOOR_APP_URL).then((r) => r.ok).catch(() => false);
  test.skip(!reachable, `floor app not running at ${FLOOR_APP_URL}`);
  ({ app, window } = await launchApp());
  await signInAs(window, USERS.lww);
});

test.afterAll(async () => {
  await app?.close();
});

test('the toggle opens the floor app already signed in as the desktop user', async () => {
  await window.getByRole('button', { name: /Floor App/ }).first().click();
  await expect(window.getByRole('region', { name: 'Floor App' })).toBeVisible();
  await expect.poll(() => inGuest(app, 'document.body.innerText'), { timeout: 20_000 }).toContain('Signed in as Nerva');
  expect(await inGuest(app, 'typeof require')).toBe('undefined');
});

test('closing keeps the floor app running; reopening shows the same page', async () => {
  await inGuest(app, 'window.__e2eMarker = 42');
  await window.getByRole('button', { name: 'Close Floor App' }).click();
  await expect(window.getByRole('region', { name: 'Floor App' })).toBeHidden();
  await window.getByRole('button', { name: /Floor App/ }).first().click();
  expect(await inGuest(app, 'window.__e2eMarker')).toBe(42);
});

test('signing out of the desktop app destroys the embedded floor app', async () => {
  await window.getByRole('button', { name: 'Sign out' }).click();
  await expect(window.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect.poll(() => inGuest(app, '1')).toBeNull();
});
