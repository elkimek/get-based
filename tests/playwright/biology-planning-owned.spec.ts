import fs from 'node:fs';
import {expect, test} from './coverage-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {scopedFrozenStyles, type FrozenStyleBlock} from '../helpers/frozen-style-scope.js';
import {prepareDemoProfile} from './biology-score-fixture.js';
import type {BiologyRenderScore} from '../../js/biology-score-render.js';
const original=JSON.parse(fs.readFileSync('tests/fixtures/biology-planning-original.json','utf8')) as {
  actions:{name:string;live:BiologyRenderScore[];waiting:BiologyRenderScore[];coherence?:BiologyRenderScore;html:string}[];
  planners:{name:string;scores:BiologyRenderScore[];coherence:BiologyRenderScore|null;html:string}[];
  styleBlocks:FrozenStyleBlock[];
};
test('authored biology planning preserves frozen content geometry and theme styles',async({page},info)=>{
  test.setTimeout(120000);
  await installDiscussionFixture(page.context());await prepareDemoProfile(page);
  await page.evaluate(async()=>{(await import('/js/views.js')).navigate('biology-scores');});
  await expect(page.locator('[data-biology-planning-view]').first()).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(async({actions,planners,css})=>{
    const renderer=await import('/js/biology-score-render.js');
    const style=document.createElement('style');
    // Deliberate accessibility improvement on both sides of geometry comparison.
    style.textContent=css+'@media(pointer:coarse){[data-original] summary,[data-original] button{min-width:44px;min-height:44px}}';document.head.append(style);
    const host=document.createElement('div');host.id='biology-planning-acceptance';host.style.cssText='position:fixed;inset:0;z-index:20000;overflow:auto;background:var(--bg-primary);padding:12px';document.body.append(host);
    const pair=(name:string,oldHTML:string,newHTML:string)=>{
      const pair=document.createElement('div');pair.dataset.pair=name;
      for(const [key,html] of [['original',oldHTML],['current',newHTML]]){const side=document.createElement('section');side.dataset[key!]='';side.innerHTML=html!;pair.append(side);}
      host.append(pair);
    };
    for(const sample of actions.filter(s=>s.html))pair(`checks-${sample.name}`,sample.html,renderer.renderBiologyScoresActionSummary(sample.live,sample.waiting,sample.coherence));
    for(const sample of planners)pair(`coverage-${sample.name}`,sample.html,renderer.renderBiologyScoreCoveragePlanner(sample.scores,sample.coherence));
    host.querySelectorAll('details').forEach(node=>node.open=true);
  },{actions:original.actions,planners:original.planners,css:scopedFrozenStyles(original.styleBlocks)});
  const host=page.locator('#biology-planning-acceptance');let pairs=0;
  for(const width of [320,650,651,760,761,1100])for(const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']){
    await page.setViewportSize({width,height:1000});await page.mouse.move(0,0);await page.evaluate(async theme=>(await import('/js/theme.js')).setTheme(theme),theme);
    await expect.poll(()=>host.evaluate(element=>{
      const properties=['display','width','height','fontSize','fontWeight','fontFamily','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','gridTemplateColumns','alignItems','justifyItems','borderTopWidth','borderTopStyle','borderTopColor','borderRadius','whiteSpace','overflow','opacity','backgroundColor','backgroundImage','color'] as const;
      const failures:string[]=[];
      for(const pair of element.querySelectorAll('[data-pair]')){
        const before=[...pair.querySelector('[data-original]')!.querySelectorAll('*')],after=[...pair.querySelector('[data-current]')!.querySelectorAll('*')];
        if(before.length!==after.length){failures.push(`${pair.getAttribute('data-pair')}: ${before.length}/${after.length}`);continue;}
        before.forEach((node,index)=>{const a=getComputedStyle(node),b=getComputedStyle(after[index]!);for(const property of properties)if(a[property]!==b[property])failures.push(`${pair.getAttribute('data-pair')}/${node.tagName}/${index}/${property}: ${b[property]} != ${a[property]}`);});
      }return failures;
    }),{message:`${width}/${theme} frozen planning geometry and palette`}).toEqual([]);
    pairs+=await host.locator('[data-pair]').count();
  }
  await host.locator('[data-original]').evaluateAll(nodes=>nodes.forEach(node=>node.remove()));
  let controls=0;
  for(const control of await host.locator('summary,button').all()){
    if(!await control.isVisible())continue;await control.focus();await expect(control).toBeFocused();controls++;
    const style=await control.evaluate(node=>({outline:parseFloat(getComputedStyle(node).outlineWidth),width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,coarse:matchMedia('(pointer:coarse)').matches}));
    expect(style.outline).toBeGreaterThanOrEqual(2);if(style.coarse){expect(style.width).toBeGreaterThanOrEqual(44);expect(style.height).toBeGreaterThanOrEqual(44);}
  }
  const disclosure=host.locator('[data-pair=coverage-empty] > [data-current] > details > summary');
  await disclosure.focus();await page.keyboard.press('Space');await expect(disclosure.locator('..')).not.toHaveAttribute('open');
  await expect(disclosure.locator('..').locator('.biology-score-coverage-head')).not.toBeVisible();
  await page.keyboard.press('Enter');await expect(disclosure.locator('..')).toHaveAttribute('open','');await expect(disclosure.locator('..').locator('.biology-score-coverage-head')).toBeVisible();
  expect(errors).toEqual([]);fs.writeFileSync(info.outputPath('biology-planning-parity.json'),JSON.stringify({pairs,controls,widths:[320,650,651,760,761,1100],themes:6,pageErrors:errors}));
});

test('real planning delegates preserve the exact shared lab prompt and score navigation',async({page})=>{
  await installDiscussionFixture(page.context());await prepareDemoProfile(page);
  const expected=await page.evaluate(async()=>{
    (await import('/js/utils.js')).dismissAnalyticsConsent();
    (await import('/js/views.js')).navigate('biology-scores');
    const {computeBiologyScores}=await import('/js/biology-scores.js');const {filterDatesByRange,getActiveData}=await import('/js/data.js');
    const {buildBiologyScoreCoveragePlannerModel,formatBiologyScoreCoveragePlannerPrompt}=await import('/js/biology-score-coverage-planner.js');
    const scores=computeBiologyScores(filterDatesByRange(getActiveData(),{fallbackToAll:false}));
    Object.assign(window,{planningPrompts:[]});
    (await import('/js/biology-scores-runtime.js')).configureBiologyScoresRuntimeDeps({openChatPanel:prompt=>{(window as unknown as {planningPrompts:unknown[]}).planningPrompts.push(prompt);}});
    return formatBiologyScoreCoveragePlannerPrompt(buildBiologyScoreCoveragePlannerModel(scores.filter(s=>s.id!=='biologicalCoherence'),scores.find(s=>s.id==='biologicalCoherence')));
  });
  const plan=page.locator('[data-biology-planning-view]').getByRole('button',{name:'Make lab plan',exact:true});await plan.focus();await page.keyboard.press('Enter');
  expect(await page.evaluate(()=>(window as unknown as {planningPrompts:string[]}).planningPrompts)).toEqual([expected]);
  const next=page.locator('[data-biology-planning-view] [data-biology-score-action="jump-to-domain"]').first();const id=await next.getAttribute('data-biology-score-id');
  await next.focus();await page.keyboard.press('Enter');await expect(page.locator(`#biology-score-${id}`)).toBeVisible();
  await expect(page.locator(`#biology-score-${id}`)).toHaveAttribute('open','');
});
