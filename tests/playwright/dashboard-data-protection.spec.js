import { expect, test } from '@playwright/test';

test('data protection picker opens and dismisses', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    const cards = await import('/js/context-cards.js');
    cards.openDataProtectionPicker();
  });

  const overlay = page.locator('#data-protection-picker-overlay');
  await expect(overlay).toHaveClass(/show/);
  await expect(overlay.locator('.dashboard-picker-card')).toHaveCount(3);
  await expect(overlay.locator('#data-protection-picker-cancel')).toBeVisible();

  await overlay.locator('#data-protection-picker-cancel').click();
  await expect(overlay).not.toHaveClass(/show/);
});
