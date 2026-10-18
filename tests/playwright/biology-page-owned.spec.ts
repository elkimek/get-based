import fs from 'node:fs';
import postcss from 'postcss';
import {expect,test} from './coverage-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {prepareDemoProfile} from './biology-score-fixture.js';
import type {BiologyPageInput} from '../../js/biology-page-presentation.js';
interface StyleBlock {css:string;atRules:{name:string;params:string}[]}
const frozen=JSON.parse(fs.readFileSync('tests/fixtures/biology-page-original.json','utf8')) as {classes:string[];samples:(BiologyPageInput & {name:string;html:string})[];styleBlocks:StyleBlock[]};
const decode=(html:string)=>html.replace(/class="@(\d+)"/g,(_,index:string)=>`class="${frozen.classes[Number(index)]}"`);
const css=frozen.styleBlocks.map(block=>{
 const rule=postcss.parse(block.css);rule.walkRules(node=>{node.selector=node.selectors.map(selector=>`:where([data-original]) ${selector}`).join(',');});
 return block.atRules.reduceRight((text,at)=>`@${at.name} ${at.params}{${text}}`,rule.toString());
}).join('\n');
const themes=['dark','light','glass','synth-sunrise','neuromancer','cyberterm'] as const;
for(const theme of themes)test(`owned Biology page preserves frozen geometry, container layouts and typed controls (${theme})`,async({page},info)=>{
 test.setTimeout(300000);await installDiscussionFixture(page.context());await prepareDemoProfile(page);
 await page.evaluate(async()=> (await import('/js/views.js')).navigate('biology-scores'));
 await page.emulateMedia({reducedMotion:'reduce'});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.evaluate(async({samples,css})=>{
  const [{projectBiologyPage},{renderHTML}]=await Promise.all([import('/js/biology-page-presentation.js'),import('/js/components/BiologyScoresPage.svelte.html.js')]);
  const style=document.createElement('style');style.textContent=css;document.head.append(style);
  const host=document.createElement('div');host.id='biology-page-acceptance';host.style.cssText='position:fixed;inset:0;z-index:20000;overflow:auto;background:var(--bg-primary);padding:12px';document.body.append(host);
  const pairs:Record<string,HTMLElement>={};(host as HTMLElement & {pairs?:Record<string,HTMLElement>}).pairs=pairs;
  for(const sample of samples){const pair=document.createElement('div');pair.dataset.pair=sample.name;pair.style.cssText='display:none;position:relative';for(const[kind,html]of [['original',sample.html],['current',renderHTML({view:projectBiologyPage(sample)})]]){const side=document.createElement('section');side.dataset[kind!]='';side.style.cssText='position:absolute;top:0;left:0;width:100%';side.innerHTML=html!;pair.append(side);}pairs[sample.name]=pair;}
 },{samples:frozen.samples.map(sample=>({...sample,html:decode(sample.html)})),css});
 const host=page.locator('#biology-page-acceptance');let pairs=0;
 const selector='.biology-scores-page,.lens-page-header,.lens-page-header h2,.lens-page-header p,.biology-score-header-actions,.date-range-filter,.range-btn,.biology-scores-note,.biology-context-review-details,.biology-context-review-summary,.biology-planning-grid,.biology-score-group,.biology-score-group > h3,.biology-score-group > summary,.biology-score-group > p,.biology-section-count,.lens-page-widgets,.biology-score-lens-row,.biology-score-compact,.biology-score-expanded,.biology-score-detail-tools,.dashboard-widget-tool';
 const widths=[320,650,651,850,851,1200,1201,1440];
 for(const [widthIndex,width] of widths.entries()){
  await page.setViewportSize({width,height:1000});await page.mouse.move(0,0);
  // Reproduce the original width/theme loop's prior theme and stylesheet state.
  // Every later width followed the previous width's Cyberterm pass.
  await page.evaluate(async({theme,previous,widthIndex})=>{
   const {setTheme}=await import('/js/theme.js');
   if(widthIndex>0)await setTheme('cyberterm');
   if(theme!=='dark'||widthIndex>0)await setTheme(previous);
   await setTheme(theme);
  },{theme,previous:themes[(themes.indexOf(theme)+themes.length-1)%themes.length]!,widthIndex});
  for(const expanded of [false,true])for(const sample of frozen.samples){
   await expect.poll(()=>host.evaluate((element,{name,expanded,selector})=>{
    const properties=['display','width','height','font-size','font-weight','font-family','line-height','letter-spacing','padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left','gap','grid-template-columns','grid-auto-flow','align-items','justify-content','border-top-width','border-top-color','border-radius','background-color','color','--biology-panel-offset'];
    const failures:string[]=[];
      // Only one pair is mounted, at a common origin; all strict comparisons remain.
      const pair=(element as HTMLElement & {pairs:Record<string,HTMLElement>}).pairs[name]!;pair.style.display='block';element.replaceChildren(pair);
      for(const node of pair.querySelectorAll('.biology-score-compact,.biology-score-unavailable-group')){if(expanded)node.setAttribute('open','');else node.removeAttribute('open');}
      // Use the unchanged real runtime row-measurement owner on both sides.
      window.dispatchEvent(new Event('resize'));
      const before=[...pair.querySelector('[data-original]')!.querySelectorAll(selector)],after=[...pair.querySelector('[data-current]')!.querySelectorAll(selector)];
      if(before.length!==after.length){failures.push(`${name}/${expanded}: ${before.length}/${after.length}`);return failures;}
      before.forEach((node,index)=>{const a=getComputedStyle(node),b=getComputedStyle(after[index]!);for(const property of properties)if(a.getPropertyValue(property)!==b.getPropertyValue(property))failures.push(`${name}/${expanded}/${node.classList[0]}/${property}: ${b.getPropertyValue(property)} != ${a.getPropertyValue(property)}`);});
    return failures;
   },{name:sample.name,expanded,selector}),{message:`${width}/${theme}/${sample.name}/${expanded?'expanded':'collapsed'} original full-page geometry`}).toEqual([]);
  }
  pairs+=frozen.samples.length*2;
 }
 await host.locator('[data-original]').evaluateAll(nodes=>nodes.forEach(node=>node.remove()));let controls=0;
 for(const sample of frozen.samples){
  await host.evaluate((node,name)=>{const pair=(node as HTMLElement & {pairs:Record<string,HTMLElement>}).pairs[name]!;pair.style.display='block';node.replaceChildren(pair);pair.querySelector('[data-original]')?.remove();for(const details of pair.querySelectorAll('[data-current] details'))details.setAttribute('open','');},sample.name);
  const pair=host.locator('[data-pair]');

  for(const button of await pair.locator('[data-current] .range-btn,[data-current] .dashboard-widget-tool:not(:disabled),[data-current] .biology-page-group-summary').all()){
   await button.focus();await expect(button).toBeFocused();expect(await button.evaluate(node=>parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(2);controls++;
  }
 }
 expect(pairs).toBe(widths.length*frozen.samples.length*2);
 expect(errors).toEqual([]);fs.writeFileSync(info.outputPath('biology-page-parity.json'),JSON.stringify({pairs,controls,widths,theme,themes:1,pageErrors:errors}));
});
