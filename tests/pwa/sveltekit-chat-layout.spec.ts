import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
const artifact=process.env.GETBASED_KIT_ARTIFACT||path.resolve('.local-notes/sveltekit-build');
async function open(page: Page, origin: string) {
  await page.goto(origin+'/app?dev-sw=1');
  await expect(page.locator('html[data-app-ready]')).toBeAttached({timeout:30000});
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  await page.getByRole('button',{name:'Start guided chat',exact:true}).click();
  await expect(page.locator('#chat-panel')).toHaveClass(/open/);
}
test('static Chat owns persisted splitter geometry through an unavailable-origin cold launch',async({page,context})=>{
  test.setTimeout(90000);
  const mobile=page.viewportSize()!.width<769;
  const errors:string[]=[];context.on('page',target=>target.on('pageerror',error=>errors.push(error.message)));page.on('pageerror',error=>errors.push(error.message));
  await context.addInitScript(mobile=>{
    if(!['http:','https:'].includes(location.protocol)) return;
    for(const key of ['emptyTour','tour']) localStorage.setItem(`labcharts-default-${key}`,'completed');
    localStorage.setItem('labcharts-analytics-consent-seen','1');localStorage.setItem('labcharts-encryption-nudge-dismissed','true');
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-07T00:00:00Z',appVersion:'test',location:'local-test'}));
    localStorage.setItem('labcharts-ai-provider','ollama');localStorage.setItem('labcharts-ai-paused','false');
    if(localStorage.getItem('layout-fixture-seeded'))return;localStorage.setItem('layout-fixture-seeded','1');
    localStorage.setItem('labcharts-chat-panel-width','710');localStorage.setItem('labcharts-chat-panel-with-rail-width','900');localStorage.setItem('labcharts-chat-rail-width','240');
    localStorage.setItem('labcharts-default-chatRailOpen',mobile?'false':'true');
  },mobile);
  const server=await startKitServer(artifact);
  try{
    await open(page,server.origin);
    const panel=page.locator('#chat-panel');const panelHandle=page.locator('#chat-panel-resize-handle');const railHandle=page.locator('#chat-rail-resize-handle');
    if(mobile){
      await expect(panelHandle).toBeHidden();await expect(railHandle).toBeHidden();await expect(panel).toHaveCSS('width',`${page.viewportSize()!.width}px`);
    }else{
      await expect(panel).toHaveCSS('width','900px');await expect(railHandle).toHaveAttribute('aria-valuenow','240');
      await page.getByRole('button',{name:'Toggle conversations',exact:true}).click();await expect(panel).toHaveCSS('width','710px');await expect(railHandle).toBeHidden();
      await panelHandle.focus();await page.keyboard.press('ArrowLeft');await expect(panel).toHaveCSS('width','726px');
      await page.getByRole('button',{name:'Toggle conversations',exact:true}).click();await expect(panel).toHaveCSS('width','900px');
      await railHandle.focus();await page.keyboard.press('ArrowRight');await expect(railHandle).toHaveAttribute('aria-valuenow','256');
      await panelHandle.focus();await page.keyboard.press('ArrowLeft');await expect(panel).toHaveCSS('width','916px');
      await expect(page.locator('#main-content')).toHaveCSS('padding-right','948px');
    }
    await page.screenshot({path:test.info().outputPath('chat-layout-static.png')});
    server.state.offline=true;await page.close();const cold=await context.newPage();await open(cold,server.origin);
    await expect(cold.locator('#kit-root #chat-shell')).toHaveCount(1);
    if(mobile){await expect(cold.locator('#chat-panel-resize-handle')).toBeHidden();await expect(cold.locator('#chat-panel')).toHaveCSS('width',`${cold.viewportSize()!.width}px`);}
    else{await expect(cold.locator('#chat-panel')).toHaveCSS('width','916px');await expect(cold.locator('#chat-rail-resize-handle')).toHaveAttribute('aria-valuenow','256');}
    expect(await cold.evaluate(()=>['labcharts-chat-panel-width','labcharts-chat-panel-with-rail-width','labcharts-chat-rail-width'].map(key=>localStorage.getItem(key)))).toEqual(mobile?['710','900','240']:['726','916','256']);
    expect(errors).toEqual([]);
  }finally{await server.close();}
});
