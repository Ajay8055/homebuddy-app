import { test, expect } from '@playwright/test';

test('mobile menu opens and navigates without a blank screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /A calmer, more organised home/i })).toBeVisible();
  await page.getByRole('button', { name: /open menu/i }).click();
  await expect(page.getByRole('button', { name: /Family calendar/i }).last()).toBeVisible();
  await page.getByRole('button', { name: /Family calendar/i }).last().click();
  await expect(page.getByRole('heading', { name: 'Family calendar' })).toBeVisible();
});
