import fs from 'node:fs';
import postcss from 'postcss';
import type {Page} from '@playwright/test';
import {expect,test} from './coverage-fixture.js';
import {prepareDemoProfile} from './biology-score-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import type {CyclePeriod} from '../../js/cycle-summary.js';
interface Parsed {source:string;sourceLabel?:string;sourceFile?:string|null;observations?:unknown[];warnings?:string[];detectedRange?:{firstDate?:string|null;lastDate?:string|null}|null}
interface Plan {importedPeriods:CyclePeriod[];importedToApply:CyclePeriod[];conflicts:{period:CyclePeriod}[]}
interface Sample {kind:string;name:string;input:{parsed?:Parsed;mc?:unknown;mode?:string};html:string;plan?:Plan}
interface PairHost extends HTMLElement {pairs:HTMLElement[]}
const frozen=JSON.parse(fs.readFileSync('tests/fixtures/cycle-import-original.json','utf8')) as {samples:Sample[];styleBlocks:{css:string;atRules:{name:string;params:string}[]}[]};
const originalCSS=frozen.styleBlocks.map(block=>{const tree=postcss.parse(block.css);tree.walkRules(rule=>{rule.selector=rule.selectors.map(selector=>{const ancestor=selector.match(/^((?:html|body)[^\s>+~]*)\s+(.+)$/);return ancestor?`${ancestor[1]} :where([data-original]) ${ancestor[2]}`:`:where([data-original]) ${selector}`;}).join(',');});return block.atRules.reduceRight((css,at)=>`@${at.name} ${at.params}{${css}}`,tree.toString());}).join('\n');
const widths=[320,480,767,768,769,1100,1440],themes=['default','dark','light','glass','synth-sunrise','neuromancer','cyberterm'];
const properties = [
  'display', 'position', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform',
  'color', 'background-color', 'background-image', 'border-top-width', 'border-right-width',
  'border-bottom-width', 'border-left-width', 'border-top-color', 'border-top-style', 'border-radius',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right',
  'margin-bottom', 'margin-left', 'gap', 'grid-template-columns', 'align-items', 'justify-content',
  'flex-direction', 'flex-basis', 'flex-grow', 'flex-shrink', 'flex-wrap', 'overflow-x', 'overflow-y',
  'white-space', 'overflow-wrap', 'text-overflow', 'box-shadow', 'backdrop-filter', 'overscroll-behavior',
  'scrollbar-gutter', 'text-align', 'text-decoration', 'cursor',
];
async function mountPairs(page:Page,samples:Sample[]){await installDiscussionFixture(page.context(),{provider:'openrouter',paused:true});await prepareDemoProfile(page);await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(async({samples,css})=>{
 await Promise.all(['/css/import.css','/css/cycle.css','/css/modal-shared.css'].map(href=>new Promise<void>((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.onload=()=>resolve();link.onerror=()=>reject(new Error(href));document.head.append(link);})));const[presentation,picker,rendering,model,classes]=await Promise.all([import('/js/components/CycleImportPreview.svelte.html.js'),import('/js/components/CycleImportPicker.svelte.html.js'),import('/js/cycle-import-rendering.js'),import('/js/cycle-import-presentation.js'),import('/js/cycle-import-classes.js')]);
 const style=document.createElement('style');style.textContent=css+'\n#cycle-import-parity *,#cycle-import-parity *::before,#cycle-import-parity *::after{transition:none!important;animation:none!important}';document.head.append(style);const host:PairHost=Object.assign(document.createElement('div'),{pairs:[] as HTMLElement[]});host.id='cycle-import-parity';host.style.cssText='position:fixed;inset:0;background:var(--bg-primary);z-index:20000';document.body.append(host);
 for(const sample of samples){let current:string;if(sample.kind==='preview'){const parsed=sample.input.parsed!,plan=sample.plan!,mode=sample.input.mode||'keep-existing',source=parsed.sourceLabel||rendering.cycleImportSourceLabel(parsed.source),observations=parsed.observations?.length||0,count=plan.importedToApply.length,conflicts=plan.conflicts.length;const modal=document.createElement('div');modal.id='import-modal';modal.dataset.cycleImportView='';modal.className=classes.cycleImportClasses('modal import-preview-modal cycle-import-preview-modal');modal.innerHTML=presentation.renderHTML({view:model.projectCycleImportPreview({source,fileName:parsed.sourceFile||source,firstDate:parsed.detectedRange?.firstDate,lastDate:parsed.detectedRange?.lastDate,observationCount:observations,periodCount:plan.importedPeriods.length,conflictCount:conflicts,importCount:count,conflictMode:mode,conflictSummary:`${conflicts} imported period${conflicts!==1?'s':''} overlap${conflicts===1?'s':''} existing entries.`,warnings:parsed.warnings||[],rows:model.projectCycleImportPeriodRows(plan.importedPeriods,new Set(plan.conflicts.map(item=>item.period.startDate)),mode),confirmLabel:count?`Import ${count} period${count!==1?'s':''}`:observations?`Import ${observations} daily observation${observations!==1?'s':''}`:'Complete import'})});current=modal.outerHTML;}else if(sample.kind==='picker')current=picker.renderHTML({});else current=rendering.renderCycleImportSummary(sample.input.mc,source=>()=>rendering.cycleImportSourceLabel(source));
 const pair=document.createElement('div');pair.dataset.name=sample.name;pair.dataset.kind=sample.kind;pair.style.cssText='position:absolute;inset:0';for(const[sideKind,html]of[['original',sample.html],['current',current]]){// Separate natural form owners keep equal radio names from crossing fixture sides.
const side=document.createElement('form');side.dataset[sideKind!]='';side.style.cssText='position:absolute;inset:0';const wrapper=document.createElement('div');if(sample.kind==='preview')wrapper.className='modal-overlay show';else{wrapper.style.cssText='padding:20px';wrapper.className='cycle-section';}wrapper.innerHTML=html!;side.append(wrapper);pair.append(side);}for(const side of pair.children)for(const input of side.querySelectorAll<HTMLInputElement>('input[type=radio],input[type=checkbox]'))if(input.checked!==input.hasAttribute('checked'))throw new Error(`${sample.name}/${(side as HTMLElement).hasAttribute('data-original')?'original':'current'}/initial checked state differs from frozen attribute`);host.pairs.push(pair);
 }await document.fonts.ready;
 },{samples,css:originalCSS});}
