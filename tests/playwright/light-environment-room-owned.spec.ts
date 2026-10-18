import {nativeEnvironmentView,nativeBurdenView,expectedGenuineLightChildren} from '../helpers/light-genuine-child-native-receipts.js';
import fs from 'node:fs';
import {expect,test} from './coverage-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {scopedFrozenStyles,type FrozenStyleBlock} from '../helpers/frozen-style-scope.js';
interface Sample{name:string;data:unknown;expanded:boolean;callbacks:boolean;embedded:boolean;section:string}
const original=JSON.parse(fs.readFileSync('tests/fixtures/light-environment-room-original.json','utf8')) as {now:number;cases:Sample[];styleBlocks:FrozenStyleBlock[]};
const auditStyles=(JSON.parse(fs.readFileSync('tests/fixtures/light-audit-original.json','utf8')) as {styleBlocks:FrozenStyleBlock[]}).styleBlocks;
const names=['empty','empty-standalone','Bedroom/false','Bedroom/true','Office/true','source-unknown','hours-0','skipped','nested-and-portable','all-readings','older-and-qualitative'];
const examples=original.cases.filter(sample=>names.includes(sample.name)).map(sample=>({...sample,section:expectedGenuineLightChildren(sample.section),burdenView:nativeBurdenView(),measurementView:nativeEnvironmentView('measurement'),roomView:nativeEnvironmentView('room')}));
const roomThemes = ['dark','light','glass','synth-sunrise','neuromancer','cyberterm'] as const;
test.beforeAll(() => {
  expect(roomThemes).toEqual(['dark','light','glass','synth-sunrise','neuromancer','cyberterm']);
  expect(examples).toHaveLength(11);
});
for (const [themeIndex, targetTheme] of roomThemes.entries()) test(`authored rooms preserve independent layouts and readable accessible editor controls: ${targetTheme}`,async({page},info)=>{
  test.setTimeout(120000);await installDiscussionFixture(page.context());await page.goto('/app');await expect(page.locator('html[data-app-ready]')).toBeAttached();await page.emulateMedia({reducedMotion:'reduce'});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(async({examples,css,now})=>{
    localStorage.setItem('labcharts-ai-paused','true');await(await import('/js/light-sun-loader.js')).loadLightSunUI();
    // Explicit improvements: native disclosure controls; current-theme readable ink;
    // opaque selected-chip surfaces; full opacity for skipped rooms; 44px coarse controls;
    // embedded sections omit their redundant outer gap.
    const style=document.createElement('style');style.textContent=css+`
[data-original] .light-env-room-disclosure{color:var(--text-primary)}[data-original] .light-env-room-disclosure.light-env-card-skipped{opacity:1}
[data-original] .light-env-empty,[data-original] .ctx-label{color:var(--text-secondary)}[data-original] .light-audits-block{margin-top:18px}[data-original] .light-audits-summary{margin:0}
[data-original] .light-env-room-disclosure-signals,[data-original] .light-env-room-disclosure-chevron,[data-original] .light-env-room-empty,[data-original] .light-env-quickpicks-label,[data-original] .light-env-picker-label,[data-original] .light-env-picker-help,[data-original] .light-env-picker-more summary,[data-original] .light-env-reading-time,[data-original] .light-env-room-today-copy span{color:var(--text-secondary)}
[data-original] .light-env-room-status-green{color:var(--success-ink)}[data-original] .light-env-room-status-yellow{color:var(--warning-ink)}[data-original] .light-env-room-status-orange{color:var(--text-primary)}[data-original] .light-env-room-status-red{color:var(--danger-ink)}
[data-original] .light-env-tool-pill-primary{color:var(--text-primary)}[data-original] .light-env-chip-active{color:var(--on-accent)}[data-original] .light-env-section-embedded{margin-top:0}
@media(pointer:coarse){[data-original] .ctx-input,[data-original] .ctx-select,[data-original] .light-env-quickpick,[data-original] .import-btn:not(:where(.light-audits-block *)){min-height:44px}[data-original] .light-env-quickpick,[data-original] .import-btn:not(:where(.light-audits-block *)){min-width:44px}}
`;document.head.append(style);
    const host=document.createElement('div');host.id='environment-room-acceptance';host.style.cssText='position:fixed;inset:0;z-index:20000;overflow:auto;background:var(--bg-primary);padding:12px';document.body.append(host);
    const env=await import('/js/light-env.js'),{state}=await import('/js/state.js'),before=state.importedData,prior=env.configureLightEnv({});const clock=Date.now;Date.now=()=>now;
    try{for(const sample of examples){
      (state as {importedData:unknown}).importedData=structuredClone(sample.data);
      localStorage.setItem('labcharts-light-env-active-room',sample.expanded?String(state.importedData?.lightEnvironment?.rooms[0]?.id||''):'__none__');
      env.configureLightEnv({getMeasurementsForRoom:(id:unknown)=>(state.importedData?.lightMeasurements||[]).filter(m=>m.roomId===id),getBurdenInterpretationView:sample.callbacks?()=>sample.burdenView:null,getMeasurementAIView:sample.callbacks?()=>sample.measurementView:null,getRoomAIView:sample.callbacks?()=>sample.roomView:null,getScreenAIView:null});
      const pair=document.createElement('div');pair.dataset.pair=sample.name;
      const reference=document.createElement('section');reference.dataset.original='';reference.innerHTML=sample.section;
      const current=document.createElement('section');current.dataset.current='';current.innerHTML=env.renderEnvironmentSection({embedded:sample.embedded});
      pair.append(reference,current);host.append(pair);
    }}finally{Date.now=clock;env.configureLightEnv(prior);state.importedData=before;}
  },{examples,css:scopedFrozenStyles([...original.styleBlocks,...auditStyles]),now:original.now});
  const host=page.locator('#environment-room-acceptance');let pairs=0;
  let previousWidth = 320;
  const warmTheme = async (theme: typeof roomThemes[number]) => {
    await page.evaluate(async theme => (await import('/js/theme.js')).setTheme(theme), theme);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme || 'dark')).toBe(theme);
    await host.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  };
  for(const width of [320,375,600,601,700,1100]){
    // The original matrix ended each previous width in Cyberterm before resizing.
    if (width !== 320) {
      await page.setViewportSize({width:previousWidth,height:1000});
      await warmTheme('cyberterm');
    }
    await page.setViewportSize({width,height:1000});
    if (themeIndex > 0) await warmTheme(roomThemes[themeIndex - 1]!);
    previousWidth = width;
    for(const theme of [targetTheme]){
    await page.mouse.move(0,0);await page.evaluate(async theme=>(await import('/js/theme.js')).setTheme(theme),theme);await host.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const result=await host.evaluate(element=>{
      const props=['display','width','height','fontSize','fontWeight','fontFamily','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','gridTemplateColumns','alignItems','borderTopWidth','borderTopStyle','borderRadius','whiteSpace','overflow','opacity','backgroundColor','color'] as const;
      const selectors=['.light-env-room-disclosure','.light-env-room-disclosure-head','.light-env-room-disclosure-name','.light-env-room-disclosure-signals','.light-env-room-disclosure-chevron','.light-env-room-disclosure-body','.light-env-room-step','.light-env-room-step-head','.light-env-room-status-pill','.light-env-room-step-tag','.light-env-room-step-body','.light-env-room-setup-body','.light-env-room-name-field','.light-env-room-name-input','.light-env-room-today-row','.light-env-room-today-copy','.light-env-picker','.light-env-picker-label','.light-env-chip-row','.light-env-chip','.light-env-picker-help','.light-env-picker-more','.light-env-picker-more summary','.light-env-picker-more select','.light-env-picker-more input','.light-env-measure-toolbar','.light-env-tool-pill','.light-env-room-empty','.light-env-room-readings','.light-env-reading','.light-env-reading-icon','.light-env-reading-value','.light-env-reading-time','.light-env-room-screens-list','.light-env-room-quickpicks','.light-env-quickpicks-row','.light-env-quickpick','.light-env-quickpicks-label','.light-env-block','.light-env-block-head','.light-env-screen-cards'];
      const failures:string[]=[];
      for(const pair of element.querySelectorAll('[data-pair]'))for(const selector of selectors){
        const filter=(root:Element)=>[...root.querySelectorAll<HTMLElement>(selector)].filter(node=>!node.closest('.light-env-screen-card'));
        const old=filter(pair.querySelector('[data-original]')!),current=filter(pair.querySelector('[data-current]')!);
        if(old.length!==current.length){failures.push(`${pair.getAttribute('data-pair')}/${selector} count ${old.length}/${current.length}`);continue;}
        old.forEach((node,index)=>{const a=getComputedStyle(node),b=getComputedStyle(current[index]!);for(const prop of props)if(a[prop]!==b[prop])failures.push(`${pair.getAttribute('data-pair')}/${selector}/${index}/${prop}: ${b[prop]} != ${a[prop]}`);});
      }
      return{failures,overflow:element.scrollWidth-element.clientWidth};
    });expect(result.failures,`${width}/${theme} frozen room geometry and palette`).toEqual([]);expect(result.overflow).toBeLessThanOrEqual(1);pairs+=examples.length;
  }}
  await host.locator('[data-original]').evaluateAll(elements=>elements.forEach(element=>element.remove()));
  await host.locator('details.light-env-picker-more').evaluateAll(elements=>elements.forEach(element=>(element as HTMLDetailsElement).open=true));
  // Accessibility originally followed the complete geometry matrix at 1100px.
  await warmTheme(themeIndex > 0 ? roomThemes[themeIndex - 1]! : 'cyberterm');
  for(const theme of [targetTheme]){
    await page.evaluate(async theme=>(await import('/js/theme.js')).setTheme(theme),theme);await host.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    for(const pair of await host.locator('[data-pair]').all()){
      // Audit the migrated room/section controls; saved audits retain their existing owner.
      await pair.locator('.light-audits-block').evaluateAll(elements=>elements.forEach(element=>element.remove()));
      await pair.scrollIntoViewIfNeeded();const violations=await pair.evaluate(async element=>(await(window as unknown as{axe:typeof import('axe-core')}).axe.run(element,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(item=>({id:item.id,nodes:item.nodes.map(node=>({target:node.target,summary:node.failureSummary}))})));
      expect(violations,`${theme}/${await pair.getAttribute('data-pair')} accessibility`).toEqual([]);
    }
  }
  let focusCount: number | null = null;
  if (targetTheme === 'cyberterm') {
  await page.keyboard.press('Tab');
  const focus=await host.evaluate(async element=>{
    const failures:string[]=[];let count=0;
    for(const control of element.querySelectorAll<HTMLElement>('button,input:not([type=checkbox]),select,summary')){
      if(!control.getClientRects().length)continue;control.focus();await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));const css=getComputedStyle(control),box=control.getBoundingClientRect();
      if(document.activeElement!==control||css.outlineWidth!=='2px')failures.push(`focus ${count}/${control.className}: ${css.outlineWidth}`);
      if(matchMedia('(pointer:coarse)').matches&&(box.width<44||box.height<44))failures.push(`target ${count}: ${box.width}x${box.height}`);count++;
    }return{failures,count};
  });expect(focus.count).toBeGreaterThan(100);expect(focus.failures).toEqual([]);
  focusCount = focus.count;
  }
  expect(errors).toEqual([]);expect(pairs).toBe(examples.length*6);
  await fs.promises.writeFile(info.outputPath('environment-room-pairs.json'),JSON.stringify({pairs,examples:examples.length,theme:targetTheme,widths:[320,375,600,601,700,1100],focus:focusCount}));
});

