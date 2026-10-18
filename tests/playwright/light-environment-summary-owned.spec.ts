import {nativeEnvironmentView,nativeBurdenView,expectedGenuineLightChildren} from '../helpers/light-genuine-child-native-receipts.js';
import fs from 'node:fs';
import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { scopedFrozenStyles, type FrozenStyleBlock } from '../helpers/frozen-style-scope.js';
interface Sample {name:string;data:unknown;expanded:boolean;callbacks:boolean;embedded:boolean;section:string;summary:string}
const original=JSON.parse(fs.readFileSync('tests/fixtures/light-environment-room-original.json','utf8')) as {now:number;cases:Sample[];styleBlocks:FrozenStyleBlock[]};
const names=['empty','source-unknown','hours-0','hours-6','nested-and-portable','all-readings','older-and-qualitative','audits-and-orphans'];
const examples=original.cases.filter(sample=>names.includes(sample.name)).map(sample=>({...sample,section:expectedGenuineLightChildren(sample.section),burdenView:nativeBurdenView(),measurementView:nativeEnvironmentView('measurement'),roomView:nativeEnvironmentView('room')}));
test('authored assessment summaries preserve independent layouts, severity and accessible controls',async({page},info)=>{
  test.setTimeout(120000);await installDiscussionFixture(page.context());await page.goto('/app');await expect(page.locator('html[data-app-ready]')).toBeAttached();await page.emulateMedia({reducedMotion:'reduce'});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(async({examples,css,now})=>{
    localStorage.setItem('labcharts-ai-paused','true');await(await import('/js/light-sun-loader.js')).loadLightSunUI();
    // Declared improvements use current-theme foregrounds, readable small-text ink and 44px touch actions.
    const style=document.createElement('style');style.textContent=css+`[data-original] .light-env-assessment-summary,[data-original] .light-env-summary{color:var(--text-primary)}[data-original] .light-env-summary-kicker,[data-original] .light-env-summary-parts,[data-original] .light-env-assessment-parts,[data-original] .light-env-assessment-metric-label,[data-original] .light-env-assessment-metric span:last-child{color:var(--text-secondary)}@media(pointer:coarse){[data-original] .dashboard-action-btn{min-height:44px;min-width:44px}}`;document.head.append(style);
    const host=document.createElement('div');host.id='environment-summary-acceptance';host.style.cssText='position:fixed;inset:0;z-index:20000;overflow:auto;background:var(--bg-primary);padding:12px';document.body.append(host);
    const env=await import('/js/light-env.js'),{state}=await import('/js/state.js'),before=state.importedData,prior=env.configureLightEnv({getMeasurementsForRoom:null,getBurdenInterpretationView:null});const clock=Date.now;Date.now=()=>now;
    try{for(const sample of examples){
      (state as {importedData:unknown}).importedData=structuredClone(sample.data);
      env.configureLightEnv({getMeasurementsForRoom:(id:unknown)=>(state.importedData?.lightMeasurements||[]).filter(m=>m.roomId===id),getBurdenInterpretationView:sample.callbacks?()=>sample.burdenView:null});
      const oldSection=document.createElement('div');oldSection.innerHTML=sample.section;const newSection=document.createElement('div');newSection.innerHTML=env.renderEnvironmentSection({embedded:sample.embedded});
      const pair=document.createElement('div');pair.dataset.pair=sample.name;
      const reference=document.createElement('section');reference.dataset.original='';reference.innerHTML=sample.summary;reference.append(oldSection.querySelector('.light-env-summary')!);
      const current=document.createElement('section');current.dataset.current='';current.innerHTML=env.renderEnvironmentAssessmentSummary();current.append(newSection.querySelector('.light-env-summary')!);
      pair.append(reference,current);host.append(pair);
    }}finally{Date.now=clock;env.configureLightEnv(prior);state.importedData=before;}
  },{examples,css:scopedFrozenStyles(original.styleBlocks.filter(block=>/light-env-(?:assessment-(?:summary|status|tier|parts|lead|metric|actions)|summary)/.test(block.selector))),now:original.now});
  const host=page.locator('#environment-summary-acceptance');let pairs=0;
  for(const width of [320,420,421,600,700,701,1100]){await page.setViewportSize({width,height:1000});
    for(const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']){
      await page.mouse.move(0,0);await page.evaluate(async theme=>(await import('/js/theme.js')).setTheme(theme),theme);
      await host.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const result=await host.evaluate(element=>{
        const props=['display','width','height','fontSize','fontWeight','fontFamily','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','gridTemplateColumns','alignItems','borderTopWidth','borderTopStyle','borderLeftWidth','borderLeftColor','borderRadius','whiteSpace','overflow','opacity','boxShadow','backgroundImage'] as const;
        const selectors=['.light-env-assessment-summary','.light-env-assessment-status','.light-env-assessment-tier','.light-env-assessment-parts','.light-env-assessment-lead','.light-env-assessment-metrics','.light-env-assessment-metric','.light-env-assessment-metric-label','.light-env-assessment-metric strong','.light-env-assessment-metric span:last-child','.light-env-assessment-actions','.dashboard-action-btn','.light-env-summary','.light-env-summary-kicker','.light-env-summary-head','.light-env-summary-tier','.light-env-summary-parts','.light-env-summary-interp'];
        const failures:string[]=[];
        for(const pair of element.querySelectorAll('[data-pair]'))for(const selector of selectors){
          const old=pair.querySelector('[data-original]')!.querySelectorAll(selector),current=pair.querySelector('[data-current]')!.querySelectorAll(selector);
          if(old.length!==current.length){failures.push(`${pair.getAttribute('data-pair')}/${selector} count ${old.length}/${current.length}`);continue;}
          old.forEach((node,index)=>{const a=getComputedStyle(node),b=getComputedStyle(current[index]!);for(const prop of props)if(a[prop]!==b[prop])failures.push(`${pair.getAttribute('data-pair')}/${selector}/${index}/${prop}: ${b[prop]} != ${a[prop]}`);});
        }
        const probe=document.createElement('span');probe.style.cssText='position:fixed;visibility:hidden;background:var(--accent);color:var(--on-accent)';element.append(probe);const palette=getComputedStyle(probe);
        for(const button of element.querySelectorAll('[data-current] .dashboard-action-btn-primary')){const css=getComputedStyle(button);if(css.backgroundColor!==palette.backgroundColor||css.color!==palette.color)failures.push(`primary palette: ${css.backgroundColor}/${css.color}`);}
        probe.remove();return{failures,overflow:element.scrollWidth-element.clientWidth};
      });
      expect(result.failures,`${width}/${theme} original geometry and severity`).toEqual([]);expect(result.overflow).toBeLessThanOrEqual(1);pairs+=examples.length;
    }
  }
  await host.locator('[data-original]').evaluateAll(elements=>elements.forEach(element=>element.remove()));
  for(const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']){
    await page.evaluate(async theme=>(await import('/js/theme.js')).setTheme(theme),theme);
    await host.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    for(const pair of await host.locator('[data-pair]').all()){
      await pair.scrollIntoViewIfNeeded();
      const violations=await pair.evaluate(async element=>(await(window as unknown as{axe:typeof import('axe-core')}).axe.run(element,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(item=>({id:item.id,nodes:item.nodes.map(node=>({target:node.target,summary:node.failureSummary}))})));
      expect(violations,`${theme}/${await pair.getAttribute('data-pair')} accessibility`).toEqual([]);
    }
    const primary=host.locator('.dashboard-action-btn-primary').first();await primary.hover();
    const hover=await primary.evaluate(button=>{const probe=document.createElement('span');probe.style.cssText='color:var(--text-primary);background:var(--bg-hover)';button.parentElement!.append(probe);const a=getComputedStyle(button),b=getComputedStyle(probe);const observed={color:a.color,background:a.backgroundColor,expectedColor:b.color,expectedBackground:b.backgroundColor,hover:button.matches(':hover')};probe.remove();return observed;});
    expect({color:hover.color,background:hover.background,hover:hover.hover},`${theme} readable hover`).toEqual({color:hover.expectedColor,background:hover.expectedBackground,hover:true});
    await page.mouse.move(0,0);
  }
  await page.keyboard.press('Tab');
  const focus=await host.evaluate(async element=>{
    const failures:string[]=[];let count=0;
    for(const control of element.querySelectorAll<HTMLButtonElement>('button')){control.focus();await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));const css=getComputedStyle(control),box=control.getBoundingClientRect();if(document.activeElement!==control||css.outlineWidth!=='2px')failures.push(`focus ${count}: ${css.outlineWidth}`);if(matchMedia('(pointer:coarse)').matches&&(box.width<44||box.height<44))failures.push(`target ${count}: ${box.width}x${box.height}`);count++;}
    return{failures,count};
  });expect(focus.count).toBe(15);expect(focus.failures).toEqual([]);
  expect(errors).toEqual([]);expect(pairs).toBe(examples.length*42);
  await fs.promises.writeFile(info.outputPath('environment-summary-pairs.json'),JSON.stringify({pairs,examples:examples.length,themes:6,widths:[320,420,421,600,700,701,1100],focus:focus.count}));
});