async function setTheme(page: Page, theme: string) {
 await page.evaluate(async theme => {
  if (theme === 'default') document.documentElement.removeAttribute('data-theme'); else (await import('/js/theme.js')).setTheme(theme);
  await document.fonts.ready;
 }, theme);
}
async function compareAll(page: Page) {
 return page.locator('#cycle-import-parity').evaluate((element, properties) => {
  const host = element as PairHost, problems: string[] = [];
  for (const pair of host.pairs) {
   host.replaceChildren(pair);
   const original = [...pair.querySelector('[data-original]')!.querySelectorAll('*')], current = [...pair.querySelector('[data-current]')!.querySelectorAll('*')];
   if (original.length !== current.length) {problems.push(`${pair.dataset.name}: ${original.length}/${current.length} elements`); continue;}
   const originalRects = original.map(node => node.getBoundingClientRect()), currentRects = current.map(node => node.getBoundingClientRect());
   const snapshot = (node: Element) => {const style = getComputedStyle(node); return Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)]));};
   const before = original.map(snapshot), after = current.map(snapshot);
   const pseudoProperties=['content','display','color','font-family','font-size','font-weight','line-height','margin-left','margin-right','transform'];
   const pseudo=(node:Element)=>{const css=getComputedStyle(node,'::before');return Object.fromEntries(pseudoProperties.map(property=>[property,css.getPropertyValue(property)]));};
   original.forEach((node, index) => {
    if(JSON.stringify(pseudo(node))!==JSON.stringify(pseudo(current[index]!)))problems.push(`${pair.dataset.name}/${index}/pseudo: ${JSON.stringify(pseudo(current[index]!))} != ${JSON.stringify(pseudo(node))}`);
    if (node.tagName !== current[index]!.tagName) problems.push(`${pair.dataset.name}/${index} tag`);
    for (const property of properties) if (before[index]![property] !== after[index]![property]) problems.push(`${pair.dataset.name}/${index}/${node.tagName}/${property}: ${after[index]![property]} != ${before[index]![property]}`);
    const a = originalRects[index]!, b = currentRects[index]!;
    if (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height) problems.push(`${pair.dataset.name}/${index}/bounds: (${b.x},${b.y}) ${b.width}x${b.height} != (${a.x},${a.y}) ${a.width}x${a.height}`);
   });
  }
  return problems;
 }, properties);
}

