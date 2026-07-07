import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1366, height: 1024 } });
const page = await context.newPage();
async function tapKeys(keys) { for (const ch of keys) await page.getByRole('button', { name: ch.toUpperCase(), exact: true }).click(); }
async function tapOK() { await page.getByRole('button', { name: 'OK', exact: true }).click(); }

await page.goto('http://localhost:5173/login');
await tapKeys('002p22'); await tapOK(); await tapKeys('1234');
await page.waitForURL('http://localhost:5173/');
await page.goto('http://localhost:5173/stage');
await page.waitForTimeout(500);

const count = await page.locator('span:text("Aisle")').count();
console.log('span:text("Aisle") count:', count);
const texts = await page.locator('span:text("Aisle")').allInnerTexts();
console.log('texts:', JSON.stringify(texts));

const first = page.locator('span:text("Aisle")').first();
const box = await first.boundingBox();
console.log('first bounding box:', box);
const sibCount = await first.locator('xpath=following-sibling::button').count();
console.log('following-sibling::button count from first match:', sibCount);
const parentHtml = await first.locator('xpath=..').innerHTML();
console.log('parent innerHTML:', parentHtml);

await browser.close();
