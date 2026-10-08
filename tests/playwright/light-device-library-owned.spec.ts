import fs from 'node:fs';
import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { scopedFrozenStyles, type FrozenStyleBlock } from '../helpers/frozen-style-scope.js';
import type { LightDeviceRecord, DeviceSessionRecord } from '../../js/light-devices-store.js';
import type { ProductCatalog } from '../../js/recommendations-products.js';
interface Sample { name: string; devices: LightDeviceRecord[]; sessions: DeviceSessionRecord[]; html: string }
const original = JSON.parse(fs.readFileSync('tests/fixtures/light-device-library-original.json', 'utf8')) as {
  now: number; catalog: ProductCatalog; types: Record<string,{icon?:string;label?:string}>; cases: Sample[]; pickerDevices: LightDeviceRecord[]; pickerHTML: string; styleBlocks: FrozenStyleBlock[];
};
const samples = original.cases.filter(sample => ['uvb','combined','sad','custom','empty'].includes(sample.name));
test('authored device library and picker preserve original themes, responsive styles, type bands and accessible controls', async ({page},info) => {
  test.setTimeout(120000); await installDiscussionFixture(page.context()); await page.goto('/app'); await expect(page.locator('html[data-app-ready]')).toBeAttached(); await page.emulateMedia({reducedMotion:'reduce'});
  const errors: string[] = []; page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(async ({original,samples,css}) => {
    await (await import('/js/light-sun-loader.js')).loadLightSunUI();
    const style=document.createElement('style');// Declared improvements: readable link/metadata ink, visible phone delete, coarse 44px targets.
    style.textContent=css+":where([data-original]) .rec-light-device-link{color:var(--accent-light,var(--accent));}:where([data-original]) :is(.light-device-typeline,.light-device-stats,.light-device-feeds-label,.light-device-delete){color:var(--text-secondary);}@media(hover:none){:where([data-original]) .light-device-delete{opacity:1;}}@media(max-width:600px){:where([data-original]) .light-device-delete{opacity:1;}}@media(pointer:coarse){:where([data-original]) :is(.light-device-delete,.light-device-picker-row,.import-btn,.modal-close,.rec-light-device-link){min-height:44px;min-width:44px;}:where([data-original]) .rec-light-device-link{display:inline-flex;align-items:center;}}";document.head.append(style);
    const {renderHTML}=await import('/js/components/LightDevicePresentation.svelte.html.js');
    const model=await import('/js/light-device-library-presentation.js'); const {CHANNEL_DISPLAY}=await import('/js/sun.js');
    const products=await import('/js/recommendations-products.js'); products.setProductRecsEnabled(true);
    const host=document.createElement('div');host.id='device-library-acceptance';host.style.cssText='position:fixed;inset:0;z-index:20000;overflow:auto;background:var(--bg-primary);padding:12px';document.body.append(host);
    const pairs: {old:string;current:string;widget:boolean}[]=[];
    for(const sample of samples){
      const cards=model.projectDeviceLibrary({devices:sample.devices,sessions:sample.sessions,types:original.types,channels:CHANNEL_DISPLAY,affiliateFor:slug=>products.getLightDeviceAffiliateView(original.catalog,slug),now:original.now});
      for(const widget of [false,true])pairs.push({old:sample.html,current:renderHTML({kind:'library',cards}),widget});
    }
    pairs.push({old:original.pickerHTML,current:renderHTML({kind:'picker',rows:model.projectDevicePicker(original.pickerDevices)}),widget:false});
    host.innerHTML=pairs.map((pair,index)=>`<div data-pair="${index}"><section data-original><div class="${pair.widget?'light-page':''}"><div class="${pair.widget?'dashboard-widget':''}" data-widget-id="light-devices"><div class="dashboard-widget-body">${pair.old}</div></div></div></section><section data-current><div class="${pair.widget?'light-page':''}"><div class="${pair.widget?'dashboard-widget':''}" data-widget-id="light-devices"><div class="dashboard-widget-body">${pair.current}</div></div></div></section></div>`).join('');
    // The real picker is displayed inside a shown overlay. Keep that state for both
    // independent trees while letting the paired fixture stay in document flow.
    const pickerPair=host.querySelector<HTMLElement>('[data-pair="10"]')!;
    pickerPair.classList.add('modal-overlay','show');
    pickerPair.style.cssText='position:static;display:block;padding:0;background:none;overflow:visible;backdrop-filter:none;-webkit-backdrop-filter:none';
    // Every type-specific band is checked even when the full matrix uses representative cards.
    const bands=document.createElement('div');bands.id='device-band-acceptance';
    bands.innerHTML=original.cases.filter(sample=>sample.devices.length).map(sample=>{
      const cards=model.projectDeviceLibrary({devices:sample.devices,sessions:sample.sessions,types:original.types,channels:CHANNEL_DISPLAY,affiliateFor:()=>null,now:original.now});
      return `<section data-original>${sample.html}</section><section data-current>${renderHTML({kind:'library',cards})}</section>`;
    }).join('');host.append(bands);
  },{original,samples,css:scopedFrozenStyles(original.styleBlocks).replaceAll('[data-original]',':where([data-original])')});
  const host=page.locator('#device-library-acceptance');let pairs=0;
  for(const width of [320,375,600,768,1100]){
    await page.setViewportSize({width,height:1000});
    for(const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']){
      await page.mouse.move(0,0);await page.evaluate(async theme=>(await import('/js/theme.js')).setTheme(theme),theme);
      await host.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      await expect.poll(()=>host.evaluate(element=>element.getAnimations({subtree:true}).filter(animation=>animation instanceof CSSTransition&&animation.playState==='running').length)).toBe(0);
      const result=await host.evaluate(element=>{
        const props=['display','width','height','minWidth','maxWidth','minHeight','fontSize','fontWeight','lineHeight','marginTop','marginBottom','paddingTop','paddingRight','paddingBottom','paddingLeft','gap','alignItems','gridTemplateColumns','borderTopWidth','borderTopStyle','borderTopColor','backgroundColor','backgroundImage','borderRadius','color','boxShadow','opacity','overflow','flexGrow','flexShrink','letterSpacing'] as const;
        const errors:string[]=[];
        for(const pair of element.querySelectorAll('[data-pair]')){
          const old=pair.querySelector('[data-original]')!.querySelectorAll('*'),current=pair.querySelector('[data-current]')!.querySelectorAll('*');
          if(old.length!==current.length){errors.push(`nodes ${pair.getAttribute('data-pair')}: ${old.length}/${current.length}`);continue;}
          old.forEach((node,index)=>{const a=getComputedStyle(node),b=getComputedStyle(current[index]!);for(const prop of props)if(a[prop]!==b[prop])errors.push(`${pair.getAttribute('data-pair')}/${index}/${prop}: ${b[prop]} != ${a[prop]}`);});
        }
        const oldBands=element.querySelectorAll('#device-band-acceptance [data-original] .light-device-card'),bands=element.querySelectorAll('#device-band-acceptance [data-current] .light-device-card');
        oldBands.forEach((node,index)=>{for(const prop of ['backgroundImage','backgroundColor','width'] as const){const a=getComputedStyle(node,'::before')[prop],b=getComputedStyle(bands[index]!,'::before')[prop];if(a!==b)errors.push(`band ${index}/${prop}: ${b} != ${a}`);}});
        return{errors,overflow:element.scrollWidth-element.clientWidth};
      });
      expect(result.errors,`${width}/${theme} original styles`).toEqual([]);expect(result.overflow).toBeLessThanOrEqual(1);pairs+=11;
    }
  }
  for(const selector of ['.light-device-card','.light-device-picker-row','.rec-light-device-link']){
    const pair=host.locator(selector==='.light-device-card'?'[data-pair="0"]':selector==='.light-device-picker-row'?'[data-pair="10"]':'[data-pair="2"]');
    const style=(element:Element)=>{const css=getComputedStyle(element);return{border:css.borderTopColor,background:css.backgroundColor,shadow:css.boxShadow,decoration:css.textDecorationLine};};
    const old=pair.locator(`[data-original] ${selector}`).first(),current=pair.locator(`[data-current] ${selector}`).first();
    await old.hover();await expect.poll(()=>old.evaluate(element=>element.getAnimations().filter(animation=>animation.playState==='running').length)).toBe(0);const expected=await old.evaluate(style);
    await current.hover();await expect.poll(()=>current.evaluate(element=>element.getAnimations().filter(animation=>animation.playState==='running').length)).toBe(0);expect(await current.evaluate(style)).toEqual(expected);
  }
  await host.locator('[data-original]').evaluateAll(elements=>elements.forEach(element=>element.remove()));
  for(const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']){
    await page.evaluate(async theme=>(await import('/js/theme.js')).setTheme(theme),theme);
    await host.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    await expect.poll(()=>host.evaluate(element=>element.getAnimations({subtree:true}).filter(animation=>animation instanceof CSSTransition&&animation.playState==='running').length)).toBe(0);
    const violations=await host.evaluate(async element=>(await(window as unknown as{axe:typeof import('axe-core')}).axe.run(element,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(item=>({id:item.id,nodes:item.nodes.map(node=>({target:node.target,summary:node.failureSummary}))})));
    expect(violations,`${theme} accessibility`).toEqual([]);
  }
  await page.keyboard.press('Tab');
  const controls = await host.evaluate(async element => {
    const errors: string[] = []; let checked = 0;
    for (const control of element.querySelectorAll<HTMLElement>('button,a')) {
      control.focus(); const deadline = performance.now() + 10000;
      while(getComputedStyle(control).outlineWidth !== '2px' && performance.now() < deadline) await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      const css = getComputedStyle(control); const box = control.getBoundingClientRect();
      if (document.activeElement !== control || css.outlineWidth !== '2px') errors.push(`focus ${checked}`);
      if (matchMedia('(pointer:coarse)').matches && (box.width < 44 || box.height < 44)) errors.push(`target ${checked}: ${box.width}x${box.height}`);
      checked++;
    }
    return {errors,checked};
  });
  expect(controls.checked).toBe(await host.locator('button,a').count()); expect(controls.errors).toEqual([]);
  expect(errors).toEqual([]);expect(pairs).toBe(330);await fs.promises.writeFile(info.outputPath('device-library-style-pairs.json'),JSON.stringify({pairs,themes:6,widths:[320,375,600,768,1100],placements:11,allTypeBands:8}));
});