for(const owner of ['preview','summary-controls'])test(`authored Cycle ${owner} preserves full original geometry, pseudo labels and theme/breakpoint properties`,async({page},info)=>{test.setTimeout(300000);const samples=frozen.samples.filter(sample=>owner==='preview'?sample.kind==='preview':['summary','picker'].includes(sample.kind));await mountPairs(page,samples);let comparisons=0;for(const width of widths){await page.setViewportSize({width,height:1000});for(const theme of themes){await setTheme(page,theme);await page.mouse.move(0,0);expect(await compareAll(page),`${owner}/${width}/${theme}`).toEqual([]);comparisons+=samples.length;}}fs.writeFileSync(info.outputPath(`cycle-import-${owner}-geometry.json`),JSON.stringify({owner,comparisons,samples:samples.length,widths,themes,properties},null,2));});
test('authored Cycle import controls preserve actual keyboard focus properties', async ({page}, info) => {
 test.setTimeout(180000);
 const samples = frozen.samples.filter(sample => ['preview','picker','summary'].includes(sample.kind));
 await mountPairs(page, samples); await page.setViewportSize({width: 1440, height: 1000});
 let checks = 0;
 for (const theme of themes) {
  await setTheme(page, theme); await page.mouse.move(0, 0); await page.keyboard.press('Tab');
  checks += await page.locator('#cycle-import-parity').evaluate((element, properties) => {
   const host = element as PairHost; let count = 0;
   for (const pair of host.pairs) {
    host.replaceChildren(pair);
    const originalSide = pair.querySelector<HTMLElement>('[data-original]')!, currentSide = pair.querySelector<HTMLElement>('[data-current]')!;
    const before = [...originalSide.querySelectorAll<HTMLElement>('button,input,select,a[href]')], after = [...currentSide.querySelectorAll<HTMLElement>('button,input,select,a[href]')];
    if (before.length !== after.length) throw new Error('Focus topology mismatch ' + pair.dataset.name);
    before.forEach((control, index) => {
     if ((control as HTMLButtonElement).disabled || !control.getClientRects().length) return;
     originalSide.style.visibility = 'visible'; currentSide.style.visibility = 'hidden'; control.focus({preventScroll: true});
     if (document.activeElement !== control || control.matches(':hover')) throw new Error('Original focus not isolated ' + pair.dataset.name);
     const priorStyle = getComputedStyle(control); const prior = Object.fromEntries(properties.map(property => [property, priorStyle.getPropertyValue(property)]));
     originalSide.style.visibility = 'hidden'; currentSide.style.visibility = 'visible';
     const current = after[index]!; current.focus({preventScroll: true});
     if (document.activeElement !== current || current.matches(':hover')) throw new Error('Authored focus not isolated ' + pair.dataset.name);
     const nextStyle = getComputedStyle(current); const next = Object.fromEntries(properties.map(property => [property, nextStyle.getPropertyValue(property)]));
     if (JSON.stringify(prior) !== JSON.stringify(next)) throw new Error(`${pair.dataset.name}/${index}/focus: ${JSON.stringify(next)} != ${JSON.stringify(prior)}`);
     count++;
    });
    originalSide.style.visibility = 'visible'; currentSide.style.visibility = 'visible';
   }
   return count;
  }, [...properties, 'outline-width', 'outline-color', 'outline-style', 'outline-offset']);
 }
 fs.writeFileSync(info.outputPath('cycle-import-focus.json'), JSON.stringify({checks, samples: samples.length, themes}, null, 2));
});


test('authored Cycle import hover and checked conflict states retain exact native properties',async({page},info)=>{test.setTimeout(180000);const samples=frozen.samples.filter(sample=>(sample.kind==='preview'&&sample.name==='mixed-replace')||(sample.kind==='summary'&&sample.name==='mixed-sources')||sample.kind==='picker');await mountPairs(page,samples);await page.setViewportSize({width:1440,height:1000});let checks=0;for(const theme of themes){await setTheme(page,theme);for(const sample of samples){await page.locator('#cycle-import-parity').evaluate((element,name)=>{const host=element as PairHost;host.replaceChildren(host.pairs.find(pair=>pair.dataset.name===name)!);(host.querySelector('[data-original]') as HTMLElement).style.visibility='visible';(host.querySelector('[data-current]') as HTMLElement).style.visibility='hidden';},sample.name);const selectors=sample.kind==='preview'?['.cycle-import-conflict-option:has(input:checked)','.cycle-import-conflict-option:has(input:not(:checked))','.import-btn-primary','.modal-close']:sample.kind==='summary'?['.cycle-mini-action','.cycle-delete-btn']:['.cycle-icon-btn'];for(const selector of selectors){const original=page.locator('#cycle-import-parity [data-original]').locator(selector).first();await original.hover();const before=await original.evaluate((node,properties)=>{const css=getComputedStyle(node);return Object.fromEntries(properties.map(property=>[property,css.getPropertyValue(property)]));},properties);await page.locator('#cycle-import-parity').evaluate(host=>{(host.querySelector('[data-original]') as HTMLElement).style.visibility='hidden';(host.querySelector('[data-current]') as HTMLElement).style.visibility='visible';});const current=page.locator('#cycle-import-parity [data-current]').locator(selector).first();await current.hover();expect(await current.evaluate((node,properties)=>{const css=getComputedStyle(node);return Object.fromEntries(properties.map(property=>[property,css.getPropertyValue(property)]));},properties),`${sample.name}/${selector}/${theme}`).toEqual(before);await page.locator('#cycle-import-parity').evaluate(host=>{(host.querySelector('[data-original]') as HTMLElement).style.visibility='visible';(host.querySelector('[data-current]') as HTMLElement).style.visibility='hidden';});checks++;}}}fs.writeFileSync(info.outputPath('cycle-import-hover.json'),JSON.stringify({checks,themes,samples:samples.length},null,2));});
