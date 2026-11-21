import { test, expect } from '@playwright/test';

test('mobile menu opens and navigates without a blank screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /A calmer, more organised home/i })).toBeVisible();
  await page.getByRole('button', { name: /open menu/i }).click();
  await expect(page.getByRole('button', { name: /Family calendar/i }).last()).toBeVisible();
  await page.getByRole('button', { name: /Family calendar/i }).last().click();
  await expect(page.getByRole('heading', { name: 'Family calendar' }).first()).toBeVisible();
});


test('short mobile screens can scroll the complete navigation drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto('/');
  await page.getByRole('button', { name: /open menu/i }).click();
  const drawer = page.locator('.side-drawer');
  await expect(drawer).toBeVisible();
  const canScroll = await drawer.evaluate(el => el.scrollHeight > el.clientHeight);
  expect(canScroll).toBeTruthy();
  await drawer.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(drawer.getByRole('button', { name: /Family/i }).last()).toBeVisible();
});

test('long forms remain scrollable and their save action is reachable on short screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 420 });
  await page.goto('/');
  await page.getByRole('button', { name: /open menu/i }).click();
  await page.getByRole('button', { name: /Household tasks/i }).last().click();
  await page.getByRole('button', { name: /Add new/i }).click();
  const modal = page.locator('.shade .modal');
  await expect(modal).toBeVisible();
  const canScroll = await modal.evaluate(el => el.scrollHeight > el.clientHeight);
  expect(canScroll).toBeTruthy();
  await modal.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(modal.getByRole('button', { name: 'Save' })).toBeVisible();
});
