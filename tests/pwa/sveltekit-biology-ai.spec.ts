import path from 'node:path';
import fs from 'node:fs/promises';
import {expect,test,type Page} from '@playwright/test';
import {createDefaultProfileData} from '../../js/profile.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readComparisonAcceptanceProfile} from '../helpers/nutrition-comparison-fixture.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';
async function inspect(page:Page){
 const menu=page.getByRole('button',{name:'Menu',exact:true});if(await menu.isVisible())await menu.click();
 await page.locator('[data-nav-action="navigate"][data-nav-route="biology-scores"]').click();
 await expect(page.locator('.biology-score-compact')).toHaveCount(18);
 const card=page.locator('#biology-score-metabolicFlexibility');
 const summary=card.locator('[data-biology-score-ai-summary]');
 await expect(summary.locator('.biology-score-ai-teaser-text')).toHaveText('Stored independent insight.');
 await expect(summary.locator('[role="status"][aria-live]')).toHaveAttribute('aria-label','refresh needed');
 await expect(summary.locator('.biology-score-ai-refresh-reason')).toHaveText('This explanation uses an older context format.');
 const toggle=card.locator('[data-biology-score-action="toggle-score"]');await toggle.focus();await page.keyboard.press('Enter');await expect(card).toHaveAttribute('open','');
 const methodology=card.locator('.biology-score-methodology');
 await methodology.locator(':scope > summary').focus();await page.keyboard.press('Enter');
 await expect(methodology.locator('.biology-reading-lead')).toBeVisible();
 await expect(methodology.locator('.biology-reading-lead')).not.toBeEmpty();
 const answer=card.locator('[data-biology-score-ai-panel]');await expect(answer).toBeVisible();
 await expect(answer.locator('.chat-h2')).toHaveText('Cached signal');
 await expect(answer.locator('strong')).toHaveText('Full explanation');
 await expect(answer.locator('li')).toHaveCount(2);
 await expect(answer.getByRole('link',{name:'source',exact:true})).toHaveAttribute('href','https://example.com/evidence');
 await expect(answer.getByRole('link',{name:'unsafe',exact:true})).toHaveAttribute('href','#');
 await expect(answer.locator('.biology-ai-provenance')).toContainText('fixture/model');
 await expect(answer.locator('.biology-score-ai-stale')).toContainText('Refresh to use the latest inputs.');
 await expect(answer.locator('script,img,[onerror],a[href^="javascript:"]')).toHaveCount(0);
 expect(await answer.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await toggle.focus();await page.keyboard.press('Enter');await expect(card).not.toHaveAttribute('open');
}
test('static Biology cached AI question summary and sanitized answer survive closed-client offline launches without profile writes',async({page,context})=>{
 test.setTimeout(120000);await installDiscussionFixture(context);await installOfflineStartupDiagnostics(context);
 const text='## Cached signal\n\n**Full explanation** with [source](https://example.com/evidence).\n\n- Retain context\n- Check next\n\n<script>alert(1)</script> [unsafe](javascript:alert(1))';
 await context.addInitScript(({defaults,demo,text})=>{
  if(!['http:','https:'].includes(location.protocol))return;
  localStorage.setItem('labcharts-ai-paused','true');
  if(localStorage.getItem('biology-ai-seeded'))return;localStorage.setItem('biology-ai-seeded','1');
  localStorage.setItem('labcharts-profiles',JSON.stringify([{id:'default',name:'Alex',sex:'male',dob:'1987-11-22',createdAt:1}]));localStorage.setItem('labcharts-active-profile','default');
  for(const key of ['tour','emptyTour'])localStorage.setItem(`labcharts-default-${key}`,'completed');
  localStorage.setItem('labcharts-default-imported',JSON.stringify({...defaults,entries:demo.entries,refOverrides:demo.refOverrides,profile:{firstName:'Alex',age:38},markerNotes:{'thyroid.tsh':'Retain unrelated note'},sunDefaults:{fitzpatrick:'II',completedAt:1},contextNotes:'Retain unrelated context',biologyScoreAI:{metabolicFlexibility:{text,summary:'Stored independent insight.',updatedAt:1786104000000,materialFingerprint:'fixture-older-context',generation:{modelId:'fixture/model'}}}}));
 },{defaults:createDefaultProfileData(),demo:JSON.parse(await fs.readFile('data/demo-male.json','utf8')) as Record<string,unknown>,text});
 const errors:string[]=[],csp:string[]=[];const observe=(p:Page)=>p.on('pageerror',error=>errors.push(error.message));observe(page);context.on('page',observe);
 await context.exposeBinding('biologyAiCsp',(_,value:string)=>csp.push(value));
 await context.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>{void(window as unknown as {biologyAiCsp(value:string):Promise<void>}).biologyAiCsp(event.violatedDirective);}));
 const server=await startKitServer(process.env.GETBASED_KIT_ARTIFACT||path.resolve('.local-notes/sveltekit-build'));
 try{
  await page.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
  const loading=[{phase:'initial-online',readyMs:await ready(page,server.origin)}];const before=await page.evaluate(readComparisonAcceptanceProfile);server.state.offline=true;
  await inspect(page);expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);await page.close();
  for(let launch=0;launch<2;launch++){
   const cold=await context.newPage();await cold.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));loading.push({phase:`offline-cold-${launch+1}`,readyMs:await ready(cold,server.origin)});
   await inspect(cold);expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(before);await cold.close();
  }
  expect(errors).toEqual([]);expect(csp).toEqual([]);await fs.writeFile(test.info().outputPath('biology-ai-loading.json'),JSON.stringify(loading,null,2));
 }finally{await server.close();}
});
