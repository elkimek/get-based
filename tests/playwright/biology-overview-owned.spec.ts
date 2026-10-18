import fs from 'node:fs';
import {expect,test} from './coverage-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {scopedFrozenStyles,type FrozenStyleBlock} from '../helpers/frozen-style-scope.js';
import {historicalBiologyNotesStyle} from '../helpers/biology-overview-native-cascade.js';
import {prepareDemoProfile} from './biology-score-fixture.js';
import type {BiologyRenderScore} from '../../js/biology-score-render.js';
import type {BiologyAIState} from '../../js/biology-ai-presentation.js';
import type {BiologyOverviewProps} from '../../js/biology-overview-presentation.js';
interface Sample {kind:BiologyOverviewProps['kind'];name:string;score:BiologyRenderScore|null;ai:BiologyAIState|null;html:string}
const original=JSON.parse(fs.readFileSync('tests/fixtures/biology-overview-original.json','utf8')) as {classes:string[];samples:Sample[];styleBlocks:{selector:string;declarations:string;atRules:{name:string;params:string}[]}[]};
const samples=original.samples.filter(sample=>sample.score&&(sample.kind==='coherence'?['actual','empty','zero','escaped','snapshot','cached'].includes(sample.name):sample.kind==='dashboard-coherence'?['actual','empty','zero','unlinked','clamped'].includes(sample.name):['metabolicFlexibility','zero','historical','snapshot'].includes(sample.name))).map(sample=>({...sample,html:sample.html.replace(/class="@(\d+)"/g,(_,index:string)=>`class="${original.classes[Number(index)]}"`)}));
// The overview receipt omits this shared page-owned note rule; compose its exact historical owner.
const pageOriginal=JSON.parse(fs.readFileSync('tests/fixtures/biology-page-original.json','utf8')) as {styleBlocks:{selector:string;css:string;atRules:{name:string;params:string}[]}[]};
const sharedNote=pageOriginal.styleBlocks.filter(block=>block.selector==='.biology-scores-note');
if(sharedNote.length!==1||sharedNote[0]!.atRules.length!==0)throw new Error('Expected one original shared Biology note rule');
// The complete native cascade restores the later shared reading-summary rule
// on the reference only; candidate markup and all comparisons remain exact.
const readingOriginal=JSON.parse(fs.readFileSync('tests/fixtures/biology-reading-original.json','utf8')) as {styleBlocks:FrozenStyleBlock[]};
const frozenCSS=sharedNote.map(block=>block.css.replace('.biology-scores-note',':where([data-original]) .biology-scores-note')).join('\n')+'\n'+original.styleBlocks.map(block=>{
 let rule=scopedFrozenStyles([{selector:block.selector,declarations:block.declarations,media:null}]);for(const wrapper of [...block.atRules].reverse())rule=`@${wrapper.name} ${wrapper.params}{${rule}}`;return rule;
}).join('\n')+'\n'+historicalBiologyNotesStyle(readingOriginal.styleBlocks);
test('authored Biology overview preserves frozen layout themes domains and keyboard actions',async({page},info)=>{
 test.setTimeout(240000);await installDiscussionFixture(page.context());await prepareDemoProfile(page);
 // Prepare the same real body ports and Biology assets without scheduling the live route's AI reconciliation over static fixtures.
 await page.evaluate(async()=>{
  await(await import('/js/views.js')).navigate('labs');
  const [{loadCategoryViewsStylesheet},{loadBiologyPage}]=await Promise.all([import('/js/category-page-runtime.js'),import('/js/biology-page-loader.js')]);
  await Promise.all([loadCategoryViewsStylesheet(),loadBiologyPage()]);
 });
 await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const cachedChildren=await page.evaluate(async({samples,css})=>{
  const {renderHTML}=await import('/js/components/BiologyOverviewPresentation.svelte.html.js');
  const {projectBiologyCoherence,projectBiologyDashboardScore,projectBiologyDashboardCoherence}=await import('/js/biology-overview-presentation.js');
  const {getLensDashboardToggleView}=await import('/js/lens-page-shell.js');
  const style=document.createElement('style');style.textContent=css;document.head.append(style);
  const host=document.createElement('div');host.id='biology-overview-acceptance';host.style.cssText='position:fixed;inset:0;z-index:20000;overflow:auto;background:var(--bg-primary);padding:12px';document.body.append(host);
  for(const sample of samples){
   const score=sample.score!;
   const current=sample.kind==='coherence'?renderHTML({kind:sample.kind,view:projectBiologyCoherence(score,sample.ai!,getLensDashboardToggleView('biology-score-biologicalCoherence'))}):sample.kind==='dashboard-score'?renderHTML({kind:sample.kind,view:projectBiologyDashboardScore(score)}):renderHTML({kind:sample.kind,view:projectBiologyDashboardCoherence(score)});
   const pair=document.createElement('div');pair.dataset.pair=`${sample.kind}-${sample.name}`;
   for(const [key,html] of [['original',sample.html],['current',current]]){
    const side=document.createElement('section');side.dataset[key!]='';const context=document.createElement('div');context.className=sample.kind==='coherence'?'biology-scores-page':'dashboard-widget';
    if(sample.kind==='coherence')context.innerHTML=html!;else{const body=document.createElement('div');body.className='dashboard-widget-body';body.innerHTML=html!;context.append(body);}
    side.append(context);pair.append(side);
   }host.append(pair);
  }
  return [...host.querySelectorAll('[data-pair="coherence-cached"] [data-biology-score-ai-panel="biologicalCoherence"]')].map(node=>({html:node.outerHTML,text:node.textContent}));
 },{samples,css:frozenCSS});
 expect(cachedChildren).toHaveLength(2);
 for(const child of cachedChildren){
  expect(child.text).toContain('Saved overview');
  expect(child.text).toContain('Complete explanation');
  expect(child.text).toMatch(/Saved \d/);
  expect(child.html).toContain('href="https://example.com/overview"');
 }
 const host=page.locator('#biology-overview-acceptance');let pairs=0;
 for(const width of [320,600,601,650,651,720,721,1000,1001,1201])for(const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm'])for(const open of [false,true]){
  await page.setViewportSize({width,height:1000});await page.mouse.move(0,0);
  await page.evaluate(async({theme,open})=>{
   const themes=await import('/js/theme.js');
   if(await themes.setTheme(theme)!==true||themes.getTheme()!==theme||(document.documentElement.dataset.theme||'dark')!==theme)throw new Error('Biology fixture theme did not settle');
   document.querySelectorAll('#biology-overview-acceptance details').forEach(node=>node.toggleAttribute('open',open));
   await document.fonts.ready;
  },{theme,open});
  await expect.poll(()=>host.evaluate((element,cachedChildren)=>{
   const children=[...element.querySelectorAll('[data-pair="coherence-cached"] [data-biology-score-ai-panel="biologicalCoherence"]')].map(node=>({html:node.outerHTML,text:node.textContent}));
   if(JSON.stringify(children)!==JSON.stringify(cachedChildren))return ['Cached Biology fixture child markup or text changed'];
   const properties=['display','position','width','height','fontSize','fontWeight','fontFamily','fontStyle','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','gridTemplateColumns','gridTemplateRows','alignItems','alignContent','borderTopWidth','borderTopStyle','borderTopColor','borderLeftWidth','borderRadius','whiteSpace','overflow','opacity','backgroundColor','backgroundImage','color','outlineWidth','outlineColor','outlineOffset','transform','float','clear'] as const;
   const failures:string[]=[];
   const owned=(side:Element)=>[...side.querySelectorAll('*')].filter(node=>!node.closest('[data-biology-reading-view],[data-biology-ai-view],[data-biology-card-view]'));
   for(const pair of element.querySelectorAll('[data-pair]')){
    const before=owned(pair.querySelector('[data-original]')!),after=owned(pair.querySelector('[data-current]')!);if(before.length!==after.length){failures.push(`${pair.getAttribute('data-pair')}: ${before.length}/${after.length}`);continue;}
    before.forEach((node,index)=>{const a=getComputedStyle(node),b=getComputedStyle(after[index]!);for(const property of properties)if(a[property]!==b[property])failures.push(`${pair.getAttribute('data-pair')}/${node.tagName}.${node.classList[0]}/${property}: ${b[property]} != ${a[property]}`);
     for(const pseudo of ['::before','::after'])if(node.matches('.biology-coherence-hero,.biology-coherence-domains,.db-bio-coherence-domains'))for(const property of ['content','position','inset','backgroundImage','fontSize','color']){const a=getComputedStyle(node,pseudo).getPropertyValue(property),b=getComputedStyle(after[index]!,pseudo).getPropertyValue(property);if(a!==b)failures.push(`${pair.getAttribute('data-pair')}/${pseudo}/${property}: ${b} != ${a}`);}
    });
   }return failures;
  },cachedChildren),{message:`${width}/${theme}/${open?'open':'closed'} frozen overview palette and geometry`}).toEqual([]);pairs+=await host.locator('[data-pair]').count();
 }
 await host.locator('[data-original]').evaluateAll(nodes=>nodes.forEach(node=>node.remove()));let controls=0;
 for(const button of await host.locator('[data-current] .bc-micro-domain-action,[data-current] .biology-contributor-button,[data-current] .biology-coherence-domain-row').all()){
  await button.focus();await expect(button).toBeFocused();expect(await button.evaluate(node=>parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(2);controls++;
 }
 for(const row of await host.locator('[data-current] .bc-micro-domain-no-jump').all()){await expect(row).not.toHaveAttribute('role');await expect(row).not.toHaveAttribute('tabindex');await expect(row).not.toHaveAttribute('data-biology-score-action');}
 await host.evaluate(element=>element.remove());
 // Keep the original live Biology route acceptance after the static native/current comparisons.
 await page.evaluate(async()=>{await(await import('/js/views.js')).navigate('biology-scores');});
 await expect(page.locator('#biology-score-biologicalCoherence[data-biology-overview-view]')).toBeVisible();
 expect(errors).toEqual([]);fs.writeFileSync(info.outputPath('biology-overview-parity.json'),JSON.stringify({pairs,controls,widths:[320,600,601,650,651,720,721,1000,1001,1201],themes:6,states:['closed','open'],pageErrors:errors}));
});
