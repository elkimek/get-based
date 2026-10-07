import path from 'node:path';
import {expect,test,type Page} from '@playwright/test';
import {startKitServer} from './kit-server.js';
const artifact=process.env.GETBASED_KIT_ARTIFACT||path.resolve('.local-notes/sveltekit-build');
async function ready(page:Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({timeout:30000});
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
}
async function openChat(page:Page) {
  await page.getByRole('button',{name:'Start guided chat',exact:true}).click();
  await expect(page.locator('#chat-input')).toBeVisible();
}

test('Kit model picker keeps model and reasoning choices through unavailable-origin cold launch',async({page,context})=>{
  test.setTimeout(150000);
  const errors:string[]=[];
  context.on('page',target=>target.on('pageerror',error=>errors.push(error.message)));
  page.on('pageerror',error=>errors.push(error.message));
  await context.addInitScript(()=>{
    if(!['http:','https:'].includes(location.protocol))return;
    for(const name of ['emptyTour','tour'])localStorage.setItem(`labcharts-default-${name}`,'completed');
    localStorage.setItem('labcharts-analytics-consent-seen','1');localStorage.setItem('labcharts-encryption-nudge-dismissed','true');
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-07T00:00:00Z',appVersion:'test',location:'local-test'}));
    localStorage.setItem('labcharts-ai-transparency-acknowledgement',JSON.stringify({version:'2026-08-31',acknowledged:true,acknowledgedAt:'2026-10-07T00:00:00Z'}));
    if(localStorage.getItem('picker-fixture-seeded'))return;
    localStorage.setItem('picker-fixture-seeded','1');localStorage.setItem('labcharts-ai-provider','openrouter');localStorage.setItem('labcharts-ai-paused','false');
    localStorage.setItem('labcharts-openrouter-model','openai/reasoner-1');
    localStorage.setItem('labcharts-openrouter-models',JSON.stringify(Array.from({length:12},(_,i)=>({id:`openai/reasoner-${i+1}`,name:`Reasoner ${i+1}`,reasoning:{supported_efforts:['low','medium','high']}}))));
    localStorage.setItem('labcharts-default-chat-threads',JSON.stringify([{id:'picker-thread',name:'Retained conversation',createdAt:'2026-10-07T00:00:00Z',updatedAt:'2026-10-07T00:00:00Z',messageCount:2,personality:'default'}]));
    localStorage.setItem('labcharts-default-chat-t_picker-thread',JSON.stringify([{role:'user',content:'Stored question'},{role:'assistant',content:'Stored answer'}]));
  });
  const server=await startKitServer(artifact);
  try {
    await page.goto(server.origin+'/app?dev-sw=1');await ready(page);await openChat(page);
    await expect(page.locator('#kit-root [data-chat-model-picker-view]')).toHaveCount(1);
    await expect(page.locator('#chat-messages')).toContainText('Stored answer');
    await page.locator('#chat-model-menu-toggle').click();
    await page.locator('#chat-model-search').fill('Reasoner 2');
    await page.locator('[data-chat-model-value="openai/reasoner-2"]').click();
    await expect(page.locator('#chat-model-menu-label')).toHaveText('Reasoner 2');
    await page.locator('#chat-model-menu-toggle').click();
    await page.locator('#chat-model-effort').fill('3');
    await expect(page.locator('#chat-model-menu-label')).toHaveText('Reasoner 2 · High');
    await page.locator('#chat-model-search').press('Escape');
    await expect(page.locator('#chat-model-menu')).not.toHaveAttribute('open','');
    await expect(page.locator('#chat-input')).toBeVisible();
    server.state.offline=true;
    await page.close();const cold=await context.newPage();
    await cold.goto(server.origin+'/app?dev-sw=1');await ready(cold);await openChat(cold);
    await expect(cold.locator('#chat-model-menu-label')).toHaveText('Reasoner 2 · High');
    await expect(cold.locator('#chat-messages')).toContainText('Stored answer');
    await cold.locator('#chat-model-menu-toggle').click();
    await expect(cold.locator('#chat-model-effort')).toHaveValue('3');
    await cold.locator('#chat-model-search').fill('Reasoner 3');
    await expect(cold.locator('.chat-model-option:not([hidden])')).toHaveCount(1);
    await cold.locator('[data-chat-model-value="openai/reasoner-3"]').click();
    await expect(cold.locator('#chat-model-menu-label')).toHaveText('Reasoner 3');
    await expect.poll(()=>cold.evaluate(()=>localStorage.getItem('labcharts-openrouter-model'))).toBe('openai/reasoner-3');
    await cold.screenshot({path:test.info().outputPath('chat-model-picker-cold.png')});
    expect(errors).toEqual([]);
  }finally{await server.close();}
});
