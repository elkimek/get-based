import fs from 'node:fs';
import postcss from 'postcss';
import {expect,test} from './coverage-fixture.js';
import {prepareDemoProfile} from './biology-score-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import type {LensContentProps} from '../../js/lens-content-presentation.js';
interface Sample {name:string;kind:'genome'|'body'|'actions';input?:{genetics?:{snps?:object};wearableConnections?:unknown;wearableSummary?:unknown};route?:string;hidden?:string[];html:string;actions?:string}
const frozen=JSON.parse(fs.readFileSync('tests/fixtures/lens-content-original.json','utf8')) as {samples:Sample[];styleBlocks:{css:string;atRules:{name:string;params:string}[]}[]};
const cases=frozen.samples.filter(sample=>sample.html).map(sample=>({...sample,header:sample.kind==='actions'}));
for(const [kind,name]of [['genome','absent'],['genome','snps'],['body','absent']] as const){const sample=frozen.samples.find(sample=>sample.kind===kind&&sample.name===name)!;cases.push({...sample,html:sample.actions!,header:true});}
// These formerly shared native picker rules now retire with the authored pickers.
// Keep the original Body source side styled from the hash-verified frozen baseline.
const retiredPicker=JSON.parse(fs.readFileSync('tests/fixtures/widget-map-original.json','utf8')) as {styleBlocks:{file:string;css:string;atRules:{name:string;params:string}[]}[]};
const originalCSS=[...frozen.styleBlocks,...retiredPicker.styleBlocks.filter(block=>block.file==='css/dashboard-widgets.base.css')].map(block=>{const tree=postcss.parse(block.css);tree.walkRules(rule=>{rule.selector=rule.selectors.map(selector=>`:where([data-original]) ${selector}`).join(',');});return block.atRules.reduceRight((css,at)=>`@${at.name} ${at.params}{${css}}`,tree.toString());}).join('\n');
test('typed lens content preserves frozen metadata, source cards and action geometry',async({page},info)=>{
 test.setTimeout(180000);await installDiscussionFixture(page.context());await prepareDemoProfile(page);await page.evaluate(async()=>(await import('/js/views.js')).navigate('genome'));
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(async({cases,css})=>{
  for(const href of ['/css/genetics.css','/css/dashboard-data.css','/css/dashboard-widgets.css'])await new Promise<void>((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.onload=()=>resolve();link.onerror=()=>reject(new Error(href));document.head.append(link);});
  const [{renderHTML},project]=await Promise.all([import('/js/components/LensPageContent.svelte.html.js'),import('/js/lens-content-presentation.js')]);
  const style=document.createElement('style');style.textContent=css;document.head.append(style);
  const host=document.createElement('div');host.id='lens-content-parity';host.style.cssText='position:fixed;inset:0;overflow:auto;padding:12px;background:var(--bg-primary);z-index:20000';document.body.append(host);
  const pairs:HTMLElement[]=[];(host as HTMLElement&{pairs?:HTMLElement[]}).pairs=pairs;
  for(const sample of cases){
   const props:LensContentProps=sample.header?{kind:'actions',view:project.projectLensActions(sample.kind==='actions'?(sample.route==='showInsightLens'?'insight':'tips'):sample.kind,{hasSnps:Object.keys(sample.input?.genetics?.snps||{}).length>0,recommendationsVisible:!sample.hidden?.includes('recommendations')})}:sample.kind==='genome'?{kind:'genome-import',view:project.projectGenomeImportDetails(sample.input?.genetics)}:{kind:'body-sources',view:project.projectBodySources(sample.input?.wearableConnections,sample.input?.wearableSummary)};
   const pair=document.createElement('div');pair.style.cssText='position:relative';pair.dataset.name=sample.name;
   for(const[kind,html]of [['original',sample.html],['current',renderHTML(props)]]){const side=document.createElement('section');side.dataset[kind!]='';side.style.cssText='position:absolute;top:0;left:0;width:100%';side.innerHTML=`<div class="${sample.header?'lens-page-header genome-lens-header':'dashboard-widget-body'}">${sample.header?`<div class="dashboard-widget-inline-controls">${html}</div>`:html}</div>`;pair.append(side);}pairs.push(pair);
  }
 },{cases,css:originalCSS});
 let comparisons=0;const widths=[320,600,601,850,1201,1440],themes=['default','dark','light','glass','synth-sunrise','neuromancer','cyberterm'];
 for(const width of widths)for(const theme of themes){await page.setViewportSize({width,height:1000});await page.mouse.move(0,0);await page.evaluate(async theme=>{if(theme==='default')document.documentElement.removeAttribute('data-theme');else(await import('/js/theme.js')).setTheme(theme);},theme);
  expect(await page.locator('#lens-content-parity').evaluate(host=>{
   const problems:string[]=[],props=['display','width','height','font-family','font-size','font-weight','line-height','letter-spacing','color','background-color','border-top-width','border-top-color','border-top-style','border-radius','padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left','gap','grid-template-columns','align-items','justify-content','flex-direction','flex-basis','text-decoration','overflow-wrap'];
   for(const pair of (host as HTMLElement&{pairs:HTMLElement[]}).pairs){host.replaceChildren(pair);const before=[...pair.querySelector('[data-original]')!.querySelectorAll('*')],after=[...pair.querySelector('[data-current]')!.querySelectorAll('*')];if(before.length!==after.length){problems.push(`${pair.dataset.name}: ${before.length}/${after.length}`);continue;}before.forEach((node,index)=>{const a=getComputedStyle(node),b=getComputedStyle(after[index]!);for(const prop of props)if(a.getPropertyValue(prop)!==b.getPropertyValue(prop))problems.push(`${pair.dataset.name}/${node.classList[0]||node.tagName}/${prop}: ${b.getPropertyValue(prop)} != ${a.getPropertyValue(prop)}`);});}
   return problems;
  }),`${width}/${theme} frozen lens-content geometry`).toEqual([]);comparisons+=cases.length;
 }
 await page.keyboard.press('Tab');
 const focusChecks=await page.locator('#lens-content-parity').evaluate(host=>{let count=0;for(const pair of (host as HTMLElement&{pairs:HTMLElement[]}).pairs){host.replaceChildren(pair);pair.querySelector('[data-original]')?.remove();for(const button of pair.querySelectorAll<HTMLButtonElement>('[data-current] button')){button.focus();if(document.activeElement!==button||parseFloat(getComputedStyle(button).outlineWidth)<2)throw new Error(`Focus ${button.textContent}`);count++;}}return count;});
 fs.writeFileSync(info.outputPath('lens-content-parity.json'),JSON.stringify({comparisons,focusChecks,cases:cases.length,widths,themes}));
});
