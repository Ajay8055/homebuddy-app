import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /A calmer, more organised home/i })).toBeVisible();
});

test('family dashboard shows daily priorities, smart reminders and upcoming events', async ({ page }) => {
  await expect(page.getByRole('heading', { name: "Today's priorities" })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Smart reminders' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Upcoming family events' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Shared spending this month' })).toBeVisible();
});

test('shared expense can be added and appears in household settlement', async ({ page }) => {
  await page.getByRole('button', { name: /Shared expenses/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Shared family expenses' })).toBeVisible();
  await page.getByRole('button', { name: /Add shared expense/i }).click();
  await expect(page.getByRole('heading', { name: 'Add a shared expense' })).toBeVisible();
  await page.getByPlaceholder(/Give it a name/i).fill('Automation shared groceries');
  await page.getByLabel('Amount (₹)').fill('1200');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Automation shared groceries')).toBeVisible();
  await expect(page.getByText('₹1,200')).toBeVisible();
  await expect(page.getByText(/Equal split/)).toBeVisible();
});

test('monthly report calculates household spending and activity', async ({ page }) => {
  await page.getByRole('button', { name: /Monthly report/i }).first().click();
  await expect(page.getByRole('heading', { name: /at home/i })).toBeVisible();
  await expect(page.getByText('Where shared money went')).toBeVisible();
  await expect(page.getByText(/Personal expenses are intentionally excluded/)).toBeVisible();
});

test('document vault explains secure upload requirements in demo mode', async ({ page }) => {
  await page.getByRole('button', { name: /Document vault/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Family document vault' })).toBeVisible();
  await expect(page.getByText(/Secure document uploads require a connected Supabase account/)).toBeVisible();
  await expect(page.getByLabel('Document category')).toBeVisible();
});

test('new feature navigation is available in the mobile drawer', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile viewport only');
  await page.getByRole('button', { name: /open menu/i }).click();
  await expect(page.getByRole('button', { name: /Shared expenses/i }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: /Document vault/i }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: /Monthly report/i }).last()).toBeVisible();
});
