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
  const planning=page.locator('.biology-planning-grid');await expect(planning.locator('[data-biology-planning-view]')).toHaveCount(2);
  const checks=planning.locator('.biology-score-action-summary');const coverage=planning.locator('#biology-score-coverage');
  await expect(checks.locator(':scope > summary')).toHaveText('Suggested next checks');await expect(coverage.locator(':scope > summary')).toHaveText('Plan additional labs');
  await expect(coverage.getByRole('button',{name:'Make lab plan',exact:true})).toBeVisible();
  const progress=coverage.getByRole('progressbar',{name:'Baseline coverage'});await expect(progress).toHaveAttribute('aria-valuenow','100');
  const more=coverage.locator('.biology-coverage-more > summary');await more.focus();await page.keyboard.press('Enter');
  await expect(coverage.locator('.biology-coverage-bundle-card')).toHaveCount(3);await expect(coverage.locator('.biology-coverage-bundle-card').first()).toContainText('Baseline core markers covered');
  await page.keyboard.press('Space');await expect(coverage.locator('.biology-coverage-bundle-grid')).not.toBeVisible();
  const summary=coverage.locator(':scope > summary');await summary.focus();await page.keyboard.press('Space');await expect(coverage).not.toHaveAttribute('open');await expect(progress).not.toBeVisible();
  await page.keyboard.press('Enter');await expect(progress).toBeVisible();
  const jump=checks.locator('[data-biology-score-action="jump-to-domain"]').first();const id=await jump.getAttribute('data-biology-score-id');await jump.focus();await page.keyboard.press('Enter');
  await expect(page.locator(`#biology-score-${id}`)).toHaveAttribute('open','');await expect(page.locator(`#biology-score-${id}`)).toBeVisible();
}
test('static Biology Scores planning and disclosures preserve the full profile across closed-client offline launches',async({page,context})=>{
  test.setTimeout(120000);await installDiscussionFixture(context);await installOfflineStartupDiagnostics(context);
  await context.addInitScript(({defaults,demo})=>{
    if(!['http:','https:'].includes(location.protocol))return;
    localStorage.setItem('labcharts-ai-paused','true');
    if(localStorage.getItem('biology-planning-seeded'))return;localStorage.setItem('biology-planning-seeded','1');
    localStorage.setItem('labcharts-profiles',JSON.stringify([{id:'default',name:'Alex',sex:'male',dob:'1987-11-22',createdAt:1}]));localStorage.setItem('labcharts-active-profile','default');
    for(const key of ['tour','emptyTour'])localStorage.setItem(`labcharts-default-${key}`,'completed');
    // A focused lab profile avoids unrelated historical Sun sessions whose
    // intended weather hydration writes independently of Biology Scores.
    localStorage.setItem('labcharts-default-imported',JSON.stringify({...defaults,entries:demo.entries,refOverrides:demo.refOverrides,profile:{firstName:'Alex',age:38},markerNotes:{'thyroid.tsh':'Retain this unrelated marker note'},sunDefaults:{fitzpatrick:'II',completedAt:1},contextNotes:'Retain unrelated planning context'}));
  },{defaults:createDefaultProfileData(),demo:JSON.parse(await fs.readFile('data/demo-male.json','utf8')) as Record<string,unknown>});
  const errors:string[]=[],csp:string[]=[];const observe=(p:Page)=>p.on('pageerror',error=>errors.push(error.message));observe(page);context.on('page',observe);
  await context.exposeBinding('biologyPlanningCsp',(_,value:string)=>csp.push(value));
  await context.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>{void(window as unknown as {biologyPlanningCsp(value:string):Promise<void>}).biologyPlanningCsp(event.violatedDirective);}));
  const server=await startKitServer(process.env.GETBASED_KIT_ARTIFACT||path.resolve('.local-notes/sveltekit-build'));
  try{
    await page.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
    const loading=[{phase:'initial-online',readyMs:await ready(page,server.origin)}],before=await page.evaluate(readComparisonAcceptanceProfile);server.state.offline=true;
    await inspect(page);expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);await page.close();
    for(let launch=0;launch<2;launch++){
      const cold=await context.newPage();await cold.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));loading.push({phase:`offline-cold-${launch+1}`,readyMs:await ready(cold,server.origin)});
      await inspect(cold);expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(before);await cold.close();
    }
    expect(errors).toEqual([]);expect(csp).toEqual([]);await fs.writeFile(test.info().outputPath('biology-planning-loading.json'),JSON.stringify(loading,null,2));
  }finally{await server.close();}
});
