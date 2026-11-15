import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

// Requires the local API with the synthetic seed (see docs/operations/housekeeping.md for the stack).
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100';
const propertyId = '10000000-0000-4000-8000-000000000002';
const seedRoomTypeId = '10000000-0000-4000-8000-000000000004';
const password = process.env.KEYORA_E2E_PASSWORD ?? 'Local-Test-Only!2026';

test.describe.configure({ timeout: 180_000 });

/** Stack navigators keep earlier screens mounted but hidden; assert only on what the user sees. */
const visibleText = (page: Page, text: string | RegExp, exact = false) => page.getByText(text, { exact }).filter({ visible: true }).first();

async function signIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await page.getByLabel('Work email').waitFor({ timeout: 120_000 });
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Property ID').fill(propertyId);
  await page.getByRole('button', { name: 'Open operations desk' }).click();
  await page.waitForURL(/dashboard/);
  return page;
}

/** A fresh sellable room with its own rate plan keeps the test independent of other runs. */
async function createSellableRoom(request: APIRequestContext) {
  const login = await request.post(`${apiUrl}/v1/auth/login`, { data: { email: 'owner@demo.keyora.test', password, propertyId, clientType: 'native', deviceName: 'Playwright fixture' } });
  expect(login.ok()).toBeTruthy();
  const headers = { authorization: `Bearer ${(await login.json()).accessToken}` };
  const name = `E2E Suite ${randomUUID().slice(0, 8)}`;
  const room = await request.post(`${apiUrl}/v1/properties/${propertyId}/rooms`, { headers: { ...headers, 'idempotency-key': randomUUID() }, data: { roomTypeId: seedRoomTypeId, name } });
  expect(room.status()).toBe(201);
  const plan = await request.post(`${apiUrl}/v1/properties/${propertyId}/rate-plans`, { headers: { ...headers, 'idempotency-key': randomUUID() }, data: { roomTypeId: seedRoomTypeId, name: `E2E Rate ${randomUUID().slice(0, 6)}`, amountMinor: 120000, currency: 'MAD', minStay: 1 } });
  expect(plan.status()).toBe(201);
  return { id: (await room.json()).id as string, name };
}

test('front desk books, checks in, and checks out; checkout queues a room turn', async ({ browser, request }) => {
  const room = await createSellableRoom(request);
  const page = await signIn(browser, 'frontdesk@demo.keyora.test');
  const guestName = `E2E Guest ${randomUUID().slice(0, 6)}`;

  await page.goto(`/room/${room.id}`);
  await expect(visibleText(page, room.name)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Create reservation' }).click();
  await page.waitForURL(/\/book\//);

  // Far-future dates avoid collisions with other runs on the shared local database.
  const year = 2030 + Math.floor(Math.random() * 20);
  await page.getByLabel('Check-in').fill(`${year}-03-10`);
  await page.getByLabel('Check-out').fill(`${year}-03-13`);
  await page.getByRole('button', { name: 'New guest' }).click();
  await page.getByLabel('Guest name').fill(guestName);
  await page.getByLabel('Email (optional)').fill(`${guestName.replace(/\s+/g, '.').toLowerCase()}@example.test`);
  await page.getByRole('button', { name: 'Get price' }).click();
  await expect(visibleText(page, 'SIGNED QUOTE · VALID 15 MIN')).toBeVisible();
  await expect(visibleText(page, '3 nights')).toBeVisible();

  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  await page.waitForURL(/\/reservation\//);
  await expect(visibleText(page, guestName)).toBeVisible();
  await expect(visibleText(page, 'confirmed', true)).toBeVisible();

  await page.getByRole('button', { name: 'Check guest in' }).click();
  await expect(visibleText(page, 'checked-in', true)).toBeVisible();
  await page.getByRole('button', { name: 'Check guest out' }).click();
  await expect(visibleText(page, 'checked-out', true)).toBeVisible();
  await expect(visibleText(page, 'Room turn sent to housekeeping.')).toBeVisible();

  await page.goto('/housekeeping');
  await expect(page.getByRole('button', { name: new RegExp(`^${room.name}, Ready to start`) })).toBeVisible({ timeout: 30_000 });

  await page.goto(`/room/${room.id}`);
  await expect(visibleText(page, 'cleaning', true)).toBeVisible({ timeout: 30_000 });
});

test('dashboard, rooms, guests, and maintenance render live data without demo content', async ({ browser }) => {
  const page = await signIn(browser, 'manager@demo.keyora.test');
  await expect(page.getByText('Operations at a glance')).toBeVisible({ timeout: 30_000 });
  for (const fabricated of ['42.8K', 'Guest score', 'Atlas Signature']) await expect(page.getByText(fabricated)).toHaveCount(0);

  await page.goto('/guests');
  await expect(page.getByText('ACTIVE PROFILES')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Contact details are masked for your role.')).toHaveCount(0);

  await page.goto('/maintenance');
  await expect(page.getByText('Maintenance blocks')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Air conditioning inspection')).toHaveCount(0);
});

test('housekeeping staff see masked guest contacts', async ({ browser }) => {
  const page = await signIn(browser, 'housekeeping@demo.keyora.test');
  await page.goto('/guests');
  await expect(page.getByText('ACTIVE PROFILES')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Contact details are masked for your role.')).toBeVisible();
});
