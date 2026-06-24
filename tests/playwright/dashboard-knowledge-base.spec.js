import { expect, test } from './coverage-fixture.js';

test('Context hub opens from Personalize AI alias and dismisses', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await expect(page.locator('#context-hub-overlay.show')).toHaveCount(0);

  await page.evaluate(async () => {
    const cards = await import('/js/context-cards.js');
    cards.openPersonalizeAIPicker();
  });

  const overlay = page.locator('#context-hub-overlay');
  await expect(overlay).toHaveClass(/show/);
  await expect(overlay.locator('.ai-picker-card')).toHaveCount(2);
  await expect(overlay).toContainText('Context');
  await expect(overlay).toContainText('Personalize how AI answers');
  await expect(overlay).toContainText('Knowledge Base');
  await expect(overlay).not.toContainText('DNA Data');
  await expect(overlay).not.toContainText('Protect your data');

  await expect(overlay.locator('#context-hub-cancel')).toBeVisible();
  await overlay.locator('#context-hub-cancel').click();
  await expect(overlay).not.toHaveClass(/show/);
});
