import {expect,test} from './coverage-fixture.js';
for(const touch of [false,true])test(`Context uses native compact roles and coarse targets (touch=${touch})`,async({browser})=>{
 test.setTimeout(90000);const context=await browser.newContext({hasTouch:touch,viewport:{width:1280,height:900},serviceWorkers:'block'});
 try{
 const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{for(const key of ['emptyTour','tour'])localStorage.setItem(`labcharts-default-${key}`,'completed');localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-15T00:00:00Z'}));localStorage.setItem('labcharts-ai-paused','true');localStorage.setItem('labcharts-encryption-nudge-dismissed','true');});
 await page.goto('/app');await page.locator('html[data-app-ready]').waitFor({state:'attached'});await page.evaluate(async()=>{await(await import('/js/context-card-dashboard-ai.js')).openContextModal();});const hub=page.locator('[data-context-hub-view]');await expect(hub).toHaveAttribute('data-context-save-state','idle');
 for(const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']){
  await page.evaluate(async theme=>{const m=await import('/js/theme.js');await m.loadExtraThemesStylesheet();m.setTheme(theme);},theme);
  for(const width of [1280,390]){
   await page.setViewportSize({width,height:900});
   const title=hub.locator('#context-hub-title');await expect(title).toHaveCSS('font-size','22px');await expect(title).toHaveCSS('font-weight','700');
   const description=hub.locator('.context-source-desc').first();await expect(description).toHaveCSS('font-size','12px');await expect(description).toHaveCSS('line-height','16.2px');
   const slider=hub.locator('label[for="context-source-insight-cards"]');expect((await slider.boundingBox())!.height).toBe(touch?44:20);expect((await slider.boundingBox())!.width).toBe(touch?44:36);
   await expect(slider.locator('span')).toHaveCSS('height','20px');await expect(slider.locator('span')).toHaveCSS('width','36px');
   const select=hub.locator('#nutrition-context-days');await expect(select).toHaveCSS('font-size',width<=760?'16px':'11px');await expect(select).toHaveCSS('padding','5px 28px 5px 9px');expect((await select.boundingBox())!.height).toBe(touch||width<=760?44:34);
   const done=hub.locator('#context-hub-cancel');await expect(done).toHaveCSS('font-size','14px');await expect(done).toHaveCSS('font-weight','600');await expect(done).toHaveCSS('padding','8px 18px');expect((await done.boundingBox())!.height).toBeGreaterThanOrEqual(touch||width<=760?44:35);
   expect(await hub.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  }
 }
 const toggle=hub.locator('[data-context-toggle="insight-cards"]');const checked=await toggle.isChecked();await toggle.focus();await page.keyboard.press('Space');await expect(toggle).toBeChecked({checked:!checked});await expect(hub).toHaveAttribute('data-context-save-state','idle');await expect(toggle).toBeFocused();
 await hub.locator('#nutrition-context-days').selectOption('90');await expect(hub).toHaveAttribute('data-context-save-state','idle');await expect(hub.locator('#nutrition-context-days')).toHaveValue('90');
 await hub.locator('#context-hub-cancel').click();await expect(page.locator('#context-hub-overlay')).not.toHaveClass(/show/);expect(errors).toEqual([]);
 }finally{await context.close();}
});
