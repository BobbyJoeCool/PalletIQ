import { test as setup, expect } from '@playwright/test';
import { loginManually, USERS } from './helpers';

const WORKER_STATE = 'playwright/.auth/worker.json';
const IM_STATE = 'playwright/.auth/im.json';

setup('authenticate as worker (z002p21)', async ({ page }) => {
  await loginManually(page, USERS.worker.zNumber, USERS.worker.pin);
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Pallet ID Pull' })).toBeVisible();
  await page.context().storageState({ path: WORKER_STATE });
});

setup('authenticate as IM (z002p22)', async ({ page }) => {
  await loginManually(page, USERS.im.zNumber, USERS.im.pin);
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Pallet ID Pull' })).toBeVisible();
  await page.context().storageState({ path: IM_STATE });
});
