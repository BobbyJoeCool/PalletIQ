import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { USERS, api, apiLogin, launchApp, nextWeekday, openScreen, signInAs } from './helpers';

// Prod Goal / Ramping / Daily Plan (#146): Daily Plan targets and the Needs forecast,
// ramping overrides, and goal changes (OM only). Puts back every change.

type Goals = { today: string; functions: { functionCode: string; current: { rate: number } | null; upcoming: { id: number; rate: number }[] }[] };
type Ramping = { overrides: { id: number; workerZ: string; functionCode: string }[]; workers: { zNumber: string; firstName: string; lastName: string }[] };

const DATE = nextWeekday(2); // a B1 day
let app: ElectronApplication;
let window: Page;
let lwwToken: string;
let omToken: string;
let initialUpcoming = new Set<number>();
let rampWorker: { zNumber: string; firstName: string; lastName: string };

const section = (name: string) => window.getByRole('region', { name });

test.beforeAll(async () => {
  lwwToken = (await apiLogin(USERS.lww)).token;
  omToken = (await apiLogin(USERS.om)).token;
  const goals = (await api<Goals>(omToken, 'GET', '/prod-goals')).body;
  initialUpcoming = new Set(goals.functions.flatMap((f) => f.upcoming.map((u) => u.id)));
  const ramping = (await api<Ramping>(lwwToken, 'GET', '/ramping')).body;
  rampWorker = ramping.workers.find((w) => !ramping.overrides.some((o) => o.workerZ === w.zNumber && o.functionCode === 'CF'))!;
  ({ app, window } = await launchApp());
  await signInAs(window, USERS.lww);
  await openScreen(window, /Prod Goal/);
});

test.afterAll(async () => {
  await api(lwwToken, 'PUT', '/daily-plan', { date: DATE, shiftCode: 'B1', targets: [{ functionCode: 'CA', targetVolume: null }] });
  const ramping = (await api<Ramping>(lwwToken, 'GET', '/ramping')).body;
  for (const o of ramping.overrides) if (o.workerZ === rampWorker.zNumber && o.functionCode === 'CF') await api(lwwToken, 'DELETE', `/ramping/${o.id}`);
  const goals = (await api<Goals>(omToken, 'GET', '/prod-goals')).body;
  for (const u of goals.functions.flatMap((f) => f.upcoming)) if (!initialUpcoming.has(u.id)) await api(omToken, 'DELETE', `/prod-goals/${u.id}`);
  await app.close();
});

test('an LWW can open the screen but not change prod goals', async () => {
  await expect(section('Prod Goals').getByRole('button', { name: 'Change' })).toHaveCount(0);
  await expect(section('Prod Goals')).toContainText('view only');
});

test('a Daily Plan target drives Needs: 18,000 CA cartons at the goal rate over a 10-hour shift', async () => {
  const rate = (await api<Goals>(lwwToken, 'GET', '/prod-goals')).body.functions.find((f) => f.functionCode === 'CA')!.current!.rate;
  const plan = section('Daily Plan');
  await plan.getByLabel('Plan date').fill(DATE);
  await expect(plan.getByRole('button', { name: 'Day (B1)' })).toHaveAttribute('aria-pressed', 'true');
  await plan.getByLabel('CA target').fill('18000');
  await expect(plan.locator('tbody tr').filter({ hasText: 'Carton Air' })).toContainText(`${Math.ceil(18000 / (rate * 10))} people`);
  await plan.getByRole('button', { name: 'Save targets' }).click();
  await expect(plan.getByRole('status')).toHaveText('Saved');
  await plan.getByLabel('CA target').fill('');
  await plan.getByRole('button', { name: 'Save targets' }).click();
  await expect(plan.getByLabel('CA target')).toHaveAttribute('placeholder', /simulated/);
});

test('an LWW adds and removes a ramping override; an overlap is refused', async () => {
  const ramp = section('Ramping');
  const label = `${rampWorker.lastName}, ${rampWorker.firstName} (${rampWorker.zNumber})`;
  await ramp.getByLabel('Ramping worker').fill(label);
  await ramp.getByLabel('Ramping function').selectOption('CF');
  await ramp.getByLabel('Ramping percent').fill('70');
  await ramp.getByRole('button', { name: 'Add' }).click();
  const row = ramp.locator('tbody tr').filter({ hasText: rampWorker.zNumber }).filter({ hasText: 'CF' });
  await expect(row).toBeVisible();

  await ramp.getByLabel('Ramping worker').fill(label);
  await ramp.getByLabel('Ramping function').selectOption('CF');
  await ramp.getByRole('button', { name: 'Add' }).click();
  await expect(ramp.getByRole('alert')).toContainText('already has a ramping override');

  await row.getByRole('button', { name: 'Remove' }).click();
  await expect(row).toHaveCount(0);
});

test('an OM schedules a future goal change and cancels it', async () => {
  await signInAs(window, USERS.om);
  await openScreen(window, /Prod Goal/);
  const goals = section('Prod Goals');
  const row = goals.locator('tbody tr').filter({ hasText: 'Carton Air' }).first();
  await row.getByRole('button', { name: 'Change' }).click();
  const future = new Date();
  future.setDate(future.getDate() + 30);
  const iso = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
  await goals.getByLabel('CA new rate').fill('199');
  await goals.getByLabel('CA effective date').fill(iso);
  await goals.getByRole('button', { name: 'Save' }).click();
  await expect(goals.getByText(`199 from ${iso}`)).toBeVisible();
  await goals.getByText(`199 from ${iso}`).locator('..').getByRole('button', { name: 'Cancel' }).click();
  await expect(goals.getByText(`199 from ${iso}`)).toHaveCount(0);
});
