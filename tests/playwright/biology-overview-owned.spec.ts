import fs from 'node:fs';
import {expect,test} from './coverage-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {scopedFrozenStyles} from '../helpers/frozen-style-scope.js';
import {prepareDemoProfile} from './biology-score-fixture.js';
import type {BiologyRenderScore} from '../../js/biology-score-render.js';
import type {BiologyAIState} from '../../js/biology-ai-presentation.js';
import type {BiologyOverviewProps} from '../../js/biology-overview-presentation.js';
interface Sample {kind:BiologyOverviewProps['kind'];name:string;score:BiologyRenderScore|null;ai:BiologyAIState|null;html:string}
const original=JSON.parse(fs.readFileSync('tests/fixtures/biology-overview-original.json','utf8')) as {classes:string[];samples:Sample[];styleBlocks:{selector:string;declarations:string;atRules:{name:string;params:string}[]}[]};
const samples=original.samples.filter(sample=>sample.score&&(sample.kind==='coherence'?['actual','empty','zero','escaped','snapshot','cached'].includes(sample.name):sample.kind==='dashboard-coherence'?['actual','empty','zero','unlinked','clamped'].includes(sample.name):['metabolicFlexibility','zero','historical','snapshot'].includes(sample.name))).map(sample=>({...sample,html:sample.html.replace(/class="@(\d+)"/g,(_,index:string)=>`class="${original.classes[Number(index)]}"`)}));
const frozenCSS=original.styleBlocks.map(block=>{
 let rule=scopedFrozenStyles([{selector:block.selector,declarations:block.declarations,media:null}]);for(const wrapper of [...block.atRules].reverse())rule=`@${wrapper.name} ${wrapper.params}{${rule}}`;return rule;
}).join('\n');
test('authored Biology overview preserves frozen layout themes domains and keyboard actions',async({page},info)=>{
 test.setTimeout(240000);await installDiscussionFixture(page.context());await prepareDemoProfile(page);
 await page.evaluate(async()=>{(await import('/js/views.js')).navigate('biology-scores');});
 await expect(page.locator('#biology-score-biologicalCoherence[data-biology-overview-view]')).toBeVisible();await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.evaluate(async({samples,css})=>{
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
 },{samples,css:frozenCSS});
 const host=page.locator('#biology-overview-acceptance');let pairs=0;
 for(const width of [320,600,601,650,651,720,721,1000,1001,1201])for(const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm'])for(const open of [false,true]){
  await page.setViewportSize({width,height:1000});await page.mouse.move(0,0);
  await page.evaluate(async({theme,open})=>{(await import('/js/theme.js')).setTheme(theme);document.querySelectorAll('#biology-overview-acceptance details').forEach(node=>node.toggleAttribute('open',open));},{theme,open});
  await expect.poll(()=>host.evaluate(element=>{
   const properties=['display','position','width','height','fontSize','fontWeight','fontFamily','fontStyle','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','gridTemplateColumns','gridTemplateRows','alignItems','alignContent','borderTopWidth','borderTopStyle','borderTopColor','borderLeftWidth','borderRadius','whiteSpace','overflow','opacity','backgroundColor','backgroundImage','color','outlineWidth','outlineColor','outlineOffset','transform','float','clear'] as const;
   const failures:string[]=[];
   const owned=(side:Element)=>[...side.querySelectorAll('*')].filter(node=>!node.closest('[data-biology-reading-view],[data-biology-ai-view],[data-biology-card-view]'));
   for(const pair of element.querySelectorAll('[data-pair]')){
    const before=owned(pair.querySelector('[data-original]')!),after=owned(pair.querySelector('[data-current]')!);if(before.length!==after.length){failures.push(`${pair.getAttribute('data-pair')}: ${before.length}/${after.length}`);continue;}
    before.forEach((node,index)=>{const a=getComputedStyle(node),b=getComputedStyle(after[index]!);for(const property of properties)if(a[property]!==b[property])failures.push(`${pair.getAttribute('data-pair')}/${node.tagName}.${node.classList[0]}/${property}: ${b[property]} != ${a[property]}`);
     for(const pseudo of ['::before','::after'])if(node.matches('.biology-coherence-hero,.biology-coherence-domains,.db-bio-coherence-domains'))for(const property of ['content','position','inset','backgroundImage','fontSize','color']){const a=getComputedStyle(node,pseudo).getPropertyValue(property),b=getComputedStyle(after[index]!,pseudo).getPropertyValue(property);if(a!==b)failures.push(`${pair.getAttribute('data-pair')}/${pseudo}/${property}: ${b} != ${a}`);}
    });
   }return failures;
  }),{message:`${width}/${theme}/${open?'open':'closed'} frozen overview palette and geometry`}).toEqual([]);pairs+=await host.locator('[data-pair]').count();
 }
 await host.locator('[data-original]').evaluateAll(nodes=>nodes.forEach(node=>node.remove()));let controls=0;
 for(const button of await host.locator('[data-current] .bc-micro-domain-action,[data-current] .biology-contributor-button,[data-current] .biology-coherence-domain-row').all()){
  await button.focus();await expect(button).toBeFocused();expect(await button.evaluate(node=>parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(2);controls++;
 }
 for(const row of await host.locator('[data-current] .bc-micro-domain-no-jump').all()){await expect(row).not.toHaveAttribute('role');await expect(row).not.toHaveAttribute('tabindex');await expect(row).not.toHaveAttribute('data-biology-score-action');}
 expect(errors).toEqual([]);fs.writeFileSync(info.outputPath('biology-overview-parity.json'),JSON.stringify({pairs,controls,widths:[320,600,601,650,651,720,721,1000,1001,1201],themes:6,states:['closed','open'],pageErrors:errors}));
});
