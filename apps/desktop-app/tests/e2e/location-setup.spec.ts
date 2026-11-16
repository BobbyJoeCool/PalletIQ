import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { USERS, api, apiLogin, launchApp, openScreen, signInAs } from './helpers';

// Location Setup (#143): zone cell editing, Not For Storage carve-outs (LWW sets, OM
// restores), contraction, and New / Delete Aisle (OM). Works on aisle 318 and puts back
// everything it changes; creates and deletes test aisle 998.

type Cell = { zone: number; side: 'ODD' | 'EVEN'; level: number; storageCode: string; size: string; locations: number; occupied: number; notForStorage: number; contracted: number };
type View = { cells: Cell[]; carveOuts: { location: string }[] };

const AISLE = 318;
const TEST_AISLE = 998;
let app: ElectronApplication;
let window: Page;
let omToken: string;
let initialCarveOuts: Set<string>;
let initialView: View;

const sideLabel = (s: Cell['side']) => (s === 'ODD' ? 'Odd' : 'Even');
const cellButton = (c: Cell) => window.getByRole('button', { name: `Zone ${c.zone} ${sideLabel(c.side)} level ${c.level}: ${c.storageCode} ${c.size}` });
const loadView = async () => (await api<View>(omToken, 'GET', `/aisles/${AISLE}`)).body;

async function openAisle(aisle: number) {
  await openScreen(window, /Location Setup/);
  await window.getByLabel('Aisle', { exact: true }).selectOption(String(aisle));
  await expect(window.getByText(`Aisle ${aisle} · bins`)).toBeVisible();
}

test.beforeAll(async () => {
  omToken = (await apiLogin(USERS.om)).token;
  initialView = await loadView();
  initialCarveOuts = new Set(initialView.carveOuts.map((c) => c.location));
  // A previous failed run may have left the test aisle live.
  await api(omToken, 'DELETE', `/aisles/${TEST_AISLE}`);
  ({ app, window } = await launchApp());
  await signInAs(window, USERS.lww);
});

test.afterAll(async () => {
  // Put back anything this spec changed on aisle 318.
  const view = await loadView();
  for (const c of view.carveOuts) {
    if (!initialCarveOuts.has(c.location)) await api(omToken, 'DELETE', `/locations/${c.location}/not-for-storage`);
  }
  for (const before of initialView.cells) {
    const now = view.cells.find((c) => c.zone === before.zone && c.side === before.side && c.level === before.level);
    if (now && before.contracted === 0 && now.contracted > 0) {
      await api(omToken, 'PATCH', `/aisles/${AISLE}/contraction`, { cells: [{ zone: before.zone, side: before.side, level: before.level }], contracted: false });
    }
  }
  await api(omToken, 'DELETE', `/aisles/${TEST_AISLE}`);
  await app.close();
});

test('the aisle grid shows one cell per zone cell', async () => {
  await openAisle(AISLE);
  await expect(window.locator('table button[aria-pressed]')).toHaveCount(initialView.cells.length);
});

test('an LWW carves a location out to Not For Storage but cannot restore it', async () => {
  // A zone cell with at least one empty location (few cells on a stocked aisle are wholly empty).
  const cell = initialView.cells.find((c) => c.occupied < c.locations && c.notForStorage === 0)!;
  await cellButton(cell).click();
  const list = window.getByRole('region', { name: 'Locations in cell' });
  await list.getByRole('button', { name: 'Not For Storage…' }).and(window.locator(':enabled')).first().click();
  const dialog = window.getByRole('dialog', { name: 'Mark Not For Storage' });
  await dialog.getByLabel('Cage Cart Storage').check();
  await dialog.getByRole('button', { name: 'Mark Not For Storage' }).click();
  await expect(dialog).toBeHidden();

  const added = (await loadView()).carveOuts.filter((c) => !initialCarveOuts.has(c.location));
  expect(added).toHaveLength(1);
  await expect(window.getByRole('region', { name: 'Not For Storage locations' })).toContainText('Cage Cart Storage');
  await expect(list.getByRole('button', { name: 'Restore' })).toBeDisabled();
});

