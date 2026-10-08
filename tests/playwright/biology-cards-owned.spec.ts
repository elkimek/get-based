import fs from 'node:fs';
import {expect,test} from './coverage-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {scopedFrozenStyles} from '../helpers/frozen-style-scope.js';
import {prepareDemoProfile} from './biology-score-fixture.js';
import type {BiologyRenderScore} from '../../js/biology-score-render.js';
import type {BiologyAIState} from '../../js/biology-ai-presentation.js';
interface Sample {name:string;score:BiologyRenderScore;ai:BiologyAIState;withoutTools:string}
const original=JSON.parse(fs.readFileSync('tests/fixtures/biology-cards-original.json','utf8')) as {
 classes:string[];samples:Sample[];
 styleBlocks:{selector:string;declarations:string;atRules:{name:string;params:string}[]}[];
};
const samples=original.samples.map(sample=>({...sample,withoutTools:sample.withoutTools.replace(/class="@(\d+)"/g,(_,index:string)=>`class="${original.classes[Number(index)]}"`)}));
const frozenCSS=original.styleBlocks.map(block=>{
 let rule=scopedFrozenStyles([{selector:block.selector,declarations:block.declarations,media:null}]);
 for(const wrapper of [...block.atRules].reverse())rule=`@${wrapper.name} ${wrapper.params}{${rule}}`;
 return rule;
}).join('\n');
test('authored Biology cards preserve complete frozen geometry palette and tools',async({page},info)=>{
 test.setTimeout(240000);
 await installDiscussionFixture(page.context());await prepareDemoProfile(page);
 await page.evaluate(async()=>{(await import('/js/views.js')).navigate('biology-scores');});
 await expect(page.locator('#biology-score-metabolicFlexibility')).toBeVisible();
 await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.evaluate(async({samples,css})=>{
  const {renderHTML}=await import('/js/components/BiologyCardPresentation.svelte.html.js');
  const {projectBiologyScoreDetail,projectBiologyScoreMetric}=await import('/js/biology-card-presentation.js');
  const style=document.createElement('style');style.textContent=css;document.head.append(style);
  const host=document.createElement('div');host.id='biology-cards-acceptance';host.style.cssText='position:fixed;inset:0;z-index:20000;overflow:auto;background:var(--bg-primary);padding:12px';document.body.append(host);
  const pair=(name:string,oldHTML:string,newHTML:string,coherence=false)=>{
   const pair=document.createElement('div');pair.dataset.pair=name;
   for(const [key,html] of [['original',oldHTML],['current',newHTML]]){
    const side=document.createElement('section');side.dataset[key!]='';
    const context=document.createElement('div');context.className='biology-scores-page';
    const grid=document.createElement('div');grid.className='lens-page-widgets';
    const row=document.createElement('section');row.className=coherence?'biology-coherence-overview':'biology-score-lens-row';row.innerHTML=html!;
    grid.append(row);context.append(grid);side.append(context);pair.append(side);
   }host.append(pair);
  };
  for(const sample of samples){
   pair(sample.name,sample.withoutTools,renderHTML({kind:'detail',view:projectBiologyScoreDetail(sample.score,sample.ai)}));
   if(sample.name==='zero'||sample.name==='historical'){
    const old=document.createElement('div');old.innerHTML=sample.withoutTools;
    pair(`coherence-${sample.name}`,old.querySelector('.biology-score-dial')!.outerHTML,renderHTML({kind:'metric',view:projectBiologyScoreMetric(sample.score)}),true);
   }
  }
 },{samples,css:frozenCSS});
 const host=page.locator('#biology-cards-acceptance');let pairs=0;
 for(const width of [320,600,601,650,651,1100])for(const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm'])for(const open of [false,true]){
  await page.setViewportSize({width,height:1000});await page.mouse.move(0,0);
  await page.evaluate(async({theme,open})=>{(await import('/js/theme.js')).setTheme(theme);document.querySelectorAll('#biology-cards-acceptance article').forEach(node=>node.toggleAttribute('open',open));},{theme,open});
  await expect.poll(()=>host.evaluate(element=>{
   const properties=['display','position','width','height','fontSize','fontWeight','fontFamily','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','gridTemplateColumns','gridTemplateRows','alignItems','alignContent','borderTopWidth','borderTopStyle','borderTopColor','borderLeftWidth','borderRadius','whiteSpace','overflow','opacity','backgroundColor','backgroundImage','color','outlineWidth','outlineColor','outlineOffset','transform','float','clear'] as const;
   const failures:string[]=[];
   const owned=(side:Element)=>[...side.querySelectorAll('*')].filter(node=>!node.closest('[data-biology-reading-view],[data-biology-ai-view]'));
   for(const pair of element.querySelectorAll('[data-pair]')){
    const before=owned(pair.querySelector('[data-original]')!),after=owned(pair.querySelector('[data-current]')!);
    if(before.length!==after.length){failures.push(`${pair.getAttribute('data-pair')}: ${before.length}/${after.length}`);continue;}
    before.forEach((node,index)=>{const a=getComputedStyle(node),b=getComputedStyle(after[index]!);for(const property of properties)if(a[property]!==b[property])failures.push(`${pair.getAttribute('data-pair')}/${node.tagName}.${node.classList[0]}/${property}: ${b[property]} != ${a[property]}`);
     if(node.classList.contains('biology-score-dial'))for(const property of ['content','inset','backgroundColor','borderRadius']){const x=getComputedStyle(node,'::before').getPropertyValue(property),y=getComputedStyle(after[index]!,'::before').getPropertyValue(property);if(x!==y)failures.push(`${pair.getAttribute('data-pair')}/dial-before/${property}: ${y} != ${x}`);}
    });
   }return failures;
  }),{message:`${width}/${theme}/${open?'open':'closed'} frozen card geometry and palette`}).toEqual([]);
  pairs+=await host.locator('[data-pair]').count();
 }
 await host.locator('[data-original]').evaluateAll(nodes=>nodes.forEach(node=>node.remove()));
 const details=host.locator('[data-current] .biology-score-details-label');let controls=0;
 for(const button of await details.all()){
  await button.focus();await expect(button).toBeFocused();
  expect(await button.evaluate(node=>parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(2);controls++;
 }
 expect(errors).toEqual([]);
 fs.writeFileSync(info.outputPath('biology-card-parity.json'),JSON.stringify({pairs,controls,widths:[320,600,601,650,651,1100],themes:6,states:['closed','open'],pageErrors:errors}));
});
