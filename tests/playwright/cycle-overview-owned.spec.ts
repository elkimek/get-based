import fs from 'node:fs';
import postcss from 'postcss';
import type {Page} from '@playwright/test';
import {expect,test} from './coverage-fixture.js';
import {prepareDemoProfile} from './biology-score-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
test.use({timezoneId:'UTC'});
interface Sample {kind:string;name:string;input:{mc:unknown;profileDob:string|null;data:unknown;opts?:unknown};html:string}
interface StyleBlock {file:string;order:number;css:string;atRules:{name:string;params:string}[]}
interface PairHost extends HTMLElement {pairs:HTMLElement[]}
const frozen=JSON.parse(fs.readFileSync('tests/fixtures/cycle-overview-original.json','utf8')) as {revision:string;fixedNow:string;timezone:string;samples:Sample[];styleFiles:string[];stylePlacements:{file:string;anchor:string|null}[];styleBlocks:StyleBlock[]};
if(frozen.revision!=='4d88598e7b518cd5d7b20738e58568c4fe3c16ce')throw new Error('Wrong original Cycle overview revision');
if(frozen.timezone!=='UTC')throw new Error('Wrong original Cycle overview timezone');
const scopeOriginal=(block:StyleBlock)=>{const tree=postcss.parse(block.css);tree.walkRules(rule=>{rule.selector=rule.selectors.map(selector=>{const ancestor=selector.match(/^((?:html|body)[^\s>+~]*)\s+(.+)$/);return ancestor?`${ancestor[1]} :where([data-original]) ${ancestor[2]}`:`:where([data-original]) ${selector}`;}).join(',');});return block.atRules.reduceRight((css,at)=>`@${at.name} ${at.params}{${css}}`,tree.toString());};
if(new Set(frozen.styleBlocks.map(block=>block.file+'/'+block.order)).size!==frozen.styleBlocks.length)throw new Error('Duplicate original stylesheet ordinal');
const originalStyles=frozen.styleFiles.map(file=>({file,css:frozen.styleBlocks.filter(block=>block.file===file).sort((a,b)=>a.order-b.order).map(scopeOriginal).join('\n')}));
const widths=[320,480,767,768,769,1100,1440],themes=['default','dark','light','glass','synth-sunrise','neuromancer','cyberterm'];
const properties=[
 'display','position','top','bottom','z-index','width','height','min-width','min-height','max-width','max-height',
 'font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-transform',
 'color','background-color','background-image','border-top-width','border-right-width','border-bottom-width','border-left-width',
 'border-top-color','border-right-color','border-bottom-color','border-left-color','border-top-style','border-right-style','border-bottom-style','border-left-style','border-radius',
 'padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left',
 'gap','grid-template-columns','align-items','justify-content','flex-direction','flex-basis','flex-grow','flex-shrink','flex-wrap','order',
 'overflow-x','overflow-y','white-space','overflow-wrap','text-overflow','box-shadow','backdrop-filter','overscroll-behavior',
 'scrollbar-gutter','text-align','text-decoration','cursor','stroke','stroke-width','stroke-linecap','stroke-linejoin','fill',
 'font-variant','font-stretch','transform','-webkit-line-clamp','-webkit-box-orient',
];

