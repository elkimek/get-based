import {expect,test,type Page} from '@playwright/test';
async function settings(page:Page){
 await page.addInitScript(()=>{
  localStorage.setItem('labcharts-analytics-consent-seen','1');
  for(const key of ['emptyTour','tour'])localStorage.setItem('labcharts-default-'+key,'completed');
  localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-05T00:00:00.000Z',appVersion:'cold-settings-test',location:'local-test'}));
 });
 await page.goto('/app',{waitUntil:'load'});
 await expect(page.locator('html[data-app-ready]')).toBeAttached();
 await page.locator('[data-shell-action="open-settings"]').click();
 await page.locator('#settings-nav-display').click();
 await expect(page.locator('#settings-tab-display')).toBeVisible();
}
test('fresh Settings keeps Wearables cold until selection then mounts its genuine panel',async({page})=>{
 const errors:string[]=[],requests:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/js/wearables.js*',route=>{requests.push(route.request().url());return route.continue();});
 await settings(page);expect(requests).toEqual([]);
 await page.locator('#settings-nav-wearables').click();
 await expect(page.locator('#settings-tab-wearables [data-wearables-view]')).toBeVisible();
 expect(requests).toHaveLength(1);expect(errors).toEqual([]);
});
test('a failed first Wearables module load is recoverable through the normal tab action',async({page})=>{
 const errors:string[]=[],requests:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/js/wearables.js*',route=>{requests.push(route.request().url());return requests.length===1?route.abort('failed'):route.continue();});
 await settings(page);await page.locator('#settings-nav-wearables').click();
 await expect(page.locator('#notification-container')).toContainText('Wearables could not be loaded. Try again.');
 await page.locator('#settings-nav-wearables').click();
 await expect(page.locator('#settings-tab-wearables [data-wearables-view]')).toBeVisible();
 expect(requests).toHaveLength(2);expect(new URL(requests[1]!).searchParams.get('lazy-retry')).toBe('1');expect(errors).toEqual([]);
});
for(const retirement of ['tab','modal'] as const)test('late Wearables completion respects retired '+retirement,async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));let release=()=>{};
 const held=new Promise<void>(resolve=>{release=resolve;});let requests=0;
 await page.route('**/js/wearables.js*',async route=>{requests++;await held;await route.continue();});
 await settings(page);await page.locator('#settings-nav-wearables').click();
 await expect.poll(()=>requests).toBe(1);
 if(retirement==='tab')await page.locator('#settings-nav-display').click();
 else await page.locator('#settings-modal').getByRole('button',{name:'Close',exact:true}).click();
 release();
 await page.evaluate(async()=>{const runtime=await import('/js/wearables-runtime.js');await runtime.loadWearablesModule();});
 await expect(page.locator('[data-wearables-view]')).toHaveCount(0);
 if(retirement==='modal'){
  const closeChat=page.locator('#chat-panel.open [data-chat-action="close-panel"]');if(await closeChat.isVisible())await closeChat.click();
  await page.locator('[data-shell-action="open-settings"]').click();
 }
 await page.locator('#settings-nav-wearables').click();
 await expect(page.locator('#settings-tab-wearables [data-wearables-view]')).toBeVisible();
 await expect(page.locator('[data-wearables-view]')).toHaveCount(1);expect(requests).toBe(1);expect(errors).toEqual([]);
});
