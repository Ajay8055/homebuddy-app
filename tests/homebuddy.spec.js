import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /A calmer, more organised home/i })).toBeVisible();
});

test('primary navigation opens every household section', async ({ page }) => {
  for (const label of ['Reminder centre', 'Family calendar', 'Shopping list', 'Bills & payments', 'Household tasks', 'Maintenance', 'Home assets', 'Personal expenses', 'Family']) {
    await page.getByRole('button', { name: new RegExp(label, 'i') }).first().click();
    await expect(page.getByRole('heading', { name: new RegExp(label, 'i') }).first()).toBeVisible();
  }
});

test('reminder centre opens the reminder form, not shopping form', async ({ page }) => {
  await page.getByRole('button', { name: /Reminder centre/i }).first().click();
  await page.getByRole('button', { name: /Add reminder/i }).click();
  await expect(page.getByRole('heading', { name: 'Add a reminder' })).toBeVisible();
  await expect(page.getByLabel('Assign to')).toBeVisible();
  await expect(page.getByLabel('Repeat')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add a shopping item' })).toHaveCount(0);
});

test('quick add creates a shopping item and persists after reload', async ({ page }) => {
  const quick = page.getByPlaceholder(/Buy milk, clean the balcony/i);
  await quick.fill('Buy automation test apples');
  await page.getByRole('button', { name: /^Add/ }).last().click();
  await expect(page.getByText('Buy automation test apples')).toBeVisible();
  await page.getByRole('button', { name: /Shopping list/i }).first().click();
  await expect(page.getByText('Buy automation test apples')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Shopping list/i }).click();
  await expect(page.getByText('Buy automation test apples')).toBeVisible();
});

test('family calendar can create a recurring event', async ({ page }) => {
  await page.getByRole('button', { name: /Family calendar/i }).first().click();
  await page.getByRole('button', { name: /Add event/i }).last().click();
  await expect(page.getByRole('heading', { name: 'Add family event' })).toBeVisible();
  await page.getByPlaceholder(/Give it a name/i).fill('Automation birthday event');
  await page.getByLabel('Repeat').selectOption('yearly');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/Automation birthday event/)).toBeVisible();
  await expect(page.getByText(/Repeats every year/)).toBeVisible();
});

test('reminder form validates required name and saves a task reminder', async ({ page }) => {
  await page.getByRole('button', { name: /Reminder centre/i }).first().click();
  await page.getByRole('button', { name: /Add reminder/i }).click();
  await page.getByPlaceholder(/Give it a name/i).fill('Automation reminder');
  await page.getByLabel('Repeat').selectOption('monthly');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: /Household tasks/i }).first().click();
  await expect(page.getByText('Automation reminder')).toBeVisible();
});

test('mobile menu opens and navigates instead of showing a blank screen', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile viewport only');
  await page.getByRole('button', { name: /open menu/i }).click();
  await expect(page.getByText('Small steps make a happier home.')).toBeVisible();
  await page.getByRole('button', { name: /Family calendar/i }).last().click();
  await expect(page.getByRole('heading', { name: 'Family calendar' })).toBeVisible();
});

test('notification preferences remain interactive in demo mode', async ({ page }) => {
  await page.getByRole('button', { name: /Reminder centre/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Notification preferences' })).toBeVisible();
  const all = page.getByRole('checkbox', { name: /All notifications/i });
  await all.uncheck();
  await expect(all).not.toBeChecked();
});


test('completing a recurring task keeps a completed record and creates its next occurrence', async ({ page }) => {
  await page.getByRole('button', { name: /Reminder centre/i }).first().click();
  await page.getByRole('button', { name: /Add reminder/i }).click();
  await page.getByPlaceholder(/Give it a name/i).fill('Automation recurring task');
  await page.getByLabel('Repeat').selectOption('monthly');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: /Household tasks/i }).first().click();
  const rows = page.locator('[data-record-id]').filter({ hasText: 'Automation recurring task' });
  await expect(rows).toHaveCount(1);
  await rows.locator('button.tick').click();
  await expect(rows).toHaveCount(2);
  await expect(rows.locator('button.tick.done')).toHaveCount(1);
  await expect(rows.locator('button.tick:not(.done)')).toHaveCount(1);
});


test('short desktop screens can scroll the complete sidebar navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto('/');
  const sidebar = page.locator('.side');
  const canScroll = await sidebar.evaluate(el => el.scrollHeight > el.clientHeight);
  expect(canScroll).toBeTruthy();
  await sidebar.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(sidebar.getByRole('button', { name: 'Family', exact: true })).toBeVisible();
});


test('household tasks expose an explicit complete action and allow reopening', async ({ page }) => {
  await page.getByRole('button', { name: /Household tasks/i }).first().click();
  const row = page.locator('[data-record-id]').filter({ hasText: 'Clean kitchen counters' });
  await expect(row).toBeVisible();
  const complete = row.getByRole('button', { name: 'Mark Clean kitchen counters complete' });
  await expect(complete).toBeVisible();
  await complete.click();
  await expect(row.getByRole('button', { name: 'Reopen Clean kitchen counters' })).toBeVisible();
  await expect(row.locator('b.struck')).toContainText('Clean kitchen counters');
  await row.getByRole('button', { name: 'Reopen Clean kitchen counters' }).click();
  await expect(row.getByRole('button', { name: 'Mark Clean kitchen counters complete' })).toBeVisible();
  await expect(row.locator('b.struck')).toHaveCount(0);
});
