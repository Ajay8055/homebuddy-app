import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /A calmer, more organised home/i })).toBeVisible();
});

test('HomeBuddy AI page explains supported chat languages and actions', async ({ page }) => {
  await page.getByRole('button', { name: /HomeBuddy AI/i }).first().click();
  await expect(page.getByRole('heading', { name: 'HomeBuddy AI' })).toBeVisible();
  await expect(page.getByText(/English · हिन्दी · Hinglish/i)).toBeVisible();
  await expect(page.getByPlaceholder(/Kal 9 baje gas booking/i)).toBeVisible();
});

test('assistant offers Hindi and English voice input controls', async ({ page }) => {
  await page.getByRole('button', { name: /HomeBuddy AI/i }).first().click();
  await expect(page.getByRole('button', { name: /Speak/i })).toBeVisible();
  await expect(page.getByLabel('Voice language')).toHaveValue('hi-IN');
  await page.getByLabel('Voice language').selectOption('en-IN');
  await expect(page.getByLabel('Voice language')).toHaveValue('en-IN');
});

test('assistant chat exposes Document Vault attachment and naming controls', async ({ page }) => {
  await page.getByRole('button', { name: /HomeBuddy AI/i }).first().click();
  await page.locator('.ai-doc-pick input[type="file"]').setInputFiles({
    name: 'warranty.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('test document')
  });
  await expect(page.getByLabel('Uploaded document name')).toHaveValue('warranty');
  await expect(page.getByLabel('Uploaded document category')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload to Vault' })).toBeVisible();
});
