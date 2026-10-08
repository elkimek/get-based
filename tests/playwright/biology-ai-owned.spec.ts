import fs from 'node:fs';
import {expect,test} from './coverage-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {scopedFrozenStyles,type FrozenStyleBlock} from '../helpers/frozen-style-scope.js';
import {prepareDemoProfile} from './biology-score-fixture.js';
import type {BiologyAIState} from '../../js/biology-ai-presentation.js';
import type {BiologySectionScore} from '../../js/biology-score-sections.js';
const original=JSON.parse(fs.readFileSync('tests/fixtures/biology-ai-original.json','utf8')) as {
 samples:(BiologyAIState & {name:string;score:BiologySectionScore;question:string;summary:string;answer:string})[];
 styleBlocks:FrozenStyleBlock[];
};
test('authored Biology AI preserves frozen state geometry palette and actions',async({page},info)=>{
 test.setTimeout(180000);
 await installDiscussionFixture(page.context());await prepareDemoProfile(page);
 await page.evaluate(async()=>{(await import('/js/views.js')).navigate('biology-scores');});
 await page.locator('#biology-score-metabolicFlexibility > .biology-score-summary').click();
 await expect(page.locator('#biology-score-metabolicFlexibility [data-biology-ai-view]').first()).toBeVisible();
 await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.evaluate(async({samples,css})=>{
  const {renderHTML}=await import('/js/components/BiologyAIPresentation.svelte.html.js');
  const {projectBiologyQuestion,projectBiologyAISummary,projectBiologyAIAnswer}=await import('/js/biology-ai-presentation.js');
  const style=document.createElement('style');style.textContent=css;document.head.append(style);
  const host=document.createElement('div');host.id='biology-ai-acceptance';host.style.cssText='position:fixed;inset:0;z-index:20000;overflow:auto;background:var(--bg-primary);padding:12px';document.body.append(host);
  const pair=(name:string,oldHTML:string,newHTML:string)=>{
   const pair=document.createElement('div');pair.dataset.pair=name;
   for(const [key,html] of [['original',oldHTML],['current',newHTML]]){const side=document.createElement('section');side.dataset[key!]='';if(name==='answer-overview'||name==='answer-retry'){const wrapper=document.createElement('div');wrapper.className='biology-coherence-interpretation';wrapper.innerHTML=html!;side.append(wrapper);}else side.innerHTML=html!;pair.append(side);}
   host.append(pair);
  };
  for(const sample of samples){
   pair(`question-${sample.name}`,sample.question,renderHTML({kind:'question',view:projectBiologyQuestion(sample.score)}));
   pair(`summary-${sample.name}`,sample.summary,renderHTML({kind:'summary',view:projectBiologyAISummary(sample.score,sample)}));
   pair(`answer-${sample.name}`,sample.answer,renderHTML({kind:'answer',view:projectBiologyAIAnswer(sample.score,sample)}));
  }
 },{samples:original.samples,css:scopedFrozenStyles(original.styleBlocks)});
 const host=page.locator('#biology-ai-acceptance');let pairs=0;
 for(const width of [320,640,641,650,651,1100])for(const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']){
  await page.setViewportSize({width,height:1000});await page.mouse.move(0,0);await page.evaluate(async theme=>(await import('/js/theme.js')).setTheme(theme),theme);
  await expect.poll(()=>host.evaluate(element=>{
   const properties=['display','position','width','height','fontSize','fontWeight','fontFamily','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','gridTemplateColumns','gridTemplateRows','alignItems','alignContent','borderTopWidth','borderTopStyle','borderTopColor','borderRadius','whiteSpace','overflow','opacity','backgroundColor','backgroundImage','backgroundSize','color'] as const;
   const failures:string[]=[];
   for(const pair of element.querySelectorAll('[data-pair]')){
    const before=[...pair.querySelector('[data-original]')!.querySelectorAll('*')],after=[...pair.querySelector('[data-current]')!.querySelectorAll('*')];
    if(before.length!==after.length){failures.push(`${pair.getAttribute('data-pair')}: ${before.length}/${after.length}`);continue;}
    before.forEach((node,index)=>{const a=getComputedStyle(node),b=getComputedStyle(after[index]!);for(const property of properties)if(a[property]!==b[property])failures.push(`${pair.getAttribute('data-pair')}/${index}/${property}: ${b[property]} != ${a[property]}`);});
   }return failures;
  }),{message:`${width}/${theme} frozen AI geometry and palette`}).toEqual([]);
  pairs+=await host.locator('[data-pair]').count();
 }
 for(const panel of await host.locator('[data-pair=answer-overview] .biology-score-ai').all())expect(await panel.evaluate(node=>getComputedStyle(node).marginTop)).toBe('8px');
 await host.locator('[data-original]').evaluateAll(nodes=>nodes.forEach(node=>node.remove()));
 let controls=0;
 for(const control of await host.locator('.biology-score-ai-teaser-action:enabled').all()){
  await expect(control).toBeVisible();await control.focus();await expect(control).toBeFocused();controls++;
  const style=await control.evaluate(node=>({outline:parseFloat(getComputedStyle(node).outlineWidth),width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,coarse:matchMedia('(pointer:coarse)').matches}));
  expect(style.outline).toBeGreaterThanOrEqual(2);if(style.coarse){expect(style.width).toBeGreaterThanOrEqual(44);expect(style.height).toBeGreaterThanOrEqual(44);}
 }
 for(const group of await host.locator('[data-current] .biology-question-items').all()){
  for(const item of await group.locator('span + span').all()){const pseudo=await item.evaluate(node=>({content:getComputedStyle(node,'::before').content,margin:getComputedStyle(node,'::before').marginRight}));expect(pseudo.content).toBe('"·"');expect(pseudo.margin).toBe('8px');}
 }
 await expect(host.locator('[data-pair=summary-processing] [data-current] button')).toBeDisabled();
 await expect(host.locator('[data-pair=summary-retry] [data-current] button')).toHaveAttribute('data-biology-score-action','retry-save-score-insights');
 for(const skeleton of await host.locator('[data-current] .biology-score-ai-skeleton > span').all())expect(await skeleton.evaluate(node=>getComputedStyle(node).animationName)).toBe('none');
 expect(errors).toEqual([]);fs.writeFileSync(info.outputPath('biology-ai-parity.json'),JSON.stringify({pairs,controls,widths:[320,640,641,650,651,1100],themes:6,pageErrors:errors}));
});
