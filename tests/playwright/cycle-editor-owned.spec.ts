import fs from 'node:fs';
import postcss from 'postcss';
import type {Page} from '@playwright/test';
import {expect,test} from './coverage-fixture.js';
import {prepareDemoProfile} from './biology-score-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
interface Sample {kind:string;name:string;input:{mc:unknown};html:string}
interface StyleBlock {file:string;order:number;css:string;atRules:{name:string;params:string}[]}
interface PairHost extends HTMLElement {pairs:HTMLElement[]}
const frozen=JSON.parse(fs.readFileSync('tests/fixtures/cycle-editor-original.json','utf8')) as {revision:string;fixedNow:string;samples:Sample[];styleFiles:string[];stylePlacements:{file:string;anchor:string|null}[];styleBlocks:StyleBlock[]};
if(frozen.revision!=='9ccf0adbf8d38ecc7fa1a024b2e91b0838f99d16')throw new Error('Wrong original Cycle editor revision');
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
 'scrollbar-gutter','text-align','text-decoration','cursor','stroke','stroke-width','fill',
];
async function mountPairs(page:Page,samples:Sample[]){
 await installDiscussionFixture(page.context(),{provider:'openrouter',paused:true});
 await prepareDemoProfile(page);await page.emulateMedia({reducedMotion:'reduce'});await page.clock.setFixedTime(new Date(frozen.fixedNow));
 await page.evaluate(async({samples,originalStyles,placements})=>{
  for(const {file,anchor}of placements){
   const href='/'+file;
   if([...document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].some(link=>new URL(link.href).pathname===href))continue;
   await new Promise<void>((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.onload=()=>resolve();link.onerror=()=>reject(new Error(href));if(anchor){const before=document.querySelector(anchor);if(!before)throw new Error('Missing stylesheet anchor '+anchor);before.before(link);}else document.head.append(link);});
  }
  const [{state},cycle,runtime]=await Promise.all([import('/js/state.js'),import('/js/cycle.js'),import('/js/cycle-runtime.js')]);
  await runtime.loadCycleStylesheetForAction();
  const modal=document.getElementById('detail-modal')!,overlay=document.getElementById('modal-overlay')!;
  const saved={data:state.importedData,html:modal.innerHTML,className:modal.className};const prepared:{sample:Sample;html:string}[]=[];
  try{for(const sample of samples){state.importedData={menstrualCycle:structuredClone(sample.input.mc)} as typeof state.importedData;await cycle.openMenstrualCycleEditor();prepared.push({sample,html:modal.outerHTML});}}
  finally{state.importedData=saved.data;modal.innerHTML=saved.html;modal.className=saved.className;overlay.classList.remove('show');}
  for(const{file,css}of originalStyles){const link=[...document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].find(link=>new URL(link.href).pathname==='/'+file);if(!link)throw new Error('Missing original stylesheet position '+file);const style=document.createElement('style');style.dataset.originalStylesheet=file;style.textContent=css;link.after(style);}
  const style=document.createElement('style');style.textContent='#cycle-editor-parity *,#cycle-editor-parity *::before,#cycle-editor-parity *::after{transition:none!important;animation:none!important}';document.head.append(style);
  const host:PairHost=Object.assign(document.createElement('div'),{pairs:[] as HTMLElement[]});host.id='cycle-editor-parity';host.style.cssText='position:fixed;inset:0;background:var(--bg-primary);z-index:20000';document.body.append(host);
  for(const{sample,html}of prepared){const pair=document.createElement('div');pair.dataset.name=sample.name;pair.style.cssText='position:absolute;inset:0';for(const[kind,content]of[['original',sample.html],['current',html]]){const side=document.createElement('section');side.dataset[kind!]='';side.style.cssText='position:absolute;inset:0';const wrapper=document.createElement('div');wrapper.className='modal-overlay show';wrapper.innerHTML=content!;side.append(wrapper);pair.append(side);}host.pairs.push(pair);}
  await document.fonts.ready;
 },{samples,originalStyles,placements:frozen.stylePlacements});
}
async function setTheme(page:Page,theme:string){await page.evaluate(async theme=>{if(theme==='default')document.documentElement.removeAttribute('data-theme');else(await import('/js/theme.js')).setTheme(theme);await document.fonts.ready;},theme);}
async function compareAll(page:Page,scrollTop=0){return page.locator('#cycle-editor-parity').evaluate((element,{properties,scrollTop})=>{
 const host=element as PairHost,problems:string[]=[];
 for(const pair of host.pairs){host.replaceChildren(pair);for(const modal of pair.querySelectorAll<HTMLElement>('.cycle-modal'))modal.scrollTop=scrollTop;
  const old=[...pair.querySelector('[data-original]')!.querySelectorAll('*')],now=[...pair.querySelector('[data-current]')!.querySelectorAll('*')];
  if(old.length!==now.length){problems.push(`${pair.dataset.name}: ${old.length}/${now.length} nodes`);continue;}
  const snapshot=(node:Element)=>{const css=getComputedStyle(node);return Object.fromEntries(properties.map(property=>[property,css.getPropertyValue(property)]));};
  if(old.filter(node=>node.tagName==='LABEL'&&!!node.querySelector(':scope > .cycle-auto-value')).length!==4||now.filter(node=>node.tagName==='DIV'&&node.classList.contains('cycle-field')&&!!node.querySelector(':scope > .cycle-auto-value')).length!==4)problems.push(`${pair.dataset.name}/exact automatic-field semantic repair`);
  const before=old.map(snapshot),after=now.map(snapshot),a=old.map(node=>node.getBoundingClientRect()),b=now.map(node=>node.getBoundingClientRect());
  old.forEach((node,index)=>{const next=now[index]!;const automaticLabelRepair=node.tagName==='LABEL'&&node.classList.contains('cycle-field')&&!!node.querySelector(':scope > .cycle-auto-value')&&next.tagName==='DIV'&&next.classList.contains('cycle-field')&&!!next.querySelector(':scope > .cycle-auto-value');if(node.tagName!==next.tagName&&!automaticLabelRepair)problems.push(`${pair.dataset.name}/${index}/tag`);for(const property of properties)if(before[index]![property]!==after[index]![property])problems.push(`${pair.dataset.name}/${index}/${node.tagName}/${property}: ${after[index]![property]} != ${before[index]![property]}`);if(a[index]!.x!==b[index]!.x||a[index]!.y!==b[index]!.y||a[index]!.width!==b[index]!.width||a[index]!.height!==b[index]!.height)problems.push(`${pair.dataset.name}/${index}/bounds: ${JSON.stringify(b[index])} != ${JSON.stringify(a[index])}`);
   if(node instanceof HTMLSelectElement){const value=(select:HTMLSelectElement)=>({value:select.value,index:select.selectedIndex,options:[...select.options].map(option=>({value:option.value,selected:option.selected,attribute:option.hasAttribute('selected')}))});if(JSON.stringify(value(node))!==JSON.stringify(value(next as HTMLSelectElement)))problems.push(`${pair.dataset.name}/${index}/native option state`);}
   if(node instanceof HTMLElement&&node.hidden!==(next as HTMLElement).hidden)problems.push(`${pair.dataset.name}/${index}/hidden`);
  });
 }
 return problems;
},{properties,scrollTop});}
const editors=()=>frozen.samples.filter(sample=>sample.kind==='editor');
test('authored Cycle editor preserves frozen geometry, native options, hidden fields and theme breakpoints',async({page},info)=>{
 test.setTimeout(300000);const samples=editors();await mountPairs(page,samples);let comparisons=0;
 for(const width of widths){await page.setViewportSize({width,height:1000});for(const theme of themes){await setTheme(page,theme);await page.mouse.move(0,0);expect(await compareAll(page),`${width}/${theme}`).toEqual([]);comparisons+=samples.length;}}
 fs.writeFileSync(info.outputPath('cycle-editor-geometry.json'),JSON.stringify({samples:samples.length,comparisons,widths,themes,properties},null,2));
});
test('authored Cycle editor preserves focused controls, sticky chrome and scroll overflow',async({page},info)=>{
 test.setTimeout(180000);const samples=editors().filter(sample=>['unset','all-symptoms-long-history','mixed-import-coverage'].includes(sample.name));expect(samples.length).toBe(3);await mountPairs(page,samples);let checks=0;
 for(const width of [320,1440]){await page.setViewportSize({width,height:800});for(const theme of themes){await setTheme(page,theme);await page.mouse.move(0,0);expect(await compareAll(page,500),`${width}/${theme}/scrolled`).toEqual([]);await page.keyboard.press('Tab');checks+=await page.locator('#cycle-editor-parity').evaluate((element,properties)=>{
  const host=element as PairHost;let count=0;for(const pair of host.pairs){host.replaceChildren(pair);const originalSide=pair.querySelector<HTMLElement>('[data-original]')!,currentSide=pair.querySelector<HTMLElement>('[data-current]')!;const before=[...originalSide.querySelectorAll<HTMLElement>('button,input,select')],after=[...currentSide.querySelectorAll<HTMLElement>('button,input,select')];if(before.length!==after.length)throw new Error('Focus topology '+pair.dataset.name);
   before.forEach((control,index)=>{if((control as HTMLButtonElement).disabled||!control.getClientRects().length)return;originalSide.style.visibility='visible';currentSide.style.visibility='hidden';control.focus({preventScroll:true});if(document.activeElement!==control||control.matches(':hover'))throw new Error('Original focus not isolated');const style=getComputedStyle(control),prior=Object.fromEntries(properties.map(p=>[p,style.getPropertyValue(p)]));originalSide.style.visibility='hidden';currentSide.style.visibility='visible';const current=after[index]!;current.focus({preventScroll:true});if(document.activeElement!==current||current.matches(':hover'))throw new Error('Authored focus not isolated');const css=getComputedStyle(current),next=Object.fromEntries(properties.map(p=>[p,css.getPropertyValue(p)]));if(JSON.stringify(prior)!==JSON.stringify(next))throw new Error(`${pair.dataset.name}/${index}/focus: ${JSON.stringify(next)} != ${JSON.stringify(prior)}`);count++;});originalSide.style.visibility='visible';currentSide.style.visibility='visible';}
  return count;
 },[...properties,'outline-width','outline-style','outline-color','outline-offset']);}}
 fs.writeFileSync(info.outputPath('cycle-editor-focus-scroll.json'),JSON.stringify({samples:samples.length,checks,themes,widths:[320,1440]},null,2));
});
type PointerSide='original'|'current';
interface PointerTarget {x:number;y:number;symptom:boolean}
async function preparePointerControl(page:Page,side:PointerSide,index:number):Promise<PointerTarget|null>{
 return page.evaluate(({side,index})=>{
  const host=document.getElementById('cycle-editor-parity');
  if(!host)throw new Error('Missing Cycle pointer fixture');
  const original=host.querySelector<HTMLElement>('[data-original]');
  const current=host.querySelector<HTMLElement>('[data-current]');
  if(!original||!current)throw new Error('Missing Cycle pointer sides');
  original.style.visibility=side==='original'?'visible':'hidden';
  current.style.visibility=side==='current'?'visible':'hidden';
  const control=(side==='original'?original:current).querySelectorAll<HTMLButtonElement>('button')[index];
  if(!control)throw new Error(`Missing ${side} Cycle button ${index}`);
  const before=control.getBoundingClientRect(),style=getComputedStyle(control);
  // These fixtures contain ordinary buttons: hidden ancestors/display:none have no box.
  const visible=style.visibility==='visible'&&style.display!=='none'&&before.width>0&&before.height>0;
  if(!visible){
   if(side==='original')return null;
   throw new Error(`Current Cycle button ${index} is hidden while its original is visible`);
  }
  control.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
  const bounds=control.getBoundingClientRect();
  if(bounds.width<=0||bounds.height<=0)throw new Error(`Visible ${side} Cycle button ${index} has no nonzero bounding box`);
  return {x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2,symptom:control.classList.contains('cycle-symptom-chip')};
 },{side,index});
}
async function pointerProperties(page:Page,side:PointerSide,index:number,state:'hover'|'active'):Promise<Record<string,string>>{
 return page.evaluate(({side,index,state,properties})=>{
  const control=document.querySelector('#cycle-editor-parity [data-'+side+']')?.querySelectorAll('button')[index];
  if(!control)throw new Error(`Missing ${side} Cycle button ${index}`);
  if(!control.matches(':'+state))throw new Error(`${side} Cycle button ${index} is not ${state}`);
  const css=getComputedStyle(control);
  return Object.fromEntries(properties.map(property=>[property,css.getPropertyValue(property)]));
 },{side,index,state,properties});
}
for(const theme of themes){
 for(const pressed of [false,true]){
 test('authored Cycle editor retains actual hover, active and symptom pressed properties / '+theme+' / pressed '+pressed,async({page},info)=>{
 test.setTimeout(60000);
 const sample=editors().find(sample=>sample.name==='mixed-import-coverage')!;
 expect(sample).toBeDefined();
 await mountPairs(page,[sample]);
 await page.setViewportSize({width:1440,height:1000});
 const count=await page.evaluate(()=>{
  const host=document.getElementById('cycle-editor-parity') as PairHost|null;
  if(!host?.pairs[0])throw new Error('Missing Cycle pointer pair');
  host.replaceChildren(host.pairs[0]);
  const original=host.querySelector('[data-original]'),current=host.querySelector('[data-current]');
  if(!original||!current)throw new Error('Missing Cycle pointer sides');
  const count=original.querySelectorAll('button').length;
  if(current.querySelectorAll('button').length!==count)throw new Error('Cycle pointer button topology');
  return count;
 });
 let checks=0,activeChecks=0;
 await setTheme(page,theme);
   await page.evaluate(pressed=>{
    const host=document.getElementById('cycle-editor-parity');
    if(!host)throw new Error('Missing Cycle pointer fixture');
    for(const chip of host.querySelectorAll('.cycle-symptom-chip')){
     chip.classList.toggle('active',pressed);
     chip.setAttribute('aria-pressed',String(pressed));
    }
   },pressed);
   for(let index=0;index<count;index++){
    const original=await preparePointerControl(page,'original',index);
    if(!original)continue;
    await page.mouse.move(original.x,original.y);
    const snapshot=await pointerProperties(page,'original',index,'hover');
    const current=await preparePointerControl(page,'current',index);
    if(!current)throw new Error(`Missing current Cycle button ${index}`);
    await page.mouse.move(current.x,current.y);
    expect(await pointerProperties(page,'current',index,'hover'),`${theme}/${pressed}/${index}/hover`).toEqual(snapshot);
    checks++;
    if(current.symptom){
     await page.mouse.down();
     const next=await pointerProperties(page,'current',index,'active');
     await page.mouse.up();
     const originalActive=await preparePointerControl(page,'original',index);
     if(!originalActive)throw new Error(`Original Cycle button ${index} disappeared before active check`);
     await page.mouse.move(originalActive.x,originalActive.y);
     await page.mouse.down();
     expect(await pointerProperties(page,'original',index,'active'),`${theme}/${pressed}/${index}/active`).toEqual(next);
     await page.mouse.move(0,0);
     await page.mouse.up();
     activeChecks++;
    }
   }
 fs.writeFileSync(info.outputPath('cycle-editor-hover-active.json'),JSON.stringify({checks,activeChecks,themes:[theme],pressedStates:[pressed]},null,2));
 });
 }
}
