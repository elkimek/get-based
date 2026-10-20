import fs from 'node:fs';
import {expect,test} from './coverage-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {scopedFrozenStyles,type FrozenStyleBlock} from '../helpers/frozen-style-scope.js';
import type {ProductCatalog} from '../../js/recommendations-products.js';
interface Sample {country:string;enabled:boolean;catalog:ProductCatalog|null;presets:Parameters<typeof import('../../js/recommendations-products.js').renderChannelDeficitDeviceRecs>[2];channel:string;label:unknown;html:string}
const original=JSON.parse(fs.readFileSync('tests/fixtures/light-device-recommendations-original.json','utf8')) as {cases:Sample[];styleBlocks:FrozenStyleBlock[]};
test('authored channel device options retain independent layouts and policy with readable keyboard and touch links',async({page},info)=>{
  test.setTimeout(120000);await installDiscussionFixture(page.context());await page.goto('/app');await expect(page.locator('html[data-app-ready]')).toBeAttached();await page.emulateMedia({reducedMotion:'reduce'});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(async({original,css})=>{
    await(await import('/js/light-sun-loader.js')).loadLightSunUI();
    const rec=await import('/js/recommendations-products.js'),{state}=await import('/js/state.js');
    const style=document.createElement('style');style.textContent=css+`:where([data-original]) .rec-light-deficit-link{white-space:normal;overflow-wrap:anywhere;min-width:0;}:where([data-original]) .rec-light-deficit-link strong{color:var(--text-primary);}:where([data-original]) .rec-channel-deficit-foot a{display:inline-block;}@media(pointer:coarse){:where([data-original]) .rec-light-deficit-link{min-height:44px;min-width:44px;}:where([data-original]) .rec-channel-deficit-foot a{display:inline-flex;align-items:center;min-height:44px;min-width:44px;}}`;document.head.append(style);
    const host=document.createElement('div');host.id='device-options-acceptance';host.style.cssText='position:fixed;inset:0;z-index:20000;overflow:auto;background:var(--bg-primary);padding:12px';document.body.append(host);
    for(const [index,sample] of original.cases.filter(sample=>sample.html).entries()){
      state.currentProfile='default';state.profiles=[{id:'default',location:{country:sample.country,zip:''}}];rec.setProductRecsEnabled(sample.enabled);
      const current=rec.renderChannelDeficitDeviceRecs(sample.catalog,sample.channel,sample.presets,{label:sample.label});
      const pair=document.createElement('div');pair.dataset.pair=String(index);pair.innerHTML=`<section data-original>${sample.html}</section><section data-current>${current}</section>`;host.append(pair);
    }
  },{original,css:scopedFrozenStyles(original.styleBlocks).replaceAll('[data-original]',':where([data-original])')});
  const host=page.locator('#device-options-acceptance');let pairs=0;
  for(const width of [320,375,600,768,1100]){
    await page.setViewportSize({width,height:1000});
    for(const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']){
      await page.mouse.move(0,0);await page.evaluate(async theme=>(await import('/js/theme.js')).setTheme(theme),theme);
      await host.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const result=await host.evaluate(element=>{
        const props=['display','width','height','minWidth','minHeight','fontSize','fontSizeAdjust','letterSpacing','fontWeight','lineHeight','marginTop','marginRight','marginBottom','marginLeft','paddingTop','paddingRight','paddingBottom','paddingLeft','gap','alignItems','borderTopWidth','borderTopStyle','borderTopColor','backgroundColor','borderRadius','color','boxShadow','whiteSpace','overflowWrap'] as const;
        const errors:string[]=[];
        for(const pair of element.querySelectorAll('[data-pair]')){
          const old=pair.querySelector('[data-original]')!.querySelectorAll('*'),current=pair.querySelector('[data-current]')!.querySelectorAll('*');
          if(old.length!==current.length){errors.push(`nodes ${pair.getAttribute('data-pair')}: ${old.length}/${current.length}`);continue;}
          old.forEach((node,index)=>{const a=getComputedStyle(node),b=getComputedStyle(current[index]!);for(const prop of props)if(a[prop]!==b[prop])errors.push(`${pair.getAttribute('data-pair')}/${index}/${prop}: ${b[prop]} != ${a[prop]}`);});
        }return{errors,overflow:element.scrollWidth-element.clientWidth};
      });
      expect(result.errors,`${width}/${theme} original styles`).toEqual([]);expect(result.overflow).toBeLessThanOrEqual(1);pairs+=5;
    }
  }
  const old=host.locator('[data-original] .rec-light-deficit-link').first(),current=host.locator('[data-current] .rec-light-deficit-link').first();
  const hover=(element:Element)=>{const css=getComputedStyle(element);return{border:css.borderTopColor,decoration:css.textDecorationLine};};
  await old.hover();await old.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  const expected=await old.evaluate(hover);await current.hover();await expect.poll(()=>current.evaluate(hover)).toEqual(expected);
  await host.locator('[data-original]').evaluateAll(elements=>elements.forEach(element=>element.remove()));
  for(const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']){
    await page.evaluate(async theme=>(await import('/js/theme.js')).setTheme(theme),theme);
    await host.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const violations=await host.evaluate(async element=>(await(window as unknown as{axe:typeof import('axe-core')}).axe.run(element,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(item=>({id:item.id,nodes:item.nodes.map(node=>({target:node.target,summary:node.failureSummary}))})));
    expect(violations,`${theme} accessibility`).toEqual([]);
  }
  await page.keyboard.press('Tab');
  const controls=await host.evaluate(async element=>{
    const errors:string[]=[];let checked=0;
    for(const link of element.querySelectorAll<HTMLElement>('a,button')){link.focus();const deadline=performance.now()+10000;while(getComputedStyle(link).outlineWidth!=='2px'&&performance.now()<deadline)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));const css=getComputedStyle(link),box=link.getBoundingClientRect();if(document.activeElement!==link||css.outlineWidth!=='2px')errors.push(`focus ${checked}: ${css.outlineWidth}/${css.outlineStyle}/${link.matches(':focus-visible')}`);if(matchMedia('(pointer:coarse)').matches&&(box.width<44||box.height<44))errors.push(`target ${checked}: ${box.width}x${box.height}`);checked++;}
    return{errors,checked};
  });
  expect(controls.checked).toBe(20);expect(controls.errors).toEqual([]);expect(errors).toEqual([]);expect(pairs).toBe(150);
  await page.evaluate(async()=>{
    await import('/js/recommendations.js');const runtime=await import('/js/recommendations-runtime.js');
    const host=document.querySelector<HTMLElement>('#device-options-acceptance')!;host.dataset.settingsOpens='0';
    runtime.configureRecommendationsRuntime({openSettingsModal:tab=>{host.dataset.settingsTab=String(tab);host.dataset.settingsOpens=String(Number(host.dataset.settingsOpens)+1);}});
    host.querySelector<HTMLButtonElement>('[data-rec-action]')!.focus();
  });
  await page.keyboard.press('Enter');await expect(host).toHaveAttribute('data-settings-opens','1');await expect(host).toHaveAttribute('data-settings-tab','privacy');
  await page.keyboard.press('Space');await expect(host).toHaveAttribute('data-settings-opens','2');
  await fs.promises.writeFile(info.outputPath('device-options-style-pairs.json'),JSON.stringify({pairs,themes:6,widths:[320,375,600,768,1100],branches:5,controls:controls.checked}));
});