test('an OM restores the carved-out location', async () => {
  await signInAs(window, USERS.om);
  await openAisle(AISLE);
  const carveList = window.getByRole('region', { name: 'Not For Storage locations' });
  const added = (await loadView()).carveOuts.find((c) => !initialCarveOuts.has(c.location))!;
  const display = `${added.location.slice(0, 3)}-${added.location.slice(3, 6)}-${added.location.slice(6)}`;
  await carveList.getByRole('listitem').filter({ hasText: display }).getByRole('button', { name: 'Restore' }).click();
  await expect(carveList.getByText(display)).toHaveCount(0);
  expect((await loadView()).carveOuts.some((c) => c.location === added.location)).toBe(false);
});

test('changing a zone cell that holds freight asks for confirmation first', async () => {
  const cell = initialView.cells.find((c) => c.occupied > 0)!;
  await cellButton(cell).click();
  const panel = window.getByRole('region', { name: 'Zone settings' });
  await panel.getByLabel('Size').selectOption(cell.size);
  await panel.getByRole('button', { name: 'Apply' }).click();
  const dialog = window.getByRole('dialog', { name: 'Locations hold freight' });
  await expect(dialog).toContainText('hold freight or are reserved');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});

test('contraction: the floor preset selects level 1 everywhere; a cell contracts and opens', async () => {
  await window.getByRole('tab', { name: 'Contraction' }).click();
  const panel = window.getByRole('region', { name: 'Contraction' });
  await panel.getByRole('button', { name: 'All floor locations' }).click();
  const floorCells = initialView.cells.filter((c) => c.level === 1).length;
  await expect(panel.getByText(`${floorCells} zone cells selected.`)).toBeVisible();

  const open = initialView.cells.find((c) => c.contracted === 0)!;
  const key = (c: Cell) => c.zone === open.zone && c.side === open.side && c.level === open.level;
  await cellButton(open).click();
  await panel.getByRole('button', { name: 'Contract' }).click();
  await expect.poll(async () => { const c = (await loadView()).cells.find(key)!; return c.contracted === c.locations; }).toBe(true);
  await panel.getByRole('button', { name: 'Open' }).click();
  await expect.poll(async () => (await loadView()).cells.find(key)!.contracted).toBe(0);
});

test('an OM creates a new aisle from the form and deletes it', async () => {
  await window.getByRole('tab', { name: 'Zone Setup' }).click();
  await window.getByRole('button', { name: 'New aisle' }).click();
  await window.getByLabel('Aisle number').fill(String(TEST_AISLE));
  await window.getByLabel('First bin', { exact: true }).fill('1');
  await window.getByLabel('Last bin', { exact: true }).fill('16');
  await expect(window.getByRole('heading', { name: 'Preview — 16 locations' })).toBeVisible();
  await window.getByRole('button', { name: 'Create aisle' }).click();
  await expect(window.getByText(`Aisle ${TEST_AISLE} · bins 1–16`)).toBeVisible();

  await window.getByRole('button', { name: 'Delete aisle' }).click();
  const dialog = window.getByRole('dialog', { name: `Delete aisle ${TEST_AISLE}?` });
  await dialog.getByRole('button', { name: 'Delete aisle' }).click();
  await expect(window.getByText('Choose an aisle to edit.')).toBeVisible();
  expect((await api(omToken, 'GET', `/aisles/${TEST_AISLE}`)).status).toBe(404);
});

test('an LWW does not get New aisle or Delete aisle', async () => {
  await signInAs(window, USERS.lww);
  await openAisle(AISLE);
  await expect(window.getByRole('button', { name: 'New aisle' })).toHaveCount(0);
  await expect(window.getByRole('button', { name: 'Delete aisle' })).toHaveCount(0);
});
