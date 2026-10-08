import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { seedNutritionDashboard } from '../helpers/nutrition-dashboard-fixture.js';
import { captureOfflineLaunchDiagnostics } from '../helpers/offline-launch-diagnostics.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page, origin: string) {
  try { await page.goto(origin + '/app?dev-sw=1'); await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 }); }
  catch(error) { await captureOfflineLaunchDiagnostics(page, test.info()); throw error; }
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const request=indexedDB.open('labcharts-blobs',1),db=await new Promise<IDBDatabase>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    try { const tx=db.transaction('kv','readonly'),read=tx.objectStore('kv').get('labcharts-default-imported');
      return await new Promise<string>((resolve,reject)=>{tx.oncomplete=()=>typeof read.result==='string'?resolve(read.result):reject(new Error('Missing committed profile'));tx.onabort=()=>reject(tx.error||new Error('Read aborted'));tx.onerror=()=>reject(tx.error||read.error||new Error('Read failed'));});
    } finally {db.close();}
  });
}
async function verifyWidgets(page: Page, before: string) {
  for (const route of ['dashboard','body']) {
    const menu=page.getByRole('button',{name:'Menu',exact:true});if(await menu.isVisible())await menu.click();
    await page.locator(`.nav-item[data-category="${route}"]`).click();
    const widget=page.locator('[data-nutrition-dashboard-view="intake"]'),fuel=page.locator('[data-nutrition-dashboard-view="fuel"]');
    await expect(widget).toBeVisible();await expect(widget).toContainText('2 of 7 days');await expect(widget).toContainText('38 g recorded · 128 guide');
    await expect(widget.locator('.nutrition-target-ring strong')).toHaveText('640');await expect(widget.locator('.nutrition-day.is-logged')).toHaveCount(2);
    await expect(widget.locator('.nutrition-goal-row')).toHaveCount(4);await expect(widget).toContainText('312.8 mL recorded');
    await expect(fuel.locator('.nutrition-fuel-meta')).toContainText('Avg 450 kcal/meal from carbs + fat · 2 of 2 meals included');
    await widget.locator('[data-nutrition-action="open-targets"]').click();await expect(page.locator('#nutrition-target-protein-preview')).toContainText('128 g/day');
    await page.locator('#detail-modal .modal-close').click();await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
    await widget.locator('[data-nutrition-action="open-history"]').click();await expect(page.locator('[data-nutrition-history-view]')).toBeVisible();
    await page.locator('#detail-modal .modal-close').click();
    expect(await stored(page)).toBe(before);
  }
}
test('static authored nutrition dashboards work on first offline use and two cold launches without changing profile data',async({page,context})=>{
  test.setTimeout(120000);await installDiscussionFixture(context);await context.addInitScript(seedNutritionDashboard);
  const errors:string[]=[],csp:string[]=[];page.on('pageerror',error=>errors.push(error.message));context.on('page',target=>target.on('pageerror',error=>errors.push(error.message)));
  await context.exposeBinding('nutritionDashboardCsp',(_,directive:string)=>{csp.push(directive);});
  await context.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>{void(window as unknown as{nutritionDashboardCsp(value:string):Promise<void>}).nutritionDashboardCsp(event.violatedDirective);}));
  const server=await startKitServer(artifact);
  try {
    await ready(page,server.origin);const before=await stored(page);
    await expect(page.locator('link[href="/css/nutrition.css"]')).toHaveCount(0);server.state.offline=true;
    await verifyWidgets(page,before);await page.close();
    for(let launch=0;launch<2;launch++){const cold=await context.newPage();await ready(cold,server.origin);await verifyWidgets(cold,before);await cold.close();}
    expect(errors).toEqual([]);expect(csp).toEqual([]);
  } finally {await server.close();}
});
