import path from 'node:path';
import fs from 'node:fs/promises';
import {expect, test, type Locator, type Page} from '@playwright/test';
import {createDefaultProfileData, migrateProfileData} from '../../js/profile.js';
import {createCyclePeriod, upgradeMenstrualCycleProfile} from '../../js/cycle-summary.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readComparisonAcceptanceProfile} from '../helpers/nutrition-comparison-fixture.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';

const FIXED_ISO='2026-08-07T12:00:00.000Z',FIXED_TIME=Date.parse(FIXED_ISO);
const IMPORT_ID='synthetic-overview-drip-batch';
const WIDGET_KEY='labcharts-default-dashboardWidgetsV13',TOUR_KEY='labcharts-default-cycleTour',LAST_VIEW_KEY='labcharts-default-lastViewV1';
const STARTS=['2026-01-01','2026-01-29','2026-02-26','2026-03-26','2026-04-23','2026-05-21','2026-06-18','2026-07-16'];
const ENDS=['2026-01-05','2026-02-02','2026-03-02','2026-03-30','2026-04-27','2026-05-25','2026-06-22','2026-07-20'];
const HISTORY_DATES=['Jul 16-Jul 20','Jun 18-Jun 22','May 21-May 25','Apr 23-Apr 27','Mar 26-Mar 30','Feb 26-Mar 2'];
// Known synthetic facts from recorded contexts and a 28-day cycle, not the migrated view model.
const PHASES=[
  {date:'2026-02-28',dateLabel:'Feb 28, 2026',phase:'menstrual',label:'Menstrual',day:'Day 1',source:'Recorded',context:{cyclePhase:'menses',cycleDay:1}},
  {date:'2026-03-28',dateLabel:'Mar 28, 2026',phase:'follicular',label:'Early follicular',day:'Day 3',source:'Recorded',context:{cyclePhase:'follicular',cyclePhaseDetail:'early_follicular',cycleDay:3}},
  {date:'2026-04-25',dateLabel:'Apr 25, 2026',phase:'ovulatory',label:'Periovulatory',day:'Day 14',source:'Predicted',context:{cyclePhase:'ovulatory',cyclePhaseDetail:'periovulatory',cycleDay:14,cyclePhaseSource:'predicted'}},
  {date:'2026-05-23',dateLabel:'May 23, 2026',phase:'luteal',label:'Mid-luteal',day:'Day 21',source:'Recorded',context:{cyclePhase:'luteal',cyclePhaseDetail:'mid_luteal',cycleDay:21}},
  {date:'2026-06-27',dateLabel:'Jun 27, 2026',phase:'follicular',label:'Follicular',day:'Day 10',source:'Predicted',context:{}},
  {date:'2026-07-18',dateLabel:'Jul 18, 2026',phase:'menstrual',label:'Menstrual',day:'Day 1',source:'Recorded',context:{cyclePhase:'menses',cycleDay:1}},
];
const META=['28-day cycle','regular','heavy flow','Copper IUD','Synthetic <overview condition>','8 periods'];
const PERIMENOPAUSE='Possible perimenopause pattern detected (age 46): predominantly heavy flow, vasomotor symptoms (hot flashes/night sweats). Consider discussing with your healthcare provider.';
const DRIP_CSV=[
  'date,temperature.value,temperature.exclude,bleeding.value,bleeding.exclude,note.value,pain.cramps,mood.fatigue',
  '2026-04-01,36.55,false,1,false,start,true,true',
  '2026-04-02,36.62,false,3,false,heavy,false,false',
  '2026-04-03,36.68,false,2,true,excluded,false,false',
  '2026-05-01,36.48,false,2,false,next,false,false',
].join('\n');
interface RawRecords {daily:Record<string,unknown>[];imports:Record<string,unknown>[];meta:Record<string,unknown>[]}
interface DashboardPrefs {order:string[];hidden:string[]}
const RAW:RawRecords={
  daily:[
    {source:'drip',date:'2026-07-16',importId:IMPORT_ID,importedAt:1,bleeding:{flow:'heavy',excluded:false},note:'Preserve raw <overview>'},
    {source:'drip',date:'2026-07-17',importId:IMPORT_ID,importedAt:1,bbtC:36.65},
  ],
  imports:[{importId:IMPORT_ID,source:'drip',importedAt:'2026-07-21T00:00:00.000Z',sourceFile:'Synthetic overview.csv',observationCount:2,periodCount:1}],
  meta:[{k:'synthetic-overview-cycle-meta',v:{note:'Preserve until accepted Cycle clear'},updatedAt:1}],
};
async function profile(page:Page):Promise<Record<string,unknown>>{return await page.evaluate(readComparisonAcceptanceProfile) as Record<string,unknown>;}
async function localSnapshot(page:Page):Promise<Record<string,string>>{
  return page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)!])));
}
async function raw(page:Page):Promise<RawRecords>{
  return page.evaluate(async()=>{
    const open=indexedDB.open('labcharts-cycle-default',2);open.onupgradeneeded=()=>open.transaction?.abort();
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
    try{
      const tx=db.transaction(['daily-observations','imports','meta'],'readonly');
      const daily=tx.objectStore('daily-observations').getAll(),imports=tx.objectStore('imports').getAll(),meta=tx.objectStore('meta').getAll();
      return await new Promise<RawRecords>((resolve,reject)=>{
        tx.oncomplete=()=>resolve({daily:daily.result,imports:imports.result,meta:meta.result});tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
      });
    }finally{db.close();}
  });
}
async function expectRecords(page:Page,expected:Record<string,unknown>,expectedRaw:RawRecords,directory:string){
  await expect.poll(()=>profile(page)).toEqual(expected);expect(await raw(page)).toEqual(expectedRaw);
  expect(await page.evaluate(()=>localStorage.getItem('labcharts-profiles'))).toBe(directory);
}
async function openRoute(page:Page,route:string){
  const closeChat=page.getByRole('button',{name:'Close chat',exact:true});if(await closeChat.isVisible())await closeChat.click();
  const menu=page.getByRole('button',{name:'Menu',exact:true});
  if(await menu.isVisible()&&!await page.locator('#sidebar-nav').evaluate(node=>node.classList.contains('mobile-open')))await menu.click();
  await page.locator(`[data-nav-action="navigate"][data-nav-route="${route}"]`).click();
}
const full=(page:Page)=>page.locator('.lens-page-widgets[data-lens-route="body"] [data-widget-id="cycle"] .cycle-section[data-cycle-overview-view]');
const compact=(page:Page)=>page.locator('#main-content .dashboard-widgets [data-widget-id="cycle"] .cycle-section[data-cycle-overview-view]');
const editor=(page:Page)=>page.locator('#modal-overlay.show #detail-modal.cycle-modal');
async function inspectOverview(section:Locator,isCompact:boolean){
  await expect(section).toBeVisible();await expect(section.locator('img,script,[onclick]')).toHaveCount(0);
  if(isCompact){
    await expect(section).toContainClass('cycle-section-compact');
    await expect(section.locator('.cycle-widget-head,.cycle-period-log,[data-cycle-import-action],[data-cycle-action="start-tour"]')).toHaveCount(0);
  }else{
    await expect(section).not.toContainClass('cycle-section-compact');
    await expect(section.locator('.cycle-widget-title')).toHaveText('Menstrual cycle');
    await expect(section.getByRole('button',{name:'Take the cycle feature tour',exact:true})).toBeVisible();
    await expect(section.getByRole('button',{name:'Import cycle data',exact:true})).toBeVisible();
    await expect(section.getByRole('button',{name:'Edit',exact:true})).toBeVisible();
  }
  const meta=isCompact?[...META,'Last Jul 16']:META;
  await expect(section.locator('.cycle-summary-copy strong')).toHaveText('Perimenopause');
  await expect(section.locator('.cycle-meta-tag')).toHaveText(meta);
  await expect(section.locator('.cycle-summary-card')).toHaveAccessibleName('Edit cycle: '+['Perimenopause',...meta].join(', '));
  await expect(section.locator('.cycle-draw-copy > span')).toHaveText('~Aug 15-Aug 17 (days 3-5, early follicular)');
  if(isCompact)await expect(section.locator('.cycle-draw-copy > small')).toBeHidden();
  else await expect(section.locator('.cycle-draw-copy > small')).toBeVisible();
  const visiblePhases=isCompact?PHASES.slice(0,2):PHASES;
  const tags=section.locator('.cycle-draw-tag:not(.cycle-draw-more)');await expect(tags).toHaveCount(visiblePhases.length);
  for(let i=0;i<visiblePhases.length;i++){
    const expected=visiblePhases[i]!,tag=tags.nth(i);
    await expect(tag.locator('.cycle-phase-badge')).toHaveText(expected.label);
    await expect(tag.locator('.cycle-phase-badge')).toContainClass('phase-'+expected.phase);
    expect(await tag.locator(':scope > span').allTextContents()).toEqual([expected.label,expected.dateLabel,expected.day,expected.source]);
  }
  if(isCompact)await expect(section.locator('.cycle-draw-more')).toHaveText('+4 more draws');
  else await expect(section.locator('.cycle-draw-more')).toHaveCount(0);
  await expect(section.locator('.cycle-period-entry')).toHaveCount(isCompact?0:6);
  if(!isCompact){
    await expect(section.locator('.cycle-period-date')).toHaveText(HISTORY_DATES);
    await expect(section.locator('.cycle-period-entry .goals-severity-badge')).toHaveText(Array(6).fill('heavy'));
    for(const badge of await section.locator('.cycle-period-entry .goals-severity-badge').all())await expect(badge).toContainClass('severity-major');
    await expect(section.locator('.cycle-period-note')).toHaveText(['Period <8>','Period <7>','Period <6>','Period <5>','Period <4>','Period <3>']);
    await expect(section.locator('.cycle-period-entry .period-symptom-tag')).toHaveText(Array(6).fill('Hot flashes'));
  }
  const alerts=section.locator('.cycle-alert');await expect(alerts).toHaveCount(isCompact?1:2);
  await expect(alerts.first()).toContainClass('cycle-alert-perimenopause');
  await expect(alerts.first().locator('strong')).toHaveText('Possible Perimenopause Pattern');
  await expect(alerts.first().locator('.cycle-alert-detail')).toHaveText(PERIMENOPAUSE);
  if(isCompact)await expect(alerts.first().locator('.cycle-alert-detail')).toHaveCSS('-webkit-line-clamp','2');
  else{
    await expect(alerts.nth(1)).toContainClass('cycle-alert-critical');
    await expect(alerts.nth(1).locator('strong')).toHaveText('Hemoglobin + Heavy Flow');
    await expect(alerts.nth(1).locator('.cycle-alert-detail')).toHaveText('Hemoglobin is below range (100 g/l) with recent heavy flow — discuss iron supplementation with your provider');
  }
}
async function cancelEditor(page:Page,section:Locator,action:'summary'|'edit',expected:Record<string,unknown>,directory:string){
  const button=action==='summary'?section.locator('.cycle-summary-card'):section.getByRole('button',{name:'Edit',exact:true});
  await button.focus();await page.keyboard.press('Enter');
  await expect(editor(page)).toBeVisible();await expect(editor(page).locator('.cycle-modal-head[data-cycle-editor-view]')).toBeVisible();
  await expect(editor(page).locator('#mc-cycle-status')).toHaveValue('perimenopause');
  await editor(page).locator('#mc-conditions').fill('Uncommitted <overview edit>');
  await editor(page).getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.locator('#modal-overlay')).not.toContainClass('show');await expectRecords(page,expected,RAW,directory);
}
async function cancelImport(page:Page,expected:Record<string,unknown>,directory:string){
  const section=full(page),input=section.locator('input.cycle-import-file-input[data-cycle-import-action="select-file"]');
  await expect(input).toBeHidden();
  await expect(input).toHaveAttribute('accept','.csv,.json,.cluedata,.xml,.zip,text/csv,application/json,application/xml,text/xml,application/zip');
  const chooser=page.waitForEvent('filechooser');await section.getByRole('button',{name:'Import cycle data',exact:true}).click();
  await(await chooser).setFiles({name:'drip-overview-synthetic.csv',mimeType:'text/csv',buffer:Buffer.from(DRIP_CSV)});
  const preview=page.locator('#import-modal-overlay.show #import-modal[data-cycle-import-view]');
  await expect(preview).toBeVisible();await expect(preview.locator('.gb-modal-title')).toHaveText('Review cycle import');
  await expect(preview.locator('.import-review-file strong')).toHaveText(['drip-overview-synthetic.csv','2026-04-01 - 2026-05-01']);
  await expect(preview.locator('.import-review-stats')).toContainText('4 daily observations');
  await expect(preview.locator('.import-review-stats')).toContainText('2 periods found');
  await expect(preview.locator('tbody tr')).toHaveCount(2);await expectRecords(page,expected,RAW,directory);
  await preview.getByRole('button',{name:'Close import preview',exact:true}).click();
  await expect(page.locator('#import-modal-overlay')).not.toContainClass('show');await expectRecords(page,expected,RAW,directory);
}
async function closeClients(page:Page){for(const client of page.context().pages())await client.close();expect(page.context().pages()).toHaveLength(0);}

