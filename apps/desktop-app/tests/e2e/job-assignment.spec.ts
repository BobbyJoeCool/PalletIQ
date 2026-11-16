import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { TOGGLE_MODIFIER, USERS, api, apiLogin, launchApp, nextWeekday, openScreen, signInAs } from './helpers';

// Job/Function Assignment (#145): bulk assign from the header, the conflict dialog, the
// split dialog, and the staffing forecast. Uses next Tuesday's B1 roster and clears the
// test workers' timelines afterwards.

type Worker = { zNumber: string; firstName: string; lastName: string; scheduled: { start: number; end: number } | null; segments: { functionCode: string; reasonCode: string | null }[] };
type Roster = { workers: Worker[]; plan: { functionCode: string; requiredHeadcount: number | null }[] };

const DATE = nextWeekday(2);
let app: ElectronApplication;
let window: Page;
let token: string;
let picked: Worker[] = [];

const roster = async () => (await api<Roster>(token, 'GET', `/roster?date=${DATE}&shift=B1`)).body;
const segmentsOf = async (z: string) => (await roster()).workers.find((w) => w.zNumber === z)!.segments;
const nameButton = (w: Worker) => window.getByRole('button', { name: new RegExp(`${w.lastName}, ${w.firstName}`) });
const functions = () => window.getByRole('group', { name: 'Job functions' });

test.beforeAll(async () => {
  token = (await apiLogin(USERS.lww)).token;
  picked = (await roster()).workers.filter((w) => w.scheduled && w.segments.length === 0).slice(0, 2);
  expect(picked).toHaveLength(2);
  ({ app, window } = await launchApp());
  await signInAs(window, USERS.lww);
  await openScreen(window, /Job\/Function Assignment/);
  await window.getByLabel('Date').fill(DATE);
  await expect(window.getByRole('button', { name: 'Day (B1)' })).toHaveAttribute('aria-pressed', 'true');
});

test.afterAll(async () => {
  if (picked.length) {
    await api(token, 'PUT', '/roster', { date: DATE, shiftCode: 'B1', timelines: picked.map((w) => ({ workerZ: w.zNumber, segments: [] })) });
  }
  await app.close();
});

test('the header forecasts how many people each function needs', async () => {
  const ca = (await roster()).plan.find((p) => p.functionCode === 'CA')!;
  await expect(functions().getByRole('button', { name: /^CA/ })).toContainText(`needs ${Math.ceil(ca.requiredHeadcount!)}`);
});

test('selected workers are bulk-assigned their unassigned time', async () => {
  await nameButton(picked[0]).click();
  await nameButton(picked[1]).click({ modifiers: [TOGGLE_MODIFIER] });
  await functions().getByRole('button', { name: /^CA/ }).click();
  await expect(window.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  for (const w of picked) expect((await segmentsOf(w.zNumber)).map((s) => s.functionCode)).toEqual(['CA']);
});

test('bulk assigning over existing time lists the conflict', async () => {
  await nameButton(picked[0]).click();
  await functions().getByRole('button', { name: /^RP/ }).click();
  const dialog = window.getByRole('dialog', { name: 'Assign Rack Puts' });
  await expect(dialog).toContainText('already has assigned time');
  await expect(dialog.getByLabel(`Override ${picked[0].lastName}, ${picked[0].firstName}`)).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect((await segmentsOf(picked[0].zNumber)).map((s) => s.functionCode)).toEqual(['CA']);
});

test('double-clicking a bar splits it; Downtime needs a reason', async () => {
  const name = `${picked[0].firstName} ${picked[0].lastName}`;
  await window.getByRole('button', { name: new RegExp(`^${name}: .*Carton Air`) }).dblclick();
  const dialog = window.getByRole('dialog', { name: new RegExp(`^Split ${name}`) });
  await dialog.getByLabel('Split time').fill('11:00');
  await dialog.getByLabel('After function').selectOption('DTM');
  await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  await dialog.getByLabel('After reason').selectOption('TRN');
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(dialog).toBeHidden();
  expect((await segmentsOf(picked[0].zNumber)).map((s) => `${s.functionCode}${s.reasonCode ? `:${s.reasonCode}` : ''}`)).toEqual(['CA', 'DTM:TRN']);
});

test('a team member cannot open the roster API', async () => {
  const res = await fetch(`${process.env.PALLETIQ_API_URL ?? 'http://localhost:7071'}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zNumber: USERS.worker.zNumber, pin: '1234' }),
  });
  const workerToken = ((await res.json()) as { token: string }).token;
  expect((await api(workerToken, 'GET', `/roster?date=${DATE}`)).status).toBe(403);
});
