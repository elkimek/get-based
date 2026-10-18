import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout:30000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function openChat(page: Page) {
  // Empty mobile dashboards intentionally hide the floating launcher and expose
  // the same Chat action in their welcome card.
  await page.getByRole('button',{name:'Start guided chat',exact:true}).click();
  await expect(page.locator('#chat-input')).toBeVisible();
}

test('shared Kit Chat shell retains composer identity, geometry and device-local drafts through offline cold launch', async ({ page, context }) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message));
  observe(page); context.on('page', observe);
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    for (const name of ['emptyTour','tour']) localStorage.setItem(`labcharts-default-${name}`, 'completed');
    localStorage.setItem('labcharts-analytics-consent-seen','1'); localStorage.setItem('labcharts-encryption-nudge-dismissed','true');
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-07T00:00:00Z',appVersion:'test',location:'local-test'}));
    localStorage.setItem('labcharts-ai-transparency-acknowledgement',JSON.stringify({version:'2026-08-31',acknowledged:true,acknowledgedAt:'2026-10-07T00:00:00Z'}));
    if (localStorage.getItem('shell-fixture-seeded')) return;
    localStorage.setItem('shell-fixture-seeded','1'); localStorage.setItem('labcharts-ai-provider','ollama'); localStorage.setItem('labcharts-ai-paused','false');
    localStorage.setItem('labcharts-default-chat-threads',JSON.stringify([{id:'shell-draft',name:'Retained draft',createdAt:'2026-10-07T00:00:00Z',updatedAt:'2026-10-07T00:00:00Z',messageCount:2,personality:'default'}]));
    localStorage.setItem('labcharts-default-chat-t_shell-draft',JSON.stringify([{role:'user',content:'Stored question'},{role:'assistant',content:'Stored answer'}]));
  });
  const server = await startKitServer(artifact);
  try {
    // Desktop returning-user startup deliberately opens guided Chat. Exercise
    // first offline construction from the genuine compact welcome instead.
    const requestedViewport = page.viewportSize();
    if (requestedViewport && requestedViewport.width > 768) await page.setViewportSize({ width: 700, height: requestedViewport.height });
    await page.goto(server.origin+'/app?dev-sw=1'); await ready(page);
    await expect(page.locator('#kit-root #chat-shell')).toHaveCount(1);
    await expect(page.locator('#chat-shell-host')).toHaveCount(0);
    await expect(page.locator('#chat-panel')).toHaveCount(1);
    expect(await page.locator('link[data-chat-presentation-stylesheet]').count()).toBe(0);
    await openChat(page); await expect(page.locator('#chat-messages')).toContainText('Stored answer');
    if (requestedViewport) await page.setViewportSize(requestedViewport);
    const input = page.locator('#chat-input');
    await input.fill('Private composer draft retained offline. '.repeat(20));
    await expect(page.locator('#chat-send-btn')).toBeEnabled();
    for (const width of [1280,700,390,320]) {
      await page.setViewportSize({width,height:900});
      const geometry = await input.evaluate(element => {
        const textarea = element as HTMLTextAreaElement;
        const area = textarea.closest<HTMLElement>('.chat-input-area')!;
        return {overflow:area.scrollWidth-area.clientWidth,font:getComputedStyle(textarea).fontSize,height:textarea.getBoundingClientRect().height,max:Number.parseFloat(getComputedStyle(textarea).getPropertyValue('--chat-input-max-height'))};
      });
      await expect.poll(()=>page.locator('[data-chat-composer-view]').evaluate(element=>{
        const area=element.getBoundingClientRect();
        return [...element.querySelectorAll<HTMLElement>('.chat-composer-toolbar > div > button,.chat-composer-toolbar > div > details > summary')]
          .filter(control=>control.getClientRects().length>0)
          .filter(control=>{const box=control.getBoundingClientRect();return box.left<area.left||box.right>area.right;})
          .map(control=>control.id);
      }),{message:`${width}: visible composer controls fit`}).toEqual([]);
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      expect(geometry.height).toBeLessThanOrEqual(geometry.max);
      if (width <= 768) expect(geometry.font).toBe('16px');
    }
    const retained = await input.inputValue();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('labcharts-default-chatDraft_shell-draft'))).toBe(retained);
    const original = await input.elementHandle();
    await page.getByRole('button',{name:'Close chat',exact:true}).click();
    await openChat(page); await expect(input).toHaveValue(retained);
    expect(await original!.evaluate(element => element === document.getElementById('chat-input'))).toBe(true);
    await expect(page.locator('#chat-messages')).toContainText('Stored answer');
    await page.screenshot({path:test.info().outputPath('chat-shell-mobile-draft.png')});
    server.state.offline = true;
    await page.close(); const cold = await context.newPage();
    await cold.goto(server.origin+'/app?dev-sw=1'); await ready(cold);
    await openChat(cold); await expect(cold.locator('#chat-input')).toHaveValue(retained);
    await expect(cold.locator('#chat-messages')).toContainText('Stored answer');
    await expect(cold.locator('#chat-send-btn')).toBeEnabled();
    expect(errors).toEqual([]);
  } finally { await server.close(); }
});