test('assessment modal preserves responsive scroll containment and native room keyboard disclosure',async({page},info)=>{
  await installDiscussionFixture(page.context());await page.goto('/app');await expect(page.locator('html[data-app-ready]')).toBeAttached();await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(async()=>{
    localStorage.setItem('labcharts-ai-paused','true');await(await import('/js/light-sun-loader.js')).loadLightSunUI();
    const {state}=await import('/js/state.js');state.importedData!.lightEnvironment={rooms:[{id:'modal-bedroom',name:'Bedroom',primarySource:'led-warm',hoursOccupiedPerDay:8,daylightLevel:'some',eveningHoursAfterSunset:2}],screens:[]};
  });
  const layouts:unknown[]=[];
  for(const width of [320,600,700,701,707,1100]){
    await page.setViewportSize({width,height:800});
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    // WebKit WPE excludes its 6px scrollbar from the CSS media-query viewport.
    // Verify the effective breakpoint and retain exact modal bounds on either side.
    const viewport=await page.evaluate(()=>({innerWidth,clientWidth:document.documentElement.clientWidth,mobile:matchMedia('(max-width:700px)').matches}));
    expect(viewport.innerWidth).toBe(width);expect(viewport.mobile).toBe(viewport.clientWidth<=700);
    await page.evaluate(async()=>(await import('/js/light-env.js')).openLightEnvironmentAssessment());
    const dialog=page.getByRole('dialog',{name:'Indoor Light Assessment',exact:true});await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'Close',exact:true})).toBeFocused();
    const geometry=await dialog.evaluate(element=>{const css=getComputedStyle(element),box=element.getBoundingClientRect();return{height:box.height,width:box.width,maxHeight:css.maxHeight,overflow:css.overflowY,scrollable:element.scrollHeight>element.clientHeight};});
    expect(geometry.overflow).toBe('auto');expect(geometry.scrollable).toBe(true);expect(geometry.height,`${width}px modal geometry: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(viewport.mobile?800:752);expect(geometry.width).toBeLessThanOrEqual(width);expect(geometry.maxHeight).toBe(`${viewport.mobile?800:752}px`);layouts.push({requestedWidth:width,viewport,geometry});
    // Check sync preservation before disclosure actions schedule their existing anchor scroll.
    await dialog.evaluate(element=>element.scrollTop=180);const scroll=await dialog.evaluate(element=>element.scrollTop);expect(scroll).toBeGreaterThan(0);
    await page.evaluate(()=>window.dispatchEvent(new Event('labcharts-sync-applied')));await expect.poll(()=>dialog.evaluate(element=>element.scrollTop)).toBe(scroll);
    const disclosure=dialog.locator('.light-env-room-disclosure-toggle');await disclosure.focus();
    const expanded=await disclosure.getAttribute('aria-expanded');await page.keyboard.press('Space');await expect(disclosure).toHaveAttribute('aria-expanded',expanded==='true'?'false':'true');await disclosure.focus();await page.keyboard.press('Enter');await expect(disclosure).toHaveAttribute('aria-expanded',expanded!);
    if(width===1100){
      // The existing layout retry runs at 60ms; a newer scroll must survive it.
      await dialog.evaluate(async element=>{element.scrollTop=180;await new Promise<void>(resolve=>setTimeout(resolve,80));});
      expect(await dialog.evaluate(element=>element.scrollTop)).toBe(180);
    }
    await dialog.getByRole('button',{name:'Close',exact:true}).click();await expect(dialog).toHaveCount(0);
  }
  await fs.promises.writeFile(info.outputPath('environment-room-modal.json'),JSON.stringify(layouts));
});
