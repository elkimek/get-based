import {expect, type Page} from '@playwright/test';

/** Follow the visible UI after the empty desktop's deferred Chat onboarding settles. */
export async function openStaticSettings(page: Page): Promise<void> {
  await expect(page.locator('body')).not.toHaveClass(/\bchat-autostart-reserved\b/, {timeout: 30_000});
  const overlay = page.locator('#settings-modal-overlay');
  if (await overlay.isVisible()) return;
  const closeChat = page.getByRole('button', {name: 'Close chat', exact: true});
  if (await closeChat.isVisible()) {
    await closeChat.click();
    await expect(page.locator('body')).not.toHaveClass(/\bchat-open\b/);
  }
  await page.locator('[data-shell-action="open-settings"]:visible').first().click();
  await expect(overlay).toBeVisible();
}
