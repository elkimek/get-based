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

/** Observe the requested public Tweaks theme after its stylesheet and fonts settle. */
export async function awaitStaticThemeReady(page: Page, theme: string): Promise<void> {
  await expect.poll(() => page.evaluate(async requested => {
    const extra = ['cyberterm', 'glass', 'synth-sunrise', 'neuromancer'].includes(requested);
    const link = document.querySelector<HTMLLinkElement>('link[data-extra-themes-stylesheet]');
    const stylesheetReady = !extra || !!(link && new URL(link.href).origin === location.origin
      && new URL(link.href).pathname === '/themes-extra.css' && !link.disabled && link.sheet && !link.sheet.disabled);
    if (stylesheetReady) { document.body.getBoundingClientRect(); await document.fonts.ready; }
    return {stylesheetReady, stored: localStorage.getItem('labcharts-theme'), attribute: document.documentElement.getAttribute('data-theme')};
  }, theme), {message: `${theme}: actual theme stylesheet, storage and fonts ready`}).toEqual({
    stylesheetReady: true, stored: theme, attribute: theme === 'dark' ? null : theme,
  });
}
