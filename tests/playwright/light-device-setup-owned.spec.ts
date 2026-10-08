import fs from 'node:fs';
import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { scopedFrozenStyles, type FrozenStyleBlock } from '../helpers/frozen-style-scope.js';
import type { LightDeviceRecord } from '../../js/light-devices-store.js';
interface Sample {
  kind:'custom'|'presets';name:string;hasAI:boolean;hasVision?:boolean;unit?:string;
  presets?:LightDeviceRecord[];types?:Record<string,{icon?:string;label?:string}>;html:string;
}
const original=JSON.parse(fs.readFileSync('tests/fixtures/light-device-setup-original.json','utf8')) as {cases:Sample[];styleBlocks:FrozenStyleBlock[]};
test('authored device setup retains original branches, themes, selected presets and unit states with accessible controls',async({page},info)=>{
  test.setTimeout(120000);await installDiscussionFixture(page.context());await page.goto('/app');await expect(page.locator('html[data-app-ready]')).toBeAttached();await page.emulateMedia({reducedMotion:'reduce'});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(async({original,css})=>{
    await(await import('/js/light-sun-loader.js')).loadLightSunUI();
    const style=document.createElement('style');
    // Explicit accessibility changes only: readable ink, URL sizing and coarse targets.
    style.textContent=css+`:where([data-original]) :is(.ctx-label,.modal-body-hint,.dev-unit-btn){color:var(--text-secondary);}:where([data-original]) .dev-unit-btn:not([data-light-session-presentation] *){color:var(--text-secondary);}:where([data-original]) .dev-unit-btn.active:not([data-light-session-presentation] *){color:var(--on-accent);}:where([data-original]) #custom-dev-url{min-width:0;}@media(pointer:coarse){:where([data-original]) :is(button,.ctx-input,.ctx-select){min-height:44px;min-width:44px;}:where([data-original]) #custom-dev-url{min-width:44px;}}`;
    document.head.append(style);
    const {renderHTML}=await import('/js/components/LightDeviceSetup.svelte.html.js');
    const model=await import('/js/light-device-setup-presentation.js');
    const host=document.createElement('div');host.id='device-setup-acceptance';host.style.cssText='position:fixed;inset:0;z-index:20000;overflow:auto;background:var(--bg-primary);padding:12px';document.body.append(host);
    const samples=[...original.cases,...original.cases.filter(sample=>sample.name.endsWith('full'))];
    host.innerHTML=samples.map((sample,index)=>{
      const current=sample.kind==='presets'?renderHTML({kind:'presets',view:model.projectDevicePresets({presets:sample.presets!,types:sample.types!,hasAI:sample.hasAI})}):renderHTML({kind:'custom',view:model.projectDeviceCustomSetup({hasAI:sample.hasAI,hasVision:!!sample.hasVision,unitSystem:sample.unit})});
      return `<div data-pair="${index}">${[['original',sample.html],['current',current]].map(([kind,html])=>`<section data-${kind} class="modal-overlay show" style="position:static;padding:0;background:none;overflow:visible;backdrop-filter:none;-webkit-backdrop-filter:none">${html}</section>`).join('')}</div>`;
    }).join('');
    for(const pair of host.querySelectorAll('[data-pair="10"],[data-pair="11"]'))for(const section of pair.children){const row=section.querySelector('.light-device-preset-row')!;row.classList.add('active');row.setAttribute('aria-pressed','true');section.querySelector<HTMLButtonElement>('#add-device-confirm')!.disabled=false;}
  },{original,css:scopedFrozenStyles(original.styleBlocks).replaceAll('[data-original]',':where([data-original])')});
  const host=page.locator('#device-setup-acceptance');let pairs=0;
  for(const width of [320,375,600,768,1100]){
    await page.setViewportSize({width,height:1000});
    for(const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']){
      await page.mouse.move(0,0);await page.evaluate(async theme=>(await import('/js/theme.js')).setTheme(theme),theme);
      await host.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      await expect.poll(()=>host.evaluate(element=>element.getAnimations({subtree:true}).filter(animation=>animation instanceof CSSTransition&&animation.playState==='running').length)).toBe(0);
      const result=await host.evaluate(element=>{
        const props=['display','width','height','minWidth','maxWidth','minHeight','fontSize','fontWeight','lineHeight','marginTop','marginBottom','paddingTop','paddingRight','paddingBottom','paddingLeft','gap','alignItems','borderTopWidth','borderTopStyle','borderTopColor','backgroundColor','backgroundImage','borderRadius','color','boxShadow','opacity','overflow','flexGrow','flexShrink','letterSpacing','whiteSpace','overflowWrap'] as const;
        const errors:string[]=[];
        for(const pair of element.querySelectorAll('[data-pair]')){
          const old=pair.querySelector('[data-original]')!.querySelectorAll('*'),current=pair.querySelector('[data-current]')!.querySelectorAll('*');
          if(old.length!==current.length){errors.push(`nodes ${pair.getAttribute('data-pair')}: ${old.length}/${current.length}`);continue;}
          old.forEach((node,index)=>{const a=getComputedStyle(node),b=getComputedStyle(current[index]!);for(const prop of props)if(a[prop]!==b[prop])errors.push(`${pair.getAttribute('data-pair')}/${index}/${prop}: ${b[prop]} != ${a[prop]}`);});
        }
        return{errors,overflow:element.scrollWidth-element.clientWidth};
      });
      expect(result.errors,`${width}/${theme} original styles`).toEqual([]);expect(result.overflow).toBeLessThanOrEqual(1);pairs+=12;
    }
  }
  for(const index of [2,10]){
    const pair=host.locator(`[data-pair="${index}"]`),selector='.light-device-preset-row';
    const read=(element:Element)=>{const css=getComputedStyle(element);return{background:css.backgroundColor,border:css.borderTopColor,shadow:css.boxShadow};};
    const old=pair.locator(`[data-original] ${selector}`).first(),current=pair.locator(`[data-current] ${selector}`).first();
    await old.hover();await expect.poll(()=>old.evaluate(element=>element.getAnimations().filter(animation=>animation.playState==='running').length)).toBe(0);const expected=await old.evaluate(read);
    await current.hover();await expect.poll(()=>current.evaluate(element=>element.getAnimations().filter(animation=>animation.playState==='running').length)).toBe(0);expect(await current.evaluate(read)).toEqual(expected);
  }
  await host.locator('[data-original]').evaluateAll(elements=>elements.forEach(element=>element.remove()));
  // Independent copies are displayed together only for style comparison. Real
  // dialogs have unique IDs; namespace those copies before accessibility checks.
  await host.locator('[data-pair]').evaluateAll(pairs=>pairs.forEach((pair,index)=>{
    for(const element of pair.querySelectorAll<HTMLElement>('[id]'))element.id=`case-${index}-${element.id}`;
    for(const element of pair.querySelectorAll('[aria-labelledby]'))element.setAttribute('aria-labelledby',`case-${index}-${element.getAttribute('aria-labelledby')}`);
  }));
  for(const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']){
    await page.evaluate(async theme=>(await import('/js/theme.js')).setTheme(theme),theme);
    await host.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    for(const index of [0,4,8,10]){
      const violations=await host.locator(`[data-pair="${index}"] [data-current]`).evaluate(async element=>(await(window as unknown as{axe:typeof import('axe-core')}).axe.run(element,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(item=>({id:item.id,nodes:item.nodes.map(node=>({target:node.target,summary:node.failureSummary}))})));
      expect(violations,`${theme}/${index} accessibility`).toEqual([]);
    }
  }
  await page.keyboard.press('Tab');
  const controls=await host.evaluate(async element=>{
    const errors:string[]=[];let checked=0;
    for(const control of element.querySelectorAll<HTMLElement>('button:not(:disabled),input:not([type="hidden"]):not([type="file"]),select')){
      control.focus();const deadline=performance.now()+10000;
      while(getComputedStyle(control).outlineWidth!=='2px'&&performance.now()<deadline)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      const css=getComputedStyle(control),box=control.getBoundingClientRect();
      if(document.activeElement!==control||css.outlineWidth!=='2px')errors.push(`focus ${checked}`);
      if(matchMedia('(pointer:coarse)').matches&&(box.width<44||box.height<44))errors.push(`target ${checked}: ${box.width}x${box.height}`);checked++;
    }return{errors,checked};
  });
  expect(controls.checked).toBeGreaterThan(50);expect(controls.errors).toEqual([]);expect(errors).toEqual([]);expect(pairs).toBe(360);
  await fs.promises.writeFile(info.outputPath('device-setup-style-pairs.json'),JSON.stringify({pairs,themes:6,widths:[320,375,600,768,1100],branches:12,controls:controls.checked}));
});