async function mountPairs(page:Page,samples:Sample[]){
 await installDiscussionFixture(page.context(),{provider:'openrouter',paused:true});
 await prepareDemoProfile(page);await page.emulateMedia({reducedMotion:'reduce'});await page.clock.setFixedTime(new Date(frozen.fixedNow));
 const prepared=await page.evaluate(async()=>(await import('/js/views.js')).navigate('body'));
 expect(prepared,'Actual Body route prepares synchronous widget chrome').toBe(true);
 await page.evaluate(async({samples,originalStyles,placements})=>{
  for(const {file,anchor}of placements){
   const href='/'+file;
   if([...document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].some(link=>new URL(link.href).pathname===href))continue;
   await new Promise<void>((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.onload=()=>resolve();link.onerror=()=>reject(new Error(href));if(anchor){const before=document.querySelector(anchor);if(!before)throw new Error('Missing stylesheet anchor '+anchor);before.before(link);}else document.head.append(link);});
  }
  const [{state},cycle,runtime,controlsModule]=await Promise.all([import('/js/state.js'),import('/js/cycle.js'),import('/js/cycle-runtime.js'),import('/js/dashboard-widget-controls.js')]);
  const fixtureShell=await import('/tests/helpers/lens-chrome-fixture.js');await runtime.loadCycleStylesheetForAction();
  const saved={data:state.importedData,dob:state.profileDob};
  const controls=controlsModule.createDashboardWidgetControls({state});
  const host:PairHost=Object.assign(document.createElement('div'),{pairs:[] as HTMLElement[]});host.id='cycle-overview-parity';host.style.cssText='position:fixed;inset:0;background:var(--bg-primary);z-index:20000;overflow:auto';document.body.append(host);
  const wrap=(html:string,placement:string)=>{
   if(placement==='body-full')return fixtureShell.renderLensPageWidgetsChromeFixture('body',[{id:'cycle',title:'Cycle',description:'Menstrual cycle context',body:html,size:'full'}]);
   const size=placement==='dashboard-half'?'half':'full';
   const entry={def:{id:'cycle',source:'Body',title:'Cycle',description:'Menstrual cycle context',size},body:html};
   return '<div class="dashboard-widgets">'+fixtureShell.renderDashboardWidgetChromeFixture(controls,entry,{hidden:[],order:[]},0,[entry])+'</div>';
  };
  try{for(const sample of samples){
   state.importedData={menstrualCycle:structuredClone(sample.input.mc??null)} as typeof state.importedData;
   state.profileDob=sample.input.profileDob??null;
   const data=structuredClone(sample.input.data??null) as Parameters<typeof cycle.renderMenstrualCycleSection>[0],opts=sample.input.opts as Parameters<typeof cycle.renderMenstrualCycleSection>[1];
   const html=cycle.renderMenstrualCycleSection(data,opts),timing=cycle.projectMenstrualCycleSection(data,opts).measurementTiming;
   // Compare every pre-existing node/style against its immutable receipt. The
   // additive timing note has separate real-page acceptance in body-measurement.spec.ts.
   const compatible=document.createElement('div');compatible.innerHTML=html;
   const added=compatible.querySelectorAll('[data-cycle-body-timing]');
   if(added.length!==(timing?1:0))throw new Error('Cycle measurement timing presence '+sample.name);
   if(timing){const note=added[0]!;if(note.querySelector('strong')?.textContent!==`Waist & abdominal depth · ${timing.heading.toLowerCase()}`||note.querySelector('small')?.textContent!==timing.hint||(note.querySelector('.cycle-draw-copy > span')?.textContent??null)!==timing.dateLabel)throw new Error('Cycle measurement timing content '+sample.name);note.remove();}
   for(const placement of ['body-full','dashboard-half','dashboard-full']){
    const pair=document.createElement('div');pair.dataset.name=sample.name+'/'+placement;pair.style.cssText='position:absolute;inset:0;padding:12px';
    for(const[kind,content]of[['original',sample.html],['current',compatible.innerHTML]]){const side=document.createElement('section');side.dataset[kind!]='';side.style.cssText='position:absolute;inset:0;padding:12px';side.innerHTML=wrap(content!,placement);pair.append(side);}
    host.pairs.push(pair);
   }
  }}finally{state.importedData=saved.data;state.profileDob=saved.dob;}
  for(const{file,css}of originalStyles){const link=[...document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].find(link=>new URL(link.href).pathname==='/'+file);if(!link)throw new Error('Missing original stylesheet position '+file);const style=document.createElement('style');style.dataset.originalStylesheet=file;style.textContent=css;link.after(style);}
  const style=document.createElement('style');style.textContent='#cycle-overview-parity *,#cycle-overview-parity *::before,#cycle-overview-parity *::after{transition:none!important;animation:none!important}';document.head.append(style);
  await document.fonts.ready;
 },{samples,originalStyles,placements:frozen.stylePlacements});
}
async function setTheme(page:Page,theme:string){await page.evaluate(async theme=>{if(theme==='default')document.documentElement.removeAttribute('data-theme');else(await import('/js/theme.js')).setTheme(theme);await document.fonts.ready;},theme);}
async function compareAll(page:Page){return page.locator('#cycle-overview-parity').evaluate((element,properties)=>{
 const host=element as PairHost,problems:string[]=[];
 for(const pair of host.pairs){host.replaceChildren(pair);
  const old=[...pair.querySelector('[data-original]')!.querySelectorAll('*')],now=[...pair.querySelector('[data-current]')!.querySelectorAll('*')];
  if(old.length!==now.length){problems.push(`${pair.dataset.name}: ${old.length}/${now.length} nodes`);continue;}
  const snapshot=(node:Element)=>{const css=getComputedStyle(node);return Object.fromEntries(properties.map(property=>[property,css.getPropertyValue(property)]));};
  const before=old.map(snapshot),after=now.map(snapshot),a=old.map(node=>node.getBoundingClientRect()),b=now.map(node=>node.getBoundingClientRect());
  old.forEach((node,index)=>{const next=now[index]!;if(node.tagName!==next.tagName)problems.push(`${pair.dataset.name}/${index}/tag`);
   for(const property of properties)if(before[index]![property]!==after[index]![property])problems.push(`${pair.dataset.name}/${index}/${node.tagName}/${property}: ${after[index]![property]} != ${before[index]![property]}`);
   if(a[index]!.x!==b[index]!.x||a[index]!.y!==b[index]!.y||a[index]!.width!==b[index]!.width||a[index]!.height!==b[index]!.height)problems.push(`${pair.dataset.name}/${index}/bounds: ${JSON.stringify(b[index])} != ${JSON.stringify(a[index])}`);
   if(node instanceof HTMLElement&&node.hidden!==(next as HTMLElement).hidden)problems.push(`${pair.dataset.name}/${index}/hidden`);
  });
 }
 return problems;
},properties);}
const overviews=()=>frozen.samples.filter(sample=>sample.kind==='overview');
for(const theme of themes){
 test('authored Cycle overview preserves original full and compact geometry / '+theme,async({page},info)=>{
  test.setTimeout(180000);const samples=overviews();await mountPairs(page,samples);await setTheme(page,theme);let comparisons=0;
  for(const width of widths){await page.setViewportSize({width,height:1000});await page.mouse.move(0,0);expect(await compareAll(page),`${width}/${theme}`).toEqual([]);comparisons+=samples.length*3;}
  fs.writeFileSync(info.outputPath('cycle-overview-geometry.json'),JSON.stringify({samples:samples.length,placements:['body-full','dashboard-half','dashboard-full'],comparisons,widths,themes:[theme],properties},null,2));
 });
}
const interactionNames=['unset','many-periods-full-caps-order','recorded-all-phases-priority-source-detail','perimenopause-plus-ordered-critical-warning'];
for(const theme of themes){
 test('authored Cycle overview preserves keyboard focus in full and compact production wrappers / '+theme,async({page},info)=>{
  test.setTimeout(60000);const samples=overviews().filter(sample=>interactionNames.some(name=>sample.name===name||sample.name===name+'-dashboard'));
  expect(samples).toHaveLength(8);await mountPairs(page,samples);await setTheme(page,theme);let checks=0;
  for(const width of [320,1440]){
   await page.setViewportSize({width,height:1000});await page.mouse.move(0,0);await page.keyboard.press('Tab');
   checks+=await page.locator('#cycle-overview-parity').evaluate((element,properties)=>{
    const host=element as PairHost;let count=0;
    for(const pair of host.pairs){
     host.replaceChildren(pair);const original=pair.querySelector<HTMLElement>('[data-original]')!,current=pair.querySelector<HTMLElement>('[data-current]')!;
     const before=[...original.querySelectorAll<HTMLElement>('.cycle-section button')],after=[...current.querySelectorAll<HTMLElement>('.cycle-section button')];
     if(before.length!==after.length)throw new Error('Focus button topology '+pair.dataset.name);
     for(let index=0;index<before.length;index++){
      const control=before[index]!;if(!control.getClientRects().length)continue;
      original.style.visibility='visible';current.style.visibility='hidden';control.focus({preventScroll:true});
      if(document.activeElement!==control||!control.matches(':focus-visible')||control.matches(':hover'))throw new Error('Original keyboard focus not isolated '+pair.dataset.name);
      const style=getComputedStyle(control),prior=Object.fromEntries(properties.map(property=>[property,style.getPropertyValue(property)]));
      original.style.visibility='hidden';current.style.visibility='visible';const next=after[index]!;next.focus({preventScroll:true});
      if(document.activeElement!==next||!next.matches(':focus-visible')||next.matches(':hover'))throw new Error('Authored keyboard focus not isolated '+pair.dataset.name);
      const css=getComputedStyle(next),now=Object.fromEntries(properties.map(property=>[property,css.getPropertyValue(property)]));
      if(JSON.stringify(prior)!==JSON.stringify(now))throw new Error(`${pair.dataset.name}/${index}/focus: ${JSON.stringify(now)} != ${JSON.stringify(prior)}`);count++;
     }
     original.style.visibility='visible';current.style.visibility='visible';
    }
    return count;
   },[...properties,'outline-width','outline-style','outline-color','outline-offset']);
  }
  fs.writeFileSync(info.outputPath('cycle-overview-focus.json'),JSON.stringify({samples:samples.length,checks,widths:[320,1440],themes:[theme]},null,2));
 });
}

