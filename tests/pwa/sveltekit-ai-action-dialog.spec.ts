import path from 'node:path';
import { expect, test, type Page, type BrowserContext } from '@playwright/test';
import { startKitServer } from './kit-server.js';
const artifact=process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function seed(context: BrowserContext, credits=false) {
  await context.addInitScript(credits=>{
    if(!['http:','https:'].includes(location.protocol))return;
    const original=window.fetch.bind(window),target=window as unknown as { aiDialogRequests:number;aiDialogCsp:string[] };
    target.aiDialogRequests=0;target.aiDialogCsp=[];document.addEventListener('securitypolicyviolation',event=>target.aiDialogCsp.push(event.violatedDirective));
    window.fetch=(input,options)=>{
      const url=new URL(input instanceof Request ? input.url : String(input),location.href);
      if(url.pathname === '/api/local-agents' || /^http:\/\/(?:127\.0\.0\.1|localhost):(?:83\d\d|11434|1234)/.test(url.origin))return Promise.resolve(Response.json({}, {status:404}));
      if(url.origin==='https://openrouter.ai') {
        if(url.pathname.endsWith('/chat/completions')) {
          const request=typeof options?.body === 'string' ? JSON.parse(options.body) as {stream?:boolean;messages?:Array<{role?:string;content?:unknown}>} : {};
          const explicit=request.messages?.some(message=>message.role==='user' && typeof message.content==='string' && message.content.includes('Synthetic acceptance message.'));
          if(explicit) { ++target.aiDialogRequests;return Promise.resolve(Response.json({error:{message:'Synthetic empty balance'}},{status:402})); }
          // Keep optional background insights from producing unrelated 402 UI.
          if(request.stream)return Promise.resolve(new Response('data: {"choices":[{"delta":{"content":"Synthetic background response"}}]}\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}}));
          return Promise.resolve(Response.json({choices:[{message:{content:'[]'}}],usage:{prompt_tokens:1,completion_tokens:1}}));
        }
        if(url.pathname.endsWith('/credits')) return Promise.resolve(Response.json({data:{total_credits:0,total_usage:0}}));
        if(url.pathname.endsWith('/models'))return Promise.resolve(Response.json({data:[{id:'synthetic-model',name:'Synthetic Model',context_length:8192,pricing:{prompt:'0.000001',completion:'0.000001'},architecture:{input_modalities:['text']}}]}));
        return Promise.resolve(Response.json({data:{limit:0,usage:0}}));
      }
      return original(input,options);
    };
    for(const name of ['emptyTour','tour'])localStorage.setItem(`labcharts-default-${name}`,'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed','true');localStorage.setItem('labcharts-analytics-consent-seen','1');
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-06T00:00:00Z',appVersion:'test',location:'local-test'}));
    localStorage.setItem('labcharts-ai-transparency-acknowledgement',JSON.stringify({version:'2026-08-31',acknowledged:true,acknowledgedAt:'2026-10-06T00:00:00Z'}));
    if(localStorage.getItem('static-ai-dialog-seeded'))return;
    localStorage.setItem('static-ai-dialog-seeded','1');localStorage.setItem('labcharts-ai-provider','openrouter');localStorage.setItem('labcharts-chat-backend','direct');localStorage.setItem('labcharts-ai-paused','false');
    localStorage.setItem('labcharts-profiles',JSON.stringify([{id:'default',name:'Synthetic notice profile',sex:'male',dob:'1990-01-01',createdAt:1}]));localStorage.setItem('labcharts-active-profile','default');
    localStorage.setItem('labcharts-default-imported',JSON.stringify({entries:[{date:'2026-01-01',markers:{'biochemistry.glucose':5},markerSources:{'biochemistry.glucose':{snapshotId:'health-report',file:'Retained health report.pdf'}}}],importSnapshots:[{id:'health-report',date:'2026-01-01',fileName:'Retained health report.pdf',type:'pdf',markerCount:1,markers:[{mappedKey:'biochemistry.glucose',value:5,unit:'mmol/l'}],importedAt:1767225600000}]}));
    if(credits) {
      localStorage.setItem('labcharts-cloud-ai-consent',JSON.stringify({version:'2026-08-31',approvals:{openrouter:{accepted:true,provider:'openrouter',recipient:'OpenRouter'}}}));
      localStorage.setItem('labcharts-openrouter-key','synthetic-nonfunctional-key');localStorage.setItem('labcharts-openrouter-model','synthetic-model');
      localStorage.setItem('labcharts-openrouter-models',JSON.stringify([{id:'synthetic-model',name:'Synthetic Model'}]));
    }
  },credits);
}
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({timeout:30000});await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
}
async function closeChat(page: Page) { const close=page.getByRole('button',{name:'Close chat',exact:true});if(await close.isVisible())await close.click(); }
async function importImage(page: Page) {
  await closeChat(page);await page.locator('[data-shell-action="trigger-import"]').focus();
  await page.locator('#pdf-input').setInputFiles({name:'Synthetic report.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp9kAAAAASUVORK5CYII=','base64')});
  await expect(page.locator('#ai-needed-overlay [data-ai-action-dialog-view]')).toBeVisible();
}
test('static import AI notice loads from cached assets and preserves records through cold launch',async({page,context})=>{
  test.setTimeout(120000);await seed(context);const server=await startKitServer(artifact),errors:string[]=[];context.on('page',target=>target.on('pageerror',error=>errors.push(error.message)));page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto(server.origin+'/app?dev-sw=1');await ready(page);server.state.offline=true;
    await importImage(page);await expect(page.locator('#ai-needed-overlay')).toContainText('Reading lab values from an image');await expect(page.locator('#ai-needed-or')).toBeFocused();
    await page.locator('#ai-needed-key').click();await expect(page.locator('#settings-modal-overlay')).toHaveClass(/show/);await expect(page.locator('#settings-nav-ai')).toHaveAttribute('aria-selected','true');await expect(page.locator('#ai-needed-overlay [data-ai-action-dialog-view]')).toHaveCount(0);
    await page.locator('#settings-modal [data-settings-action="close"]').click();await closeChat(page);await importImage(page);await page.keyboard.press('Escape');await expect(page.locator('[data-shell-action="trigger-import"]')).toBeFocused();
    await page.close();const cold=await context.newPage();await cold.goto(server.origin+'/app?dev-sw=1');await ready(cold);await importImage(cold);await expect(cold.locator('#ai-needed-or')).toBeFocused();await cold.screenshot({path:test.info().outputPath('ai-needed-static-cold.png')});await cold.locator('#ai-needed-cancel').click();
    await cold.locator('[data-shell-action="open-settings"]').click();await cold.locator('#settings-nav-data').click();await expect(cold.locator('#data-entries-section')).toContainText('Retained health report.pdf');await expect(cold.locator('#data-entries-section .imported-entry')).toHaveCount(1);
    expect(await cold.evaluate(()=>(window as unknown as {aiDialogCsp:string[]}).aiDialogCsp)).toEqual([]);expect(errors).toEqual([]);
  } finally {await server.close();}
});
test('static chat 402 opens the owned balance notice with cached assets and retains keyboard dismissal',async({page,context})=>{
  test.setTimeout(120000);await seed(context,true);const server=await startKitServer(artifact),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const send=async(target:Page)=>{
    const prior=await target.evaluate(()=>(window as unknown as {aiDialogRequests:number}).aiDialogRequests);
    const chat=target.locator('#chat-panel');if(!await chat.isVisible() || !await chat.getAttribute('class').then(value=>value?.includes('open')))await target.locator('#chat-fab').click();
    await expect(target.locator('.chat-input-area')).toBeVisible();
    await expect(target.locator('#chat-input')).toBeFocused();
    await target.locator('#chat-input').fill('Synthetic acceptance message.');await expect(target.locator('#chat-input')).toHaveValue('Synthetic acceptance message.');await expect(target.locator('#chat-send-btn')).toBeEnabled();await target.locator('#chat-send-btn').click();
    const consent=target.locator('#cloud-ai-consent-overlay.show');if(await consent.isVisible()) {await consent.locator('input[type="checkbox"]').check();await consent.locator('[data-ai-processing-action="approve"]').click();}
    await expect(target.locator('#or-no-balance-overlay [data-ai-action-dialog-view]')).toBeVisible();
    await expect.poll(()=>target.evaluate(()=>(window as unknown as {aiDialogRequests:number}).aiDialogRequests)).toBeGreaterThan(prior);await expect(target.locator('#or-add-credits')).toBeFocused();
  };
  try {
    await page.goto(server.origin+'/app?dev-sw=1');await ready(page);server.state.offline=true;await send(page);await page.keyboard.press('Escape');await expect(page.locator('#or-no-balance-overlay [data-ai-action-dialog-view]')).toHaveCount(0);
    await page.close();const cold=await context.newPage();cold.on('pageerror',error=>errors.push(error.message));await cold.goto(server.origin+'/app?dev-sw=1');await ready(cold);await send(cold);await cold.screenshot({path:test.info().outputPath('balance-static-cold.png')});await cold.locator('#or-nb-cancel').click();
    await expect(cold.locator('#or-no-balance-overlay [data-ai-action-dialog-view]')).toHaveCount(0);expect(await cold.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');expect(errors).toEqual([]);expect(await cold.evaluate(()=>(window as unknown as {aiDialogCsp:string[]}).aiDialogCsp)).toEqual([]);
  } finally {await server.close();}
});
