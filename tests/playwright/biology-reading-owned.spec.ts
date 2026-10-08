import fs from 'node:fs';
import {expect, test} from './coverage-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {scopedFrozenStyles, type FrozenStyleBlock} from '../helpers/frozen-style-scope.js';
import {prepareDemoProfile} from './biology-score-fixture.js';
import type {BiologyRenderScore} from '../../js/biology-score-render.js';
const original=JSON.parse(fs.readFileSync('tests/fixtures/biology-reading-original.json','utf8')) as {
  samples:{name:string;score:BiologyRenderScore;markers:string;methodology:string}[];
  facts:{facts:[unknown,unknown][];html:string};notes:{flags:string[];html:string}[];
  styleBlocks:FrozenStyleBlock[];
};
test('authored biology reading preserves frozen content geometry and theme styles',async({page},info)=>{
  test.setTimeout(120000);
  await installDiscussionFixture(page.context());await prepareDemoProfile(page);
  await page.evaluate(async()=>{(await import('/js/views.js')).navigate('biology-scores');});
  await page.locator('#biology-score-metabolicFlexibility > .biology-score-summary').click();
  await expect(page.locator('#biology-score-metabolicFlexibility [data-biology-reading-view]').first()).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(async({samples,facts,notes,css})=>{
    const {renderHTML}=await import('/js/components/BiologyReadingPresentation.svelte.html.js');
    const {projectBiologyMarkerSections,projectBiologyMethodology,projectBiologyFacts}=await import('/js/biology-reading-presentation.js');
    const style=document.createElement('style');
    // Deliberate accessibility improvement on both sides of geometry comparison.
    style.textContent=css+'@media(pointer:coarse){[data-original] summary,[data-original] button,[data-original] a{min-width:44px;min-height:44px}[data-original] .biology-score-marker-link,[data-original] a{display:inline-flex;align-items:center}}';document.head.append(style);
    const host=document.createElement('div');host.id='biology-reading-acceptance';host.style.cssText='position:fixed;inset:0;z-index:20000;overflow:auto;background:var(--bg-primary);padding:12px';document.body.append(host);
    const pair=(name:string,oldHTML:string,newHTML:string)=>{
      const pair=document.createElement('div');pair.dataset.pair=name;
      for(const [key,html] of [['original',oldHTML],['current',newHTML]]){const side=document.createElement('section');side.dataset[key!]='';side.innerHTML=html!;pair.append(side);}
      host.append(pair);
    };
    const names=['metabolicFlexibility','fluidFiltrationCoherence','hormoneAxis','empty','edge','zero-weights'];
    for(const sample of samples.filter(sample=>names.includes(sample.name))){
      pair(`markers-${sample.name}`,sample.markers,renderHTML({kind:'markers',sections:projectBiologyMarkerSections(sample.score)}));
      pair(`methodology-${sample.name}`,sample.methodology,renderHTML({kind:'methodology',view:projectBiologyMethodology(sample.score)}));
    }
    pair('facts',facts.html,renderHTML({kind:'facts',facts:projectBiologyFacts(facts.facts)}));
    for(const [index,sample] of notes.entries())if(sample.html)pair(`notes-${index}`,sample.html,renderHTML({kind:'notes',flags:sample.flags}));
    host.querySelectorAll('details').forEach(node=>node.open=true);
  },{samples:original.samples,facts:original.facts,notes:original.notes,css:scopedFrozenStyles(original.styleBlocks)});
  const host=page.locator('#biology-reading-acceptance');let pairs=0;
  for(const width of [320,650,651,700,701,1100])for(const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']){
    await page.setViewportSize({width,height:1000});await page.mouse.move(0,0);await page.evaluate(async theme=>(await import('/js/theme.js')).setTheme(theme),theme);
    await expect.poll(()=>host.evaluate(element=>{
      const properties=['display','position','top','left','zIndex','width','height','fontSize','fontWeight','fontFamily','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','gridTemplateColumns','alignItems','justifyItems','borderTopWidth','borderTopStyle','borderTopColor','borderRadius','whiteSpace','overflow','opacity','backgroundColor','backgroundImage','color'] as const;
      const failures:string[]=[];
      for(const pair of element.querySelectorAll('[data-pair]')){
        const before=[...pair.querySelector('[data-original]')!.querySelectorAll('*')],after=[...pair.querySelector('[data-current]')!.querySelectorAll('*')];
        if(before.length!==after.length){failures.push(`${pair.getAttribute('data-pair')}: ${before.length}/${after.length}`);continue;}
        before.forEach((node,index)=>{const a=getComputedStyle(node),b=getComputedStyle(after[index]!);for(const property of properties)if(a[property]!==b[property])failures.push(`${pair.getAttribute('data-pair')}/${node.tagName}/${index}/${property}: ${b[property]} != ${a[property]}`);});
      }return failures;
    }),{message:`${width}/${theme} frozen reading geometry and palette`}).toEqual([]);
    pairs+=await host.locator('[data-pair]').count();
  }
  await host.locator('[data-original]').evaluateAll(nodes=>nodes.forEach(node=>node.remove()));
  let controls=0;
  for(const control of await host.locator('summary,button,a,[tabindex="0"]').all()){
    if(!await control.isVisible())continue;await control.focus();await expect(control).toBeFocused();controls++;
    const style=await control.evaluate(node=>({outline:parseFloat(getComputedStyle(node).outlineWidth),width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,coarse:matchMedia('(pointer:coarse)').matches}));
    expect(style.outline).toBeGreaterThanOrEqual(2);if(style.coarse){expect(style.width).toBeGreaterThanOrEqual(44);expect(style.height).toBeGreaterThanOrEqual(44);}
  }
  const disclosure=host.locator('[data-pair=methodology-empty] > [data-current] > details > summary');
  await disclosure.focus();await page.keyboard.press('Space');await expect(disclosure.locator('..')).not.toHaveAttribute('open');
  await expect(disclosure.locator('..').locator('.biology-reading-body')).not.toBeVisible();
  await page.keyboard.press('Enter');await expect(disclosure.locator('..')).toHaveAttribute('open','');await expect(disclosure.locator('..').locator('.biology-reading-body')).toBeVisible();
  await page.setViewportSize({width:320,height:1000});
  const scroll=host.locator('[data-pair=markers-metabolicFlexibility] [data-current] [role=region]').first();
  await scroll.focus();await expect(scroll).toBeFocused();
  expect(await scroll.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(true);
  await page.keyboard.press('ArrowRight');
  await expect.poll(()=>scroll.evaluate(node=>node.scrollLeft)).toBeGreaterThan(0);
  expect(errors).toEqual([]);fs.writeFileSync(info.outputPath('biology-reading-parity.json'),JSON.stringify({pairs,controls,widths:[320,650,651,700,701,1100],themes:6,pageErrors:errors}));
});
