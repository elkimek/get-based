import {test,expect} from '@playwright/test';
test('genuine mobile dashboard composes typed widget frames controls range and navigation',async({page})=>{
 await page.setViewportSize({width:390,height:844});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/app',{waitUntil:'load'});await page.locator('html[data-app-ready]').waitFor({state:'attached'});
 const notice=page.getByRole('dialog',{name:'Review self-hosted app notice'});if(await notice.isVisible()){await notice.getByRole('checkbox').check();await notice.getByRole('button',{name:'Acknowledge & continue',exact:true}).click();}
 await page.evaluate(async()=>{
  const [{state},mobile,{projectDashboardWidgetFrame}]=await Promise.all([import('/js/state.js'),import('/js/mobile-dashboard.js'),import('/js/dashboard-widget-presentation.js')]);
  const entries=[
   {def:{id:'mobile-sources',title:'Body sources',size:'full'},content:{kind:'body-sources' as const,view:{empty:true,sources:[]}}},
   {def:{id:'mobile-genome',title:'Genome',size:'full'},content:{kind:'genome' as const,view:{kind:'empty' as const,contributionHref:null}}},
  ];
  const prefs={order:[],hidden:[]};const calls:string[]=[];const main=document.getElementById('main-content')!;
  const note=(value:string)=>{calls.push(value);main.dataset.mobileCalls=JSON.stringify(calls);};
  const profile=await import('/js/profile.js');await profile.saveProfiles([{id:'mobile-typed',name:'Mobile Tester',sex:null,dob:null,location:{country:'',zip:''},tags:[],notes:'',status:'',avatar:null,height:null,heightUnit:'cm',createdAt:0,lastUpdated:0,pinned:false}]);profile.setActiveProfileId('mobile-typed');state.currentProfile='mobile-typed';state.currentView='dashboard';
  mobile.configureMobileDashboardView({buildDashboardWidgetContext:()=>({fixture:true}),getDashboardWidgetPrefs:()=>prefs,getVisibleDashboardWidgetViews:()=>entries,
   isDashboardOrganizeMode:()=>true,projectDashboardControlButtons:()=>({organizeLabel:'Done',showReset:true}),
   projectDashboardWidget:(entry:Parameters<typeof projectDashboardWidgetFrame>[0],p:Parameters<typeof projectDashboardWidgetFrame>[1],index:number,all:Parameters<typeof projectDashboardWidgetFrame>[3])=>projectDashboardWidgetFrame(entry,p,index,all,true),
   setupDropZone:()=>note('drop-zone'),loadContextCardTips:()=>note('tips'),loadCommitHash:()=>note('commit'),loadCatalog:()=>Promise.resolve({synthetic:true}),cacheCatalog:()=>note('cache'),navigate:(route:string)=>note('navigate:'+route),
  });
  await mobile.renderMobileDashboard({dates:['2026-01-01','2026-02-01'],categories:{}});
 });
 const main=page.locator('#main-content');await expect(main.getByRole('heading',{name:'Hey Mobile.'})).toBeVisible();await expect(main.locator('.m-section-count')).toHaveText('2');
 await expect(main.locator('.m-dashboard-widgets > [data-widget-id]')).toHaveCount(2);await expect(main.locator('.m-dashboard-widget-actions').getByRole('button',{name:'Done',exact:true})).toBeVisible();
 await expect(main.getByRole('button',{name:'Reset layout',exact:true})).toBeVisible();await expect(main.locator('[data-widget-id="mobile-sources"]')).toHaveAttribute('draggable','true');
 await expect(main.getByRole('button',{name:'Move Body sources up',exact:true})).toBeDisabled();await expect(main.getByRole('button',{name:'Move Genome down',exact:true})).toBeDisabled();
 await expect(main.locator('.dashboard-lab-date-range')).toBeVisible();
 for(const width of [390,640,799]){await page.setViewportSize({width,height:844});for(const theme of ['dark','light','glass']){
  await page.evaluate(async theme=>(await import('/js/theme.js')).setTheme(theme),theme);expect(await main.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
 }}
 const labs=main.getByRole('button',{name:'Labs',exact:true});await labs.focus();await page.keyboard.press('Enter');await expect(labs).toHaveAttribute('aria-current','page');await expect(main).toHaveAttribute('data-mobile-calls',/navigate:labs/);
 await expect(main).toHaveAttribute('data-mobile-calls',/^\["drop-zone","tips","commit","cache"/);expect(errors).toEqual([]);
});

test('whole mobile page hydration preserves existing SSR elements text listeners and outside content',async({page})=>{
 await page.route('**/mobile-page-hydration-acceptance',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><button id="outside">Outside</button><main id="main-content"></main></body></html>'}));
 await page.goto('/mobile-page-hydration-acceptance');
 const result=await page.evaluate(async()=>{
  const [{renderMobileDashboardPage},{projectLabDateRange},{projectDashboardWidgetFrame},native]=await Promise.all([
   import('/js/mobile-dashboard-presentation.js'),import('/js/lab-date-range-presentation.js'),import('/js/dashboard-widget-presentation.js'),import('/js/components/MobileDashboardPage.svelte.native.js'),
  ]);
  const entries=[{def:{id:'hydration-source',title:'Source',size:'full'},content:{kind:'body-sources' as const,view:{empty:true,sources:[]}}}];
  const view={firstName:'Mobile',greetingSub:'0 markers · 1 draw',range:projectLabDateRange('all',true),stack:{count:'1',actions:{organizeLabel:'Customize' as const,showReset:false},hasEntries:true,widgets:entries.map((entry,index)=>projectDashboardWidgetFrame(entry,{order:[],hidden:[]},index,entries,false))}};
  const main=document.getElementById('main-content')!,outside=document.getElementById('outside')!;main.innerHTML=renderMobileDashboardPage(view);
  const nodes=()=>{const walker=document.createTreeWalker(main,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);const found:Node[]=[];for(let node=walker.nextNode();node;node=walker.nextNode())if(node.nodeType===Node.ELEMENT_NODE||node.textContent)found.push(node);return found;};
  const before=nodes();let clicks=0;const home=main.querySelector<HTMLButtonElement>('[data-mobile-dashboard-tab="dashboard"]')!;home.addEventListener('click',()=>clicks++);home.dataset.retained='listener';
  const owner=native.hydrate(native.default,{target:main,props:{view},recover:false});native.flushSync();const after=nodes();
  const identity=before.length===after.length&&before.every((node,index)=>node===after[index]&&node.isConnected);home.click();
  const result={identity,elements:before.filter(n=>n.nodeType===Node.ELEMENT_NODE).length,textNodes:before.filter(n=>n.nodeType===Node.TEXT_NODE).length,listenerRetained:clicks===1&&home.dataset.retained==='listener',outsideRetained:outside.isConnected&&outside.textContent==='Outside',removed:false,outsideAfterCleanup:false};
  await native.unmount(owner);native.flushSync();result.removed=before.every(node=>!node.isConnected);result.outsideAfterCleanup=outside.isConnected;return result;
 });
 expect(result.identity).toBe(true);expect(result.elements).toBeGreaterThan(30);expect(result.textNodes).toBeGreaterThan(10);expect(result.listenerRetained).toBe(true);expect(result.outsideRetained).toBe(true);expect(result.removed).toBe(true);expect(result.outsideAfterCleanup).toBe(true);
});