test('static Cycle overview full and compact controls preserve complete records through two stopped-origin closed-client launches',async({page,context,browserName})=>{
  test.setTimeout(180000);
  await installDiscussionFixture(context,{provider:'openrouter',paused:true});await installOfflineStartupDiagnostics(context);
  const periods=STARTS.map((startDate,index)=>createCyclePeriod({startDate,endDate:ENDS[index]!,flow:'heavy',symptoms:['Hot flashes'],notes:`Period <${index+1}>`,
    source:index===7?'drip':'manual',importId:index===7?IMPORT_ID:null,updatedAt:'2026-07-21T00:00:00.000Z'}));
  if(periods.some(period=>!period))throw new Error('Synthetic overview period construction failed');
  const cycle=upgradeMenstrualCycleProfile({cycleStatus:'perimenopause',contraceptive:'Copper IUD',conditions:'Synthetic <overview condition>',periods,
    coverage:{observationCount:2,firstDate:'2026-07-16',lastDate:'2026-07-17',sources:{drip:{periods:1,observations:2,importIds:[IMPORT_ID],importedAt:'2026-07-21T00:00:00.000Z'}}}},{now:FIXED_ISO});
  const seeded=migrateProfileData({...createDefaultProfileData(),profile:{firstName:'Alex',age:46},
    entries:PHASES.map(row=>({date:row.date,markers:{'hematology.hemoglobin':100,'biochemistry.glucose':5},context:row.context})),
    refOverrides:{'hematology.hemoglobin':{refMin:120,refMax:160}},menstrualCycle:cycle,
    contextNotes:'Keep unrelated Cycle overview context',markerNotes:{'thyroid.tsh':'Keep unrelated marker note'},
    notes:[{date:'2026-07-14',text:'Keep unrelated note'}],changeHistory:[{field:'contextNotes',date:'2026-07-14',snapshot:'Keep unrelated Cycle overview context',updatedAt:1}]});
  const expected=JSON.parse(JSON.stringify(seeded)) as Record<string,unknown>;
  const errors:string[]=[],csp:string[]=[],external:string[]=[];
  const observe=(target:Page)=>target.on('pageerror',error=>errors.push(error.message));observe(page);context.on('page',observe);
  await context.exposeBinding('cycleOverviewCsp',(_,value:string)=>csp.push(value));
  await context.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>{
    void(window as unknown as {cycleOverviewCsp(value:string):Promise<void>}).cycleOverviewCsp(event.violatedDirective);
  }));
  const server=await startKitServer(process.env.GETBASED_KIT_ARTIFACT||path.resolve('.local-notes/sveltekit-build'));
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(['http:','https:'].includes(url.protocol)&&url.origin!==server.origin){external.push(url.origin+url.pathname);await route.abort();}
    else await route.continue();
  });
  try{
    await page.clock.setFixedTime(new Date(FIXED_ISO));
    // Seed exactly once before app startup; no init script or cold client repeats this setup.
    await page.goto(server.origin+'/data/demo-male.json');
    await page.evaluate(async({seeded,rawSeed})=>{
      localStorage.setItem('labcharts-profiles',JSON.stringify([{id:'default',name:'Alex',sex:'female',dob:'1980-01-01',createdAt:1}]));
      localStorage.setItem('labcharts-active-profile','default');localStorage.setItem('labcharts-show-product-recs','false');
      const openBlobs=indexedDB.open('labcharts-blobs',1);openBlobs.onupgradeneeded=()=>openBlobs.result.createObjectStore('kv');
      const blobs=await new Promise<IDBDatabase>((resolve,reject)=>{openBlobs.onsuccess=()=>resolve(openBlobs.result);openBlobs.onerror=()=>reject(openBlobs.error);});
      try{
        const tx=blobs.transaction('kv','readwrite');tx.objectStore('kv').put(JSON.stringify(seeded),'labcharts-default-imported');
        await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});
      }finally{blobs.close();}
      const open=indexedDB.open('labcharts-cycle-default',2);open.onupgradeneeded=()=>{
        const db=open.result,daily=db.createObjectStore('daily-observations',{keyPath:['source','date','importId']});
        daily.createIndex('by_source','source');daily.createIndex('by_source_date',['source','date']);daily.createIndex('by_date','date');daily.createIndex('by_import','importId');
        db.createObjectStore('imports',{keyPath:'importId'}).createIndex('by_source','source');db.createObjectStore('meta',{keyPath:'k'});
      };
      const db=await new Promise<IDBDatabase>((resolve,reject)=>{open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
      try{
        const tx=db.transaction(['daily-observations','imports','meta'],'readwrite');
        for(const row of rawSeed.daily)tx.objectStore('daily-observations').put(row);
        for(const row of rawSeed.imports)tx.objectStore('imports').put(row);
        for(const row of rawSeed.meta)tx.objectStore('meta').put(row);
        await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});
      }finally{db.close();}
    },{seeded,rawSeed:RAW});
    const loading=[{phase:'initial-online',readyMs:await ready(page,server.origin)}];
    loading.push({phase:'controlled-online',readyMs:await ready(page,server.origin)});
    const directory=(await localSnapshot(page))['labcharts-profiles']!;await expectRecords(page,expected,RAW,directory);
    await openRoute(page,'body');await inspectOverview(full(page),false);
    await cancelEditor(page,full(page),'summary',expected,directory);await cancelEditor(page,full(page),'edit',expected,directory);
    await cancelImport(page,expected,directory);await inspectOverview(full(page),false);
    const beforeTour=await localSnapshot(page);
    await full(page).getByRole('button',{name:'Take the cycle feature tour',exact:true}).click();
    const tooltip=page.locator('#tour-tooltip');await expect(tooltip.locator('h4')).toHaveText('Cycle-Aware Lab Interpretation');
    await tooltip.getByRole('button',{name:'Next',exact:true}).click();await expect(tooltip.locator('h4')).toHaveText('Your Cycle at a Glance');
    await tooltip.getByRole('button',{name:'Next',exact:true}).click();await expect(tooltip.locator('h4')).toHaveText('Optimal Blood Draw Timing');
    await tooltip.getByRole('button',{name:'Back',exact:true}).click();await tooltip.getByRole('button',{name:'Back',exact:true}).click();
    await tooltip.getByRole('button',{name:'Skip',exact:true}).click();await expect(tooltip).toHaveCount(0);
    expect(await localSnapshot(page)).toEqual({...beforeTour,[TOUR_KEY]:'completed'});await expectRecords(page,expected,RAW,directory);
    await openRoute(page,'dashboard');await inspectOverview(compact(page),true);
    await page.locator('#main-content [data-dashboard-widget-action="toggle-organize"]').first().click();
    await page.locator('#main-content .dashboard-widgets [data-widget-id="cycle"] [data-dashboard-widget-action="hide-widget"]').click();
    await expect(compact(page)).toHaveCount(0);
    const hiddenPrefs=JSON.parse((await localSnapshot(page))[WIDGET_KEY]!) as DashboardPrefs;expect(hiddenPrefs.hidden).toContain('cycle');
    await page.locator('#main-content [data-dashboard-widget-action="open-picker"]').first().click();
    const picker=page.locator('#dashboard-widget-picker-overlay.show');
    await picker.locator('[data-dashboard-widget-action="show-widget"][data-dashboard-widget-id="cycle"]').click();
    await expect(picker).toHaveCount(0);await inspectOverview(compact(page),true);
    const prefs=JSON.parse((await localSnapshot(page))[WIDGET_KEY]!) as DashboardPrefs;
    expect(prefs.hidden).toEqual(hiddenPrefs.hidden.filter(id=>id!=='cycle'));expect(prefs.order.filter(id=>id==='cycle')).toEqual(['cycle']);
    await page.locator('#main-content [data-dashboard-widget-action="toggle-organize"]').first().click();
    await cancelEditor(page,compact(page),'summary',expected,directory);await inspectOverview(compact(page),true);
    const persisted=await localSnapshot(page);
    expect(persisted[LAST_VIEW_KEY]).toBe('dashboard');
    const persistedBody={...persisted,[LAST_VIEW_KEY]:'body'};
    await closeClients(page);await server.close();
    if(browserName==='firefox'){
      await context.unroute('**/*');context.on('request',request=>{const url=new URL(request.url());if(['http:','https:'].includes(url.protocol)&&url.origin!==server.origin)external.push(url.origin+url.pathname);});
    }
    // Verified WebKit emulator limitation: real stopped origin still proves disconnected navigation.
    const browserOfflineEmulation=browserName!=='webkit';if(browserOfflineEmulation)await context.setOffline(true);
    const cold=await context.newPage();await cold.clock.setFixedTime(new Date(FIXED_ISO));
    loading.push({phase:'origin-stopped-cold-1',readyMs:await ready(cold,server.origin)});
    expect(await localSnapshot(cold)).toEqual(persisted);await expectRecords(cold,expected,RAW,directory);
    await openRoute(cold,'dashboard');await inspectOverview(compact(cold),true);await cancelEditor(cold,compact(cold),'summary',expected,directory);
    await openRoute(cold,'body');await inspectOverview(full(cold),false);await cancelEditor(cold,full(cold),'edit',expected,directory);
    await cancelImport(cold,expected,directory);
    expect(await localSnapshot(cold)).toEqual(persistedBody);await closeClients(cold);
    const second=await context.newPage();await second.clock.setFixedTime(new Date(FIXED_ISO));
    loading.push({phase:'origin-stopped-cold-2',readyMs:await ready(second,server.origin)});
    expect(await localSnapshot(second)).toEqual(persistedBody);await expectRecords(second,expected,RAW,directory);
    await openRoute(second,'body');await inspectOverview(full(second),false);await cancelEditor(second,full(second),'summary',expected,directory);
    await openRoute(second,'dashboard');await inspectOverview(compact(second),true);
    // Use the real accepted clear to expose both overview prompt surfaces; no alternate fixture/reseed.
    await compact(second).locator('.cycle-summary-card').click();await expect(editor(second)).toBeVisible();
    await editor(second).getByRole('button',{name:'Clear All',exact:true}).click();
    const confirmation=second.locator('#confirm-dialog-overlay.show [role="alertdialog"]');
    await expect(confirmation.locator('.confirm-message')).toHaveText('Clear all menstrual cycle data? This cannot be undone.');
    await confirmation.locator('#confirm-ok').click();
    const history=expected.changeHistory as Record<string,unknown>[];
    const cleared={...expected,menstrualCycle:null,changeHistory:[...history,{field:'menstrualCycle',date:'2026-08-07',snapshot:null,updatedAt:FIXED_TIME}]};
    const emptyRaw:RawRecords={daily:[],imports:[],meta:[]};
    const clearedDirectory=JSON.stringify((JSON.parse(directory) as Record<string,unknown>[]).map(entry=>({...entry,lastUpdated:FIXED_TIME})));
    await expectRecords(second,cleared,emptyRaw,clearedDirectory);
    await expect(compact(second).locator('.cycle-prompt')).toHaveAccessibleName('Set up cycle tracking');
    await expect(compact(second).locator('.cycle-summary-card,.cycle-widget-head')).toHaveCount(0);
    await compact(second).locator('.cycle-prompt').click();await expect(editor(second)).toBeVisible();
    await editor(second).getByRole('button',{name:'Cancel',exact:true}).click();await expectRecords(second,cleared,emptyRaw,clearedDirectory);
    await openRoute(second,'body');await expect(full(second).locator('.cycle-prompt')).toBeVisible();
    await expect(full(second).getByRole('button',{name:'Set up',exact:true})).toBeVisible();await expect(full(second).locator('[data-cycle-action="start-tour"]')).toHaveCount(0);
    await full(second).getByRole('button',{name:'Set up',exact:true}).click();await expect(editor(second)).toBeVisible();
    await editor(second).getByRole('button',{name:'Cancel',exact:true}).click();await expectRecords(second,cleared,emptyRaw,clearedDirectory);
    expect(await localSnapshot(second)).toEqual({...persistedBody,'labcharts-profiles':clearedDirectory});
    await closeClients(second);expect(errors).toEqual([]);expect(csp).toEqual([]);expect(external).toEqual([]);
    await fs.writeFile(test.info().outputPath('cycle-overview-acceptance.json'),JSON.stringify({loading,browserOfflineEmulation,stoppedOrigin:true,coldReseeding:false,
      fullProfileRawHistoryDirectoryEquality:true,fullLocalStorageEquality:true,fullHistoryCap:6,compactPhaseCap:2,compactPhaseOverflow:4,fullAlerts:2,compactAlerts:1,
      actualEditorCancel:true,actualImportPreviewCancelOnlineAndOffline:true,actualTourNextBackSkip:true,dashboardHideRestore:true,clearedPromptCancel:true},null,2));
  }finally{for(const client of context.pages())if(!client.isClosed())await client.close();await server.close();}
});
