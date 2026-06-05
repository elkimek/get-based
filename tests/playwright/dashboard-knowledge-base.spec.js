import { expect, test } from '@playwright/test';

test('personalize AI picker opens and dismisses', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await expect(page.locator('#ai-personalize-picker-overlay.show')).toHaveCount(0);

  await page.evaluate(async () => {
    const cards = await import('/js/context-cards.js');
    cards.openPersonalizeAIPicker();
  });

  const overlay = page.locator('#ai-personalize-picker-overlay');
  await expect(overlay).toHaveClass(/show/);
  await expect(overlay.locator('.ai-picker-card')).toHaveCount(2);
  await expect(overlay).toContainText('Interpretive Lens');
  await expect(overlay).toContainText('Knowledge Base');
  await expect(overlay).not.toContainText('DNA Data');

  await expect(overlay.locator('#ai-personalize-picker-cancel')).toBeVisible();
  await overlay.locator('#ai-personalize-picker-cancel').click();
  await expect(overlay).not.toHaveClass(/show/);
});
