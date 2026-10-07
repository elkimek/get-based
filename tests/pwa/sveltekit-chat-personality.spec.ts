import path from 'node:path';
import {expect,test,type Page} from '@playwright/test';
import {startKitServer} from './kit-server.js';
const artifact=process.env.GETBASED_KIT_ARTIFACT||path.resolve('.local-notes/sveltekit-build');
async function ready(page:Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({timeout:30000});
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
}

async function openChat(page:Page){await page.getByRole('button',{name:'Start guided chat',exact:true}).click();await expect(page.locator('.chat-personality-current')).toBeVisible();}
async function editPersona(page:Page){await page.locator('.chat-personality-current').click();await page.locator('.chat-personality-edit').click();await expect(page.locator('#chat-personality-custom-name')).toHaveValue('Offline reviewer');}
test('static persona workflow retains instructions through offline cold launch and encrypted unlock',async({page,context})=>{
  test.setTimeout(150000);const errors:string[]=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>{
    if(!['http:','https:'].includes(location.protocol))return;
    for(const name of ['emptyTour','tour'])localStorage.setItem(`labcharts-default-${name}`,'completed');
    localStorage.setItem('labcharts-analytics-consent-seen','1');localStorage.setItem('labcharts-encryption-nudge-dismissed','true');
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-07T00:00:00Z',appVersion:'test',location:'local-test'}));
    localStorage.setItem('labcharts-ai-transparency-acknowledgement',JSON.stringify({version:'2026-08-31',acknowledged:true,acknowledgedAt:'2026-10-07T00:00:00Z'}));
    if(localStorage.getItem('picker-fixture-seeded'))return;
    localStorage.setItem('picker-fixture-seeded','1');localStorage.setItem('labcharts-ai-provider','openrouter');localStorage.setItem('labcharts-ai-paused','true');
    localStorage.setItem('labcharts-openrouter-model','openai/reasoner-1');
    localStorage.setItem('labcharts-openrouter-models',JSON.stringify(Array.from({length:12},(_,i)=>({id:`openai/reasoner-${i+1}`,name:`Reasoner ${i+1}`,reasoning:{supported_efforts:['low','medium','high']}}))));
    localStorage.setItem('labcharts-default-chat-threads',JSON.stringify([{id:'picker-thread',name:'Retained conversation',createdAt:'2026-10-07T00:00:00Z',updatedAt:'2026-10-07T00:00:00Z',messageCount:2,personality:'default'}]));
    localStorage.setItem('labcharts-default-chat-t_picker-thread',JSON.stringify([{role:'user',content:'Stored question'},{role:'assistant',content:'Stored answer'}]));
  });
  const server=await startKitServer(artifact);
  try {
    await page.goto(server.origin+'/app?dev-sw=1');await ready(page);await openChat(page);
    await page.locator('.chat-personality-current').click();await page.locator('.chat-personality-add-btn').click();
    await page.locator('#chat-personality-custom-name').fill('Offline reviewer');await page.locator('#chat-personality-custom-prompt').fill('Retain my carefully written persona instructions.');await page.locator('.chat-personality-custom-save').click();
    await expect(page.locator('#chat-personality-editor-overlay')).toHaveCount(0);
    server.state.offline=true;await page.close();const cold=await context.newPage();await cold.goto(server.origin+'/app?dev-sw=1');await ready(cold);await openChat(cold);await editPersona(cold);
    await expect(cold.locator('#chat-personality-custom-prompt')).toHaveValue('Retain my carefully written persona instructions.');await cold.locator('.chat-personality-custom-cancel').click();
    await cold.getByRole('button',{name:'Close chat',exact:true}).click();await cold.locator('[data-shell-action="open-settings"]').click();await cold.locator('#settings-nav-data').click();
    const security=cold.locator('#encryption-section');await security.getByRole('button',{name:'Enable Encryption',exact:true}).click();await cold.locator('#passphrase-set-input').fill('SyntheticPersona1!');await cold.locator('#passphrase-confirm-input').fill('SyntheticPersona1!');await cold.locator('#passphrase-set-btn').click();await expect(security).toContainText('Encryption is ON');
    expect(await cold.evaluate(()=>localStorage.getItem('labcharts-default-chatPersonalityCustom')?.startsWith('v1:'))).toBe(true);
    await cold.close();const encrypted=await context.newPage();await encrypted.goto(server.origin+'/app?dev-sw=1');await encrypted.locator('#passphrase-unlock-input').fill('SyntheticPersona1!');await encrypted.locator('#passphrase-unlock-input').press('Enter');await ready(encrypted);await openChat(encrypted);await editPersona(encrypted);
    await expect(encrypted.locator('#chat-personality-custom-prompt')).toHaveValue('Retain my carefully written persona instructions.');await encrypted.locator('#chat-personality-custom-prompt').fill('Edited during offline first use.');await encrypted.locator('.chat-personality-custom-save').click();await expect(encrypted.locator('#chat-personality-editor-overlay')).toHaveCount(0);await encrypted.locator('.chat-personality-edit').click();await expect(encrypted.locator('#chat-personality-custom-prompt')).toHaveValue('Edited during offline first use.');
    await encrypted.screenshot({path:test.info().outputPath('persona-static-encrypted-cold.png')});expect(errors).toEqual([]);
  }finally{await server.close();}
});
