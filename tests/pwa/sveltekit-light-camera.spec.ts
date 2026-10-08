import path from 'node:path';
import fs from 'node:fs/promises';
import {expect,test,type Page} from '@playwright/test';
import {createDefaultProfileData} from '../../js/profile.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {readComparisonAcceptanceProfile} from '../helpers/nutrition-comparison-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readyLightArtifact as ready,openLightArtifact as openLight} from '../helpers/light-artifact-navigation.js';
import {seedDeniedLightToolProfile} from '../helpers/light-tool-artifact-fixture.js';
async function inspect(page:Page){
 await openLight(page);
 const widget=page.locator('[data-widget-id="light-tools"]');
 const expand=widget.locator('[data-light-page-action="expand-light-tools"]');if(await expand.count())await expand.click();
 const launcher=widget.locator('[data-light-tool-view].light-tools-section');await expect(launcher).toBeVisible();
 for(const details of await launcher.locator('details').all())if(await details.getAttribute('open')===null)await details.locator('summary').click();
 for(const [tool,name] of [['lux','Lux meter'],['flicker','Flicker detector'],['cct','Color temperature meter'],['spectrum','Spectrum classifier'],['glass','Glass transmission test'],['darkness','Sleep darkness meter']] as const){
  await launcher.locator(`[data-light-tool-id="${tool}"]`).click();
  const modal=page.getByRole('dialog',{name:name!,exact:true});await expect(modal).toHaveAttribute('data-light-tool-view','');
  if(tool==='lux' && await page.evaluate(()=>localStorage.getItem('labcharts-aim-guide-lux')==='dismissed'))await expect(modal.locator('.tool-aiming-guide')).toHaveCount(0);
  else{
   await expect(modal.locator('.tool-aiming-guide')).toBeVisible();
   if(tool==='lux'){await modal.getByRole('button',{name:'Dismiss aiming guide',exact:true}).click();await expect(modal.locator('.tool-aiming-guide')).toBeHidden();}
  }
  if(tool==='lux'){
   await expect(modal.locator('#lux-source-line')).toContainText('Camera unavailable.');
   await expect(modal.locator('#lux-source-camera')).toBeDisabled();await expect(modal.locator('#lux-manual-entry')).toBeVisible();
   const input=modal.getByRole('spinbutton',{name:'Enter a reading from a lux meter',exact:true});await expect(input).toHaveAttribute('min','0');await expect(input).toHaveAttribute('max','200000');await input.fill('400');
  }else if(tool==='flicker')await expect(modal.locator('#flicker-result')).toContainText('Camera access denied — banding screen unavailable.');
  else if(tool==='cct')await expect(modal.locator('#cct-value')).toHaveText('Camera denied');
  else if(tool==='spectrum'){
   await expect(modal.locator('#spec-video')).toBeHidden();const choices=modal.locator('[data-spec-manual]');await expect(choices).toHaveCount(5);
   const warm=modal.getByRole('button',{name:'Warm LED',exact:true});await warm.focus();await page.keyboard.press('Enter');await expect(warm).toHaveClass(/\bselected\b/);
  }else if(tool==='glass'){
   await modal.getByRole('button',{name:'Measure inside',exact:true}).click();await expect(modal.locator('#glass-reading-inside')).toHaveText('denied');
   await modal.getByRole('button',{name:'Measure outside',exact:true}).click();await expect(modal.locator('#glass-reading-outside')).toHaveText('denied');await expect(modal.locator('#glass-save')).toBeDisabled();
  }else{
   await modal.getByRole('button',{name:'Start 30-second read',exact:true}).click();await expect(modal.locator('#dark-status')).toContainText('Camera access denied — the qualitative camera check is unavailable.');
   await expect(modal.locator('#dark-save')).toBeDisabled();const details=modal.locator('details');await details.locator('summary').click();await expect(modal.locator('#dark-meter-input')).toBeVisible();
  }
  await modal.getByRole('button',{name:'Close',exact:true}).click();await expect(modal).toHaveCount(0);
 }
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {lightToolCameraRequests:number}).lightToolCameraRequests)).toBe(7);
 expect(await page.evaluate(()=>localStorage.getItem('labcharts-aim-guide-lux'))).toBe('dismissed');
}
test('static camera tools retain denial fallbacks, manual choices and per-tool dismissal over offline cold launches',async({page,context})=>{
 test.setTimeout(120000);await installDiscussionFixture(context);await installOfflineStartupDiagnostics(context);
 await context.addInitScript(seedDeniedLightToolProfile,{defaults:createDefaultProfileData(),now:Date.now()});
 const errors:string[]=[],csp:string[]=[];const observe=(page:Page)=>page.on('pageerror',error=>errors.push(error.message));observe(page);context.on('page',observe);
 await context.exposeBinding('cameraToolCsp',(_,value:string)=>csp.push(value));
 await context.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>{void(window as unknown as {cameraToolCsp(value:string):Promise<void>}).cameraToolCsp(event.violatedDirective);}));
 const server=await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
 try{
  const loading=[{phase:'initial-online',readyMs:await ready(page,server.origin)}],before=await page.evaluate(readComparisonAcceptanceProfile);
  server.state.offline=true;await inspect(page);expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);await page.close();
  for(let launch=0;launch<2;launch++){const cold=await context.newPage();loading.push({phase:`offline-cold-${launch+1}`,readyMs:await ready(cold,server.origin)});await inspect(cold);expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(before);await cold.close();}
  expect(errors).toEqual([]);expect(csp).toEqual([]);await fs.writeFile(test.info().outputPath('light-camera-loading.json'),JSON.stringify(loading,null,2));
 }finally{await server.close();}
});
