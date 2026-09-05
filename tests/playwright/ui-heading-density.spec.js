import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`curated headings keep context and navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/app', { waitUntil: 'load' });
    await page.evaluate(async () => {
      await (await import('/js/export.js')).loadDemoData('female');
      window.endTour?.();
      for (const id of ['tour-overlay', 'tour-spotlight', 'tour-tooltip']) document.getElementById(id)?.remove();
      await (await import('/js/chat-panel.js')).closeChatPanel();
    });

    for (const route of ['body', 'insight', 'labs', 'genome']) {
      await page.evaluate(async route => (await import('/js/views.js')).navigate(route), route);
      await expect(page.locator('#main-content .lens-page-header h2')).toBeVisible();
      await expect(page.locator('#main-content .dashboard-widget-source')).toHaveCount(0);
      if (route !== 'genome') await expect(page.locator('.lens-page-header > p')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    }

    await page.evaluate(async () => (await import('/js/views.js')).navigate('insight'));
    const context = page.locator('[data-widget-id="profile-context"]');
    await expect(context.locator('.dashboard-widget-description, .context-section-title')).toHaveCount(0);
    await expect(context.getByRole('region', { name: 'Your health context' })).toBeVisible();
    await expect(context.locator('.context-section-subtitle')).toBeVisible();

    const standalone = await page.evaluate(async () => (await import('/js/context-cards.js')).renderProfileContextCards());
    expect(standalone).toContain('aria-labelledby=');
    expect(standalone).toContain('class="context-section-title"');
  });
}
