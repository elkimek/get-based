import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { seedNutritionDashboard } from '../helpers/nutrition-dashboard-fixture.js';
test.beforeEach(async ({ page, context }) => {
  await installDiscussionFixture(context); await context.addInitScript(seedNutritionDashboard);
  await page.goto('/app'); await expect(page.locator('html[data-app-ready]')).toBeAttached();
});
async function navigate(page: import('@playwright/test').Page, route: string) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true }); if (await menu.isVisible()) await menu.click();
  await page.locator(`.nav-item[data-category="${route}"]`).click();
  await expect(page.locator('[data-nutrition-dashboard-view="intake"]')).toBeVisible();
}
test('authored nutrition widgets preserve Dashboard and Nutrition actions and refreshed values', async ({ page }) => {
  for (const route of ['dashboard', 'nutrition']) {
    await navigate(page, route); const widget = page.locator('[data-nutrition-dashboard-view="intake"]');
    await expect(widget).toContainText('2 of 7 days'); await expect(widget).toContainText('38 g recorded · 128 guide');
    await expect(page.locator('[data-nutrition-dashboard-view="fuel"] .nutrition-fuel-meta')).toContainText('2 of 2 meals included');
    await expect(widget.locator('.nutrition-goal-row')).toHaveCount(4); await expect(widget.locator('.nutrition-day.is-logged')).toHaveCount(2);
    await widget.locator('[data-nutrition-action="open-targets"]').click();
    await expect(page.locator('[data-nutrition-entry-view="targets"]')).toBeVisible();
    await page.locator('#nutrition-target-energy').fill('2400'); await page.locator('[data-nutrition-action="save-targets"]').click();
    await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); await expect(widget.locator('.nutrition-target-ring-guide')).toHaveText('Target 2,400');
    await widget.locator('[data-nutrition-action="open-history"]').click(); await expect(page.locator('[data-nutrition-history-view]')).toBeVisible();
    await page.locator('#detail-modal .modal-close').click();
    await widget.locator('[data-nutrition-action="open-fluid-log"]').click(); await expect(page.locator('[data-nutrition-entry-view="fluid"]')).toBeVisible();
    await page.locator('#detail-modal .modal-close').click();
    await widget.locator('[data-nutrition-action="open"]').click(); await expect(page.locator('#nutrition-photo-input')).toBeAttached();
    await page.locator('#detail-modal .modal-close').click();
  }
});
test('authored nutrition dashboard widgets fit their containers across themes and pass accessibility', async ({ page }) => {
  test.setTimeout(120000); await navigate(page, 'nutrition');
  await page.evaluate(async () => { const link=document.createElement('link'); link.rel='stylesheet'; link.href='/themes-extra.css'; const ready=new Promise<void>((resolve,reject)=>{link.onload=()=>resolve();link.onerror=()=>reject(new Error('Themes unavailable'));});document.head.append(link);await ready; });
  for (const width of [320, 1100]) for (const theme of ['dark','light','cyberterm','glass','neuromancer','synth-sunrise']) {
    await page.setViewportSize({width,height:900}); await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
    for (const root of await page.locator('[data-nutrition-dashboard-view]').all()) {
      await root.evaluate(async element => { await Promise.all(element.getAnimations({subtree:true}).filter(animation=>animation.effect?.getComputedTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>undefined))); });
      const overflow=await root.evaluate(element=>({scroll:element.scrollWidth,client:element.clientWidth}));expect(overflow.scroll<=overflow.client+1,`${theme}/${width} widget overflow`).toBe(true);
      for(const action of await root.locator('button, summary').all()) {const box=await action.boundingBox();if(box){expect(box.height,`${theme}/${width} action height`).toBeGreaterThanOrEqual(44);expect(box.width).toBeGreaterThanOrEqual(44);}}
      expect(await root.evaluate(async element=>(await (window as unknown as {axe:typeof import('axe-core')}).axe.run(element,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(value=>({id:value.id,nodes:value.nodes.map(node=>({target:node.target,summary:node.failureSummary}))}))),`${theme}/${width} accessibility`).toEqual([]);
    }
  }
  // Widget width, rather than viewport width, controls its stacked layout.
  const widget=page.locator('[data-nutrition-dashboard-view="intake"]');await page.setViewportSize({width:1100,height:900});
  await widget.evaluate(element=>{element.style.width='280px';});
  expect(await widget.locator('.nutrition-dashboard-grid').evaluate(element=>getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length)).toBe(1);
  expect(await widget.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
});