// Keep pointer work separate from the accepted geometry/focus loops. Each case
// has at most 15 genuine controls, one theme, one viewport and one pointer state.
type OverviewPointerSide='original'|'current';
type OverviewPointerState='hover'|'active';
interface OverviewPointerPlan {pair:number;index:number;name:string;action:string;text:string}
const pointerSampleNames=['unset','perimenopause-plus-ordered-critical-warning'];
const pointerProperties=[...properties,'outline-width','outline-style','outline-color','outline-offset'];
async function installOverviewPointerPlan(page:Page):Promise<OverviewPointerPlan[]>{
 return page.locator('#cycle-overview-parity').evaluate(element=>{
  const host=element as PairHost,plan:OverviewPointerPlan[]=[];
  // A failed gesture must never open an editor/file chooser or run a tour. The
  // guard is an assertion of zero action clicks, not a replacement interaction.
  Object.assign(host,{actionClicks:[] as string[]});
  host.addEventListener('click',event=>{
   const target=event.target instanceof Element?event.target.closest('[data-cycle-action],[data-cycle-import-action]'):null;
   if(!target)return;
   (host as PairHost&{actionClicks:string[]}).actionClicks.push(target.getAttribute('data-cycle-action')||target.getAttribute('data-cycle-import-action')||'');
   event.preventDefault();event.stopImmediatePropagation();
  },true);
  host.pairs.forEach((pair,pairIndex)=>{
   const original=pair.querySelector<HTMLElement>('[data-original]')!,current=pair.querySelector<HTMLElement>('[data-current]')!;
   // Only interaction cases receive independent scroll owners. The geometry
   // and keyboard-focus fixture remains byte-identical to its existing harness.
   for(const side of [original,current]){side.style.overflow='auto';side.style.overscrollBehavior='contain';}
   const before=[...original.querySelectorAll<HTMLButtonElement>('.cycle-section button')],after=[...current.querySelectorAll<HTMLButtonElement>('.cycle-section button')];
   if(before.length!==after.length)throw new Error('Overview pointer topology '+pair.dataset.name);
   before.forEach((control,index)=>{
    const next=after[index]!,action=control.getAttribute('data-cycle-action')||control.getAttribute('data-cycle-import-action')||'';
    const texts=(node:Element)=>[node,...node.querySelectorAll('*')].map(element=>[...element.childNodes].filter(child=>child.nodeType===Node.TEXT_NODE).map(child=>child.textContent).join('').replace(/\s+/g,' ').trim());
    if(next.getAttribute('data-cycle-action')!==control.getAttribute('data-cycle-action')||next.getAttribute('data-cycle-import-action')!==control.getAttribute('data-cycle-import-action')||JSON.stringify(texts(next))!==JSON.stringify(texts(control))||next.disabled!==control.disabled)throw new Error('Overview pointer control contract '+pair.dataset.name+'/'+index);
    plan.push({pair:pairIndex,index,name:pair.dataset.name!,action,text:control.textContent||''});
   });
  });
  return plan;
 });
}
async function prepareOverviewPointer(page:Page,target:OverviewPointerPlan,side:OverviewPointerSide):Promise<{x:number;y:number}>{
 return page.evaluate(({target,side})=>{
  const host=document.getElementById('cycle-overview-parity') as PairHost|null,pair=host?.pairs[target.pair];
  if(!host||!pair)throw new Error('Missing overview pointer pair '+target.name);
  if(host.firstElementChild!==pair){host.replaceChildren(pair);host.scrollTop=0;host.scrollLeft=0;}
  const original=pair.querySelector<HTMLElement>('[data-original]')!,current=pair.querySelector<HTMLElement>('[data-current]')!;
  original.style.visibility=side==='original'?'visible':'hidden';current.style.visibility=side==='current'?'visible':'hidden';
  const control=(side==='original'?original:current).querySelectorAll<HTMLButtonElement>('.cycle-section button')[target.index];
  if(!control||control.disabled)throw new Error('Missing or disabled overview pointer control '+target.name+'/'+target.index);
  control.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
  const box=control.getBoundingClientRect(),css=getComputedStyle(control),point={x:box.x+box.width/2,y:box.y+box.height/2};
  if(css.visibility!=='visible'||css.display==='none'||box.width<=0||box.height<=0)throw new Error('Overview pointer control is not visible '+side+'/'+target.name+'/'+target.index);
  const hit=document.elementFromPoint(point.x,point.y);
  if(!hit||!(hit===control||control.contains(hit)))throw new Error('Overview pointer control not hit-testable '+side+'/'+target.name+'/'+target.index);
  return point;
 },{target,side});
}
async function waitForOverviewPointerState(page:Page,target:OverviewPointerPlan,side:OverviewPointerSide,pointerState:OverviewPointerState,point:{x:number;y:number}):Promise<void>{
 // Input delivery and WebKit's pseudo-class update can complete on different
 // frames. Wait for the one real gesture; never repeat it or force CSS state.
 try{
  await page.waitForFunction(({target,side,pointerState,point})=>{
   const control=document.querySelector('#cycle-overview-parity [data-'+side+']')?.querySelectorAll<HTMLButtonElement>('.cycle-section button')[target.index];
   const hit=document.elementFromPoint(point.x,point.y);
   return !!control&&!!hit&&(hit===control||control.contains(hit))&&control.matches(':hover')&&(pointerState==='active'?control.matches(':active'):!control.matches(':active'));
  },{target,side,pointerState,point},{polling:'raf',timeout:3000});
 }catch(error){
  const diagnostic=await page.evaluate(({target,side,point})=>{
   const control=document.querySelector('#cycle-overview-parity [data-'+side+']')?.querySelectorAll<HTMLButtonElement>('.cycle-section button')[target.index];
   const hit=document.elementFromPoint(point.x,point.y),css=control?getComputedStyle(control):null;
   return {hover:control?.matches(':hover'),active:control?.matches(':active'),hit:hit?.tagName,hitAction:hit?.closest('[data-cycle-action],[data-cycle-import-action]')?.getAttribute('data-cycle-action'),rect:control?.getBoundingClientRect().toJSON(),point,focused:document.activeElement?.tagName,focusedAction:document.activeElement?.getAttribute('data-cycle-action'),scrollX:window.scrollX,scrollY:window.scrollY,visibility:css?.visibility,display:css?.display};
  },{target,side,point});
  throw new Error('Real overview pointer synchronization failed '+side+'/'+target.name+'/'+target.index+'/'+pointerState+': '+JSON.stringify(diagnostic),{cause:error});
 }
}
async function overviewPointerSnapshot(page:Page,target:OverviewPointerPlan,side:OverviewPointerSide,pointerState:OverviewPointerState,point:{x:number;y:number}):Promise<Record<string,string>>{
 // Capture in the same frame that observes the genuine pseudo-state. A second
 // browser callback can otherwise measure after WebKit has changed that state.
 const handle=await page.waitForFunction(({target,side,pointerState,point,properties})=>{
  const control=document.querySelector('#cycle-overview-parity [data-'+side+']')?.querySelectorAll<HTMLButtonElement>('.cycle-section button')[target.index];
  if(!control)throw new Error('Missing overview pointer snapshot '+side+'/'+target.name+'/'+target.index);
  const hit=document.elementFromPoint(point.x,point.y);
  if(!hit||!(hit===control||control.contains(hit))||!control.matches(':hover')||(pointerState==='active'?!control.matches(':active'):control.matches(':active')))return null;
  const css=getComputedStyle(control),snapshot=Object.fromEntries(properties.map(property=>[property,css.getPropertyValue(property)]));
  const measuredHit=document.elementFromPoint(point.x,point.y);
  if(!measuredHit||!(measuredHit===control||control.contains(measuredHit)))throw new Error('Real overview pointer target changed during capture '+side+'/'+target.name+'/'+target.index+'/'+pointerState);
  if(!control.matches(':hover')||(pointerState==='active'&&!control.matches(':active')))throw new Error('Real overview pointer state absent during capture '+side+'/'+target.name+'/'+target.index+'/'+pointerState+': '+JSON.stringify({hover:control.matches(':hover'),active:control.matches(':active'),point,rect:control.getBoundingClientRect().toJSON()}));
  if(pointerState==='hover'&&control.matches(':active'))throw new Error('Overview hover snapshot has unexpected active state '+side+'/'+target.name+'/'+target.index);
  return snapshot;
 },{target,side,pointerState,point,properties:pointerProperties},{polling:'raf',timeout:3000});
 try{
  const snapshot=await handle.jsonValue();
  if(!snapshot)throw new Error('Missing genuine overview pointer snapshot');
  return snapshot;
 }finally{await handle.dispose();}
}

