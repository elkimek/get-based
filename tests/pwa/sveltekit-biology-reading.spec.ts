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
  const cards=page.locator('.biology-score-compact');await expect(cards).toHaveCount(18);
  // Await the routed cards before opening the asynchronously rendered waiting group.
  const waiting=page.locator('.biology-score-unavailable-group');
  if(await waiting.count()){
    await waiting.locator(':scope > summary').focus();await page.keyboard.press('Enter');
    await expect(waiting).toHaveAttribute('open','');
  }
  // Stable score IDs ensure each distinct reading is exercised exactly once.
  const ids=await cards.evaluateAll(nodes=>nodes.map(node=>node.id));
  expect(new Set(ids).size).toBe(18);
  for(const id of ids){
    const card=page.locator(`#${id}`);
    const summary=card.locator('[data-biology-score-action="toggle-score"]');
    await expect(summary).toBeVisible();await summary.focus();await expect(summary).toBeFocused();await page.keyboard.press('Enter');
    await expect(card).toHaveAttribute('open','');await expect(card.locator('.biology-score-marker-section')).toHaveCount(2);
    const methodology=card.locator('.biology-score-methodology');const heading=methodology.locator(':scope > summary');
    await heading.focus();await page.keyboard.press('Enter');await expect(methodology.locator('.biology-reading-lead')).not.toBeEmpty();
    await expect(methodology.locator('.biology-reading-facts > div')).toHaveCount(4);
    const calculation=methodology.locator('.biology-reading-notes');await calculation.locator(':scope > summary').focus();await page.keyboard.press('Enter');
    const weights=calculation.getByRole('region',{name:'Marker weights'});await weights.focus();await expect(weights).toBeFocused();await expect(weights.locator('table')).toBeVisible();
    // Cards intentionally share a full-width expanded grid row. Check that
    // actual reading pane, rather than the narrower collapsed card wrapper.
    const panel=card.locator('.biology-score-expanded');
    const grid=card.locator('xpath=ancestor::div[contains(@class, "lens-page-widgets")]');
    const panelBounds=await panel.boundingBox(),gridBounds=await grid.boundingBox();
    expect(Math.abs(panelBounds!.x-gridBounds!.x)).toBeLessThan(3);
    expect(Math.abs(panelBounds!.width-gridBounds!.width)).toBeLessThan(3);
    expect(await panel.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
    await heading.focus();await page.keyboard.press('Space');await expect(methodology.locator('.biology-reading-body')).not.toBeVisible();
    await summary.focus();await page.keyboard.press('Enter');await expect(card).not.toHaveAttribute('open');
  }
  const first=page.locator('#biology-score-metabolicFlexibility');
  const firstToggle=first.locator('[data-biology-score-action="toggle-score"]');
  await firstToggle.focus();await expect(firstToggle).toBeFocused();await page.keyboard.press('Enter');await expect(first).toHaveAttribute('open','');
  const marker=first.locator('[data-biology-score-action="open-marker"]').first();await marker.focus();await page.keyboard.press('Enter');
  await expect(page.locator('#detail-modal')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#detail-modal')).not.toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);

}
test('static Biology Scores reading panels and marker links preserve the full profile across closed-client offline launches',async({page,context})=>{
  test.setTimeout(120000);await installDiscussionFixture(context);await installOfflineStartupDiagnostics(context);
  await context.addInitScript(({defaults,demo})=>{
    if(!['http:','https:'].includes(location.protocol))return;
    localStorage.setItem('labcharts-ai-paused','true');
    if(localStorage.getItem('biology-reading-seeded'))return;localStorage.setItem('biology-reading-seeded','1');
    localStorage.setItem('labcharts-profiles',JSON.stringify([{id:'default',name:'Alex',sex:'male',dob:'1987-11-22',createdAt:1}]));localStorage.setItem('labcharts-active-profile','default');
    for(const key of ['tour','emptyTour'])localStorage.setItem(`labcharts-default-${key}`,'completed');
    // A focused lab profile avoids unrelated historical Sun sessions whose
    // intended weather hydration writes independently of Biology Scores.
    localStorage.setItem('labcharts-default-imported',JSON.stringify({...defaults,entries:demo.entries,refOverrides:demo.refOverrides,profile:{firstName:'Alex',age:38},markerNotes:{'thyroid.tsh':'Retain this unrelated marker note'},sunDefaults:{fitzpatrick:'II',completedAt:1},contextNotes:'Retain unrelated planning context'}));
  },{defaults:createDefaultProfileData(),demo:JSON.parse(await fs.readFile('data/demo-male.json','utf8')) as Record<string,unknown>});
  const errors:string[]=[],csp:string[]=[];const observe=(p:Page)=>p.on('pageerror',error=>errors.push(error.message));observe(page);context.on('page',observe);
  await context.exposeBinding('biologyReadingCsp',(_,value:string)=>csp.push(value));
  await context.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>{void(window as unknown as {biologyReadingCsp(value:string):Promise<void>}).biologyReadingCsp(event.violatedDirective);}));
  const server=await startKitServer(process.env.GETBASED_KIT_ARTIFACT||path.resolve('.local-notes/sveltekit-build'));
  try{
    await page.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
    const loading=[{phase:'initial-online',readyMs:await ready(page,server.origin)}],before=await page.evaluate(readComparisonAcceptanceProfile);server.state.offline=true;
    await inspect(page);expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);await page.close();
    for(let launch=0;launch<2;launch++){
      const cold=await context.newPage();await cold.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));loading.push({phase:`offline-cold-${launch+1}`,readyMs:await ready(cold,server.origin)});
      await inspect(cold);expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(before);await cold.close();
    }
    expect(errors).toEqual([]);expect(csp).toEqual([]);await fs.writeFile(test.info().outputPath('biology-reading-loading.json'),JSON.stringify(loading,null,2));
  }finally{await server.close();}
});
