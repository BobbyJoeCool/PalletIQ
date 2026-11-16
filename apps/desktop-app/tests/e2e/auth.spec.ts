import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { USERS, launchApp, signInAs, signOutStorage } from './helpers';

// Desktop sign-in (#140): zNumber + password, desktop eligibility, sign-out, and a session
// that survives closing and reopening the app.

let app: ElectronApplication;
let window: Page;

test.beforeEach(async () => {
  ({ app, window } = await launchApp());
  await signOutStorage(window);
});

test.afterEach(async () => {
  await app.close();
});

async function submit(zNumber: string, password: string) {
  await window.getByLabel('zNumber').fill(zNumber);
  await window.getByLabel('Password').fill(password);
  await window.getByRole('button', { name: 'Sign in' }).click();
}

test('an LWW signs in and sees the shell with their role', async () => {
  await submit(USERS.lww.zNumber, USERS.lww.password);
  await expect(window.getByRole('heading', { name: 'Welcome, Nerva' })).toBeVisible();
  await expect(window.getByText(`${USERS.lww.zNumber} · LWW`)).toBeVisible();
});

test('a wrong password is refused and the password box clears', async () => {
  await submit(USERS.lww.zNumber, 'not-the-password');
  await expect(window.getByRole('alert')).toHaveText('Incorrect password.');
  await expect(window.getByLabel('Password')).toHaveValue('');
});

test('a team member without desktop access gets the no-access message, not a password error', async () => {
  await submit(USERS.worker.zNumber, 'anything');
  await expect(window.getByRole('alert')).toContainText('does not have desktop access');
});

test('an unknown zNumber is reported', async () => {
  await submit('z000x00', 'anything');
  await expect(window.getByRole('alert')).toHaveText('No team member found for that zNumber.');
});

test('signing out returns to the login screen', async () => {
  await signInAs(window, USERS.lww);
  await window.getByRole('button', { name: 'Sign out' }).click();
  await expect(window.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('the session survives closing and reopening the app', async () => {
  await signInAs(window, USERS.lww);
  await app.close();
  ({ app, window } = await launchApp());
  await expect(window.getByRole('heading', { name: 'Welcome, Nerva' })).toBeVisible();
});