interface OverviewPressedCapture {events:number;snapshot:Record<string,string>|null;error:string|null;trusted:boolean}
interface OverviewPressedHost extends PairHost {pressedCapture:OverviewPressedCapture}
async function armOverviewPressedCapture(page:Page,target:OverviewPointerPlan,side:OverviewPointerSide,point:{x:number;y:number}):Promise<void>{
 await page.evaluate(({target,side,point,properties})=>{
  const host=document.getElementById('cycle-overview-parity') as OverviewPressedHost|null;
  if(!host)throw new Error('Missing overview pressed capture host');
  host.pressedCapture={events:0,snapshot:null,error:null,trusted:false};
  document.addEventListener('mousedown',event=>{
   const capture=host.pressedCapture;capture.events++;capture.trusted=event.isTrusted;
   const control=host.querySelector('[data-'+side+']')?.querySelectorAll<HTMLButtonElement>('.cycle-section button')[target.index];
   const diagnostic=()=>JSON.stringify({side,name:target.name,index:target.index,trusted:event.isTrusted,button:event.button,buttons:event.buttons,clientX:event.clientX,clientY:event.clientY,hover:control?.matches(':hover'),active:control?.matches(':active'),point,rect:control?.getBoundingClientRect().toJSON(),eventTarget:event.target instanceof Element?event.target.tagName:null,focused:document.activeElement?.tagName});
   try{
    if(!control)throw new Error('Missing overview pressed event control');
    const hit=document.elementFromPoint(point.x,point.y),eventHit=document.elementFromPoint(event.clientX,event.clientY);
    if(!eventHit||!(eventHit===control||control.contains(eventHit)))throw new Error('Genuine overview pressed event hit target absent');
    if(!event.isTrusted||event.button!==0||event.buttons!==1||!(event.target instanceof Node)||!control.contains(event.target)||!hit||!(hit===control||control.contains(hit))||!control.matches(':hover')||!control.matches(':active'))throw new Error('Genuine overview pressed event contract absent');
    const css=getComputedStyle(control),snapshot=Object.fromEntries(properties.map(property=>[property,css.getPropertyValue(property)]));
    const measuredHit=document.elementFromPoint(point.x,point.y),measuredEventHit=document.elementFromPoint(event.clientX,event.clientY);
    if(!measuredEventHit||!(measuredEventHit===control||control.contains(measuredEventHit)))throw new Error('Genuine overview pressed event hit target changed during capture');
    if(!measuredHit||!(measuredHit===control||control.contains(measuredHit))||!control.matches(':hover')||!control.matches(':active'))throw new Error('Genuine overview pressed event state changed during capture');
    capture.snapshot=snapshot;
   }catch(error){capture.error=(error instanceof Error?error.message:String(error))+': '+diagnostic();}
  },{capture:true,once:true});
 },{target,side,point,properties:pointerProperties});
}
async function readOverviewPressedCapture(page:Page):Promise<Record<string,string>>{
 await page.waitForFunction(()=>{const host=document.getElementById('cycle-overview-parity') as OverviewPressedHost|null;return host?.pressedCapture.events===1;},{},{polling:'raf',timeout:3000});
 const capture=await page.locator('#cycle-overview-parity').evaluate(element=>(element as OverviewPressedHost).pressedCapture);
 expect(capture.events).toBe(1);expect(capture.trusted).toBe(true);
 if(capture.error||!capture.snapshot)throw new Error(capture.error||'Missing trusted overview pressed styles');
 return capture.snapshot;
}
for(const theme of themes){for(const width of [320,1440]){for(const name of pointerSampleNames){for(const pointerState of ['hover','active'] as const){
 test('authored Cycle overview preserves real '+pointerState+' in full and compact wrappers / '+theme+' / '+width+' / '+name,async({page,browserName},info)=>{
  test.setTimeout(60000);const samples=overviews().filter(sample=>sample.name===name||sample.name===name+'-dashboard');expect(samples).toHaveLength(2);
  await mountPairs(page,samples);await page.setViewportSize({width,height:1000});await setTheme(page,theme);await page.mouse.move(0,0);
  const plan=await installOverviewPointerPlan(page);expect(plan).toHaveLength(name==='unset'?12:15);let checks=0;
  // WPE exposes the genuine pressed state during trusted mousedown. Firefox
  // applies it after dispatch; its atomic post-delivery path remains separate.
  const eventPress=pointerState==='active'&&browserName==='webkit';
  for(const target of plan){
   const snapshots:Record<string,string>[]=[];
   for(const side of ['original','current'] as const){
    const point=await prepareOverviewPointer(page,target,side);await page.mouse.move(point.x,point.y);
    await waitForOverviewPointerState(page,target,side,'hover',point);
    if(eventPress)await armOverviewPressedCapture(page,target,side,point);
    if(pointerState==='active')await page.mouse.down();
    try{
     snapshots.push(eventPress?await readOverviewPressedCapture(page):await overviewPointerSnapshot(page,target,side,pointerState,point));
    }
    finally{
     // Releasing off the button prevents a real click/delegate. Assert the safe
     // release location before mouseup; never synthesize CSS pseudo-classes.
     await page.mouse.move(0,0);
     if(pointerState==='active'){
      expect(await page.evaluate(()=>{const hit=document.elementFromPoint(0,0);return !hit?.closest('[data-cycle-action],[data-cycle-import-action]');})).toBe(true);
      await page.mouse.up();
     }
    }
   }
   expect(snapshots[1],`${theme}/${width}/${target.name}/${target.index}/${pointerState}`).toEqual(snapshots[0]);checks++;
  }
  expect(await page.locator('#cycle-overview-parity').evaluate(element=>(element as PairHost&{actionClicks:string[]}).actionClicks)).toEqual([]);
  fs.writeFileSync(info.outputPath('cycle-overview-pointer.json'),JSON.stringify({samples:samples.map(sample=>sample.name),placements:['body-full','dashboard-half','dashboard-full'],checks,activeChecks:pointerState==='active'?checks:0,pointerState,widths:[width],themes:[theme],controls:plan,properties:pointerProperties,delegatedActionClicks:0,trustedPressEvents:eventPress?checks*2:0,pressSampling:pointerState==='hover'?'hover-atomic':eventPress?'trusted-mousedown':'post-delivery-atomic'},null,2));
 });
}}}}

