import { test, expect } from '@playwright/test';
import { tapKeys, loginManually, USERS } from './helpers';

/**
 * Covers every decision diamond in Documentation/Flowcharts-ERDs/auth-flow.mmd.
 *
 * Not covered — node C {Input method}, badge-scan branch: the hardware-scanner listener
 * (AppShell's keydown buffer, see src/components/shell/AppShell.tsx) is only mounted
 * inside the authenticated shell. LoginPage renders with no AppShell wrapper, so there is
 * no scanner listener attached on the login screen to exercise — the diagram's "Badge
 * scan" arrow has no reachable implementation to test against yet.
 */
test.describe('auth flow', () => {
  // Node I {Found?} -> No (NOT_FOUND)
  test('unknown zNumber shows an error and stays on login', async ({ page }) => {
    await page.goto('/login');
    await tapKeys(page, '999999');
    await page.getByRole('button', { name: 'OK', exact: true }).click();

    await expect(page.getByText('zNumber not found — rescan badge or re-enter')).toBeVisible();
    await expect(page).toHaveURL('/login');
    // ZnumPad is cleared back to just the 'z' prefix — OK button disabled again.
    await expect(page.getByRole('button', { name: 'OK', exact: true })).toBeDisabled();
  });

  // Node I {Found?} -> Yes
  test('known zNumber navigates to the PIN screen with a name greeting', async ({ page }) => {
    await page.goto('/login');
    await tapKeys(page, USERS.worker.zNumber);
    await page.getByRole('button', { name: 'OK', exact: true }).click();

    await expect(page).toHaveURL('/pin');
    await expect(page.getByText(`Welcome: ${USERS.worker.firstName}`)).toBeVisible();
  });

  // Node O {pin.length === 4?} -> Yes, auto-submit
  test('PIN screen submits automatically at 4 digits with no OK tap', async ({ page }) => {
    await page.goto('/login');
    await tapKeys(page, USERS.worker.zNumber);
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(page.getByText(`Welcome: ${USERS.worker.firstName}`)).toBeVisible();

    await tapKeys(page, USERS.worker.pin);
    // No OK tap on the PinPad — reaching home confirms the auto-submit fired on the 4th digit.
    await expect(page).toHaveURL('/');
  });

  // Node R {Valid?} -> No (INVALID_PIN)
  test('wrong PIN shows an error, clears the PIN, and stays on the PIN screen', async ({ page }) => {
    await page.goto('/login');
    await tapKeys(page, USERS.worker.zNumber);
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(page.getByText(`Welcome: ${USERS.worker.firstName}`)).toBeVisible();

    await tapKeys(page, '0000');

    await expect(page.getByText('Incorrect PIN — try again')).toBeVisible();
    await expect(page.getByText(`Welcome: ${USERS.worker.firstName}`)).toBeVisible(); // greeting persists
    await expect(page).toHaveURL('/pin'); // does not bounce back to /login
  });

  // Node R {Valid?} -> Yes
  test('correct PIN issues a session and reaches the home screen', async ({ page }) => {
    await loginManually(page, USERS.worker.zNumber, USERS.worker.pin);

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('button', { name: 'Pallet ID Pull' })).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem('palletiq_token'));
    expect(token).toBeTruthy();
  });

  test('direct navigation to /pin without identifying first redirects to /login', async ({ page }) => {
    await page.goto('/pin');
    await expect(page).toHaveURL('/login');
  });
});