interface FractionalViewportEvidence {requested:number;frameWidth:number;innerWidth:number;clientWidth:number;visualWidth:number|null;mediaWidthQueries:{width:number;matches:boolean}[];effectiveMediaWidth:number;exactWidthQuery:boolean;phone:boolean;wide:boolean}
async function createFractionalOverviewFrame(page:Page){
 await page.evaluate(async()=>{
  const parentHost=document.getElementById('cycle-overview-parity') as PairHost|null;if(!parentHost)throw new Error('Missing overview fractional fixture');
  const iframe=document.createElement('iframe');iframe.id='cycle-overview-fractional';iframe.title='Cycle overview measured iframe viewport parity';iframe.style.cssText='position:fixed;top:0;left:0;width:767.5px;height:1000px;border:0;padding:0;margin:0;min-width:0;max-width:none;box-sizing:content-box;transition:none!important;animation:none!important;z-index:20001';
  const stylesheetMarkup=[...document.head.querySelectorAll('link[rel="stylesheet"],style')].map(node=>node.outerHTML).join('\n');
  const loaded=new Promise<void>((resolve,reject)=>{iframe.onload=()=>resolve();iframe.onerror=()=>reject(new Error('Fractional overview frame failed to load'));});
  iframe.srcdoc='<!doctype html><html><head><base href="'+document.baseURI.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'">'+stylesheetMarkup+'</head><body></body></html>';document.body.append(iframe);await loaded;
  const doc=iframe.contentDocument!,win=iframe.contentWindow!;
  for(const attr of [...document.documentElement.attributes])doc.documentElement.setAttribute(attr.name,attr.value);
  for(const attr of [...document.body.attributes])doc.body.setAttribute(attr.name,attr.value);
  for(const link of doc.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))if(!link.sheet)throw new Error('Fractional viewport stylesheet not loaded '+link.href);
  const host:PairHost=Object.assign(doc.createElement('div'),{pairs:parentHost.pairs.map(pair=>doc.importNode(pair,true))});host.id=parentHost.id;host.style.cssText=parentHost.style.cssText;host.append(...host.pairs);doc.body.append(host);
  // Mount all frozen/current pairs before awaiting fonts so every font used by
  // the compared production wrappers has been requested in this frame.
  await doc.fonts.ready;await new Promise<void>(resolve=>win.requestAnimationFrame(()=>win.requestAnimationFrame(()=>resolve())));
 });
}
async function fractionalOverviewParity(page:Page,width:number):Promise<{viewport:FractionalViewportEvidence;problems:string[];comparisons:number}>{
 return page.evaluate(async({width,properties})=>{
  const iframe=document.getElementById('cycle-overview-fractional') as HTMLIFrameElement|null;if(!iframe?.contentDocument||!iframe.contentWindow)throw new Error('Missing fractional overview frame');
  iframe.style.width=width+'px';const doc=iframe.contentDocument,win=iframe.contentWindow as Window&typeof globalThis;await new Promise<void>(resolve=>win.requestAnimationFrame(()=>win.requestAnimationFrame(()=>resolve())));
  // Probe distinct exact equality queries. Rounded JS dimensions are evidence
  // only: they never decide which CSS media viewport the engine actually uses.
  const mediaWidthQueries=[...new Set([width,Math.floor(width),Math.ceil(width)])].map(candidate=>({width:candidate,matches:win.matchMedia(`(width: ${candidate}px)`).matches}));
  const matches=mediaWidthQueries.filter(query=>query.matches);
  if(matches.length!==1)throw new Error('Expected exactly one measured CSS media width: '+JSON.stringify(mediaWidthQueries));
  const effectiveMediaWidth=matches[0]!.width;
  const viewport:FractionalViewportEvidence={requested:width,frameWidth:iframe.getBoundingClientRect().width,innerWidth:win.innerWidth,clientWidth:doc.documentElement.clientWidth,visualWidth:win.visualViewport?.width??null,mediaWidthQueries,effectiveMediaWidth,exactWidthQuery:effectiveMediaWidth===width,phone:win.matchMedia('(max-width: 768px)').matches,wide:win.matchMedia('(width > 768px)').matches};
  const host=doc.getElementById('cycle-overview-parity') as PairHost|null;if(!host)throw new Error('Missing fractional pair host');const problems:string[]=[];
  for(const pair of host.pairs){host.replaceChildren(pair);
   const before=[...pair.querySelector('[data-original]')!.querySelectorAll('*')],after=[...pair.querySelector('[data-current]')!.querySelectorAll('*')];
   if(before.length!==after.length){problems.push(pair.dataset.name+': '+before.length+'/'+after.length+' nodes');continue;}
   const snapshot=(node:Element)=>{const css=win.getComputedStyle(node);return Object.fromEntries(properties.map(property=>[property,css.getPropertyValue(property)]));};
   const prior=before.map(snapshot),current=after.map(snapshot),a=before.map(node=>node.getBoundingClientRect()),b=after.map(node=>node.getBoundingClientRect());
   before.forEach((node,index)=>{const next=after[index]!;if(node.tagName!==next.tagName)problems.push(pair.dataset.name+'/'+index+'/tag');
    for(const property of properties)if(prior[index]![property]!==current[index]![property])problems.push(`${pair.dataset.name}/${index}/${node.tagName}/${property}: ${current[index]![property]} != ${prior[index]![property]}`);
    if(a[index]!.x!==b[index]!.x||a[index]!.y!==b[index]!.y||a[index]!.width!==b[index]!.width||a[index]!.height!==b[index]!.height)problems.push(`${pair.dataset.name}/${index}/bounds: ${JSON.stringify(b[index])} != ${JSON.stringify(a[index])}`);
    if(node instanceof win.HTMLElement&&node.hidden!==(next as HTMLElement).hidden)problems.push(pair.dataset.name+'/'+index+'/hidden');
   });
  }
  return {viewport,problems,comparisons:host.pairs.length};
 },{width,properties});
}
for(const theme of themes){
 test('authored Cycle overview preserves measured iframe viewport rounding and inclusive 768px boundary / '+theme,async({page},info)=>{
  test.setTimeout(60000);const samples=overviews().filter(sample=>interactionNames.some(name=>sample.name===name||sample.name===name+'-dashboard'));expect(samples).toHaveLength(8);
  await mountPairs(page,samples);await page.setViewportSize({width:1100,height:1000});await setTheme(page,theme);await page.mouse.move(0,0);await createFractionalOverviewFrame(page);
  const viewports:FractionalViewportEvidence[]=[];let comparisons=0;
  for(const width of [767.5,768.5]){
   const result=await fractionalOverviewParity(page,width);viewports.push(result.viewport);
   expect(result.viewport.frameWidth,'Actual iframe border-box width').toBe(width);
   expect(result.viewport.mediaWidthQueries.map(query=>query.width)).toEqual([...new Set([width,Math.floor(width),Math.ceil(width)])]);
   expect(result.viewport.mediaWidthQueries.filter(query=>query.matches)).toEqual([{width:result.viewport.effectiveMediaWidth,matches:true}]);
   expect(result.viewport.exactWidthQuery).toBe(result.viewport.effectiveMediaWidth===width);
   expect(result.viewport.phone).toBe(result.viewport.effectiveMediaWidth<=768);expect(result.viewport.wide).toBe(result.viewport.effectiveMediaWidth>768);
   expect(result.problems,`${theme}/requested ${width}/measured CSS media ${result.viewport.effectiveMediaWidth}`).toEqual([]);comparisons+=result.comparisons;
  }
  expect(comparisons).toBe(48);
  expect(viewports.some(viewport=>viewport.phone)).toBe(true);expect(viewports.some(viewport=>viewport.wide)).toBe(true);
  const exactFractional=viewports.filter(viewport=>viewport.exactWidthQuery).length;
  fs.writeFileSync(info.outputPath('cycle-overview-viewport-boundary.json'),JSON.stringify({samples:samples.length,placements:['body-full','dashboard-half','dashboard-full'],comparisons,requestedWidths:[767.5,768.5],effectiveMediaWidths:viewports.map(viewport=>viewport.effectiveMediaWidth),exactFractional,roundedViewports:viewports.length-exactFractional,themes:[theme],viewports,properties,timezone:'UTC',boundaryEvidence:'Exact matchMedia equality identifies each effective CSS media width. Layout parity is checked for every original/current wrapper at the measured viewport; exact fractional parity is claimed only for viewports whose requested fractional width matches that CSS media width.'},null,2));
 });
}
