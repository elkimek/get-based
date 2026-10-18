import fs from 'node:fs';
import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { scopedFrozenStyles, type FrozenStyleBlock } from '../helpers/frozen-style-scope.js';
interface Sample {pattern:string;meta:Record<string,{icon?:string;label?:string;what?:string}>;rows:{sun:number;device:number}[]|null;sun:Record<string,number>;device:Record<string,number>;lightHTML:string;dashboardHTML:string}
const original=JSON.parse(fs.readFileSync('tests/fixtures/light-channel-pills-original.json','utf8')) as {cases:Sample[];styleBlocks:FrozenStyleBlock[]};
const samples=original.cases.filter(sample=>['empty','mixed','no-breakdown','literal'].includes(sample.pattern));
test('authored Light and dashboard pills preserve source SVGs, themes, responsive cards and keyboard actions',async({page},info)=>{
  test.setTimeout(120000);await installDiscussionFixture(page.context());await page.goto('/app');await expect(page.locator('html[data-app-ready]')).toBeAttached();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(async css=>{
    await(await import('/js/light-sun-loader.js')).loadLightSunUI();
    const style=document.createElement('style');// Preserve the declared empty-card ink and 44px narrow/coarse Dashboard targets on both sides.
    style.textContent=css+':where([data-original]) .light-channels-section .light-pill-tier-0,:where([data-original]) .light-channels-section .light-pill-tier-0 .light-pill-daycount{color:var(--text-secondary);}@media(pointer:coarse),(max-width:480px){:where([data-original]) .light-pill-dashboard{min-height:44px;min-width:44px}}';document.head.append(style);
    const host=document.createElement('div');host.id='pill-acceptance';host.style.cssText='position:fixed;inset:16px;overflow:auto;z-index:20000;background:var(--bg-primary);padding:12px';document.body.append(host);
  },scopedFrozenStyles(original.styleBlocks).replaceAll('[data-original]',':where([data-original])'));
  const host=page.locator('#pill-acceptance');let pairs=0;
  for(const width of [320,600,1100]){await page.setViewportSize({width,height:1000});for(const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']){
    // Reset the real pointer before comparing default styles in the rebuilt fixture.
    await page.mouse.move(0,0);
    await page.evaluate(async theme=>(await import('/js/theme.js')).setTheme(theme),theme);
    const result=await host.evaluate(async(element,samples)=>{
      const channel=await import('/js/light-channel-view.js'),page=await import('/js/light-page-view.js');
      const {channelSectionClasses}=await import('/js/light-channel-section-classes.js');
      element.innerHTML=samples.flatMap((sample,index)=>{
        channel.configureLightChannelView({channelDisplay:sample.meta,dailyChannelBreakdown:sample.rows?()=>sample.rows:null});page.configureLightPageView({channelDisplay:sample.meta,rollingChannelTotals:()=>sample.sun,rollingDeviceTotals:()=>sample.device});
        const light=channel.renderChannelPills(sample.sun,sample.device),dashboard=page.renderDashboardLightChannelPills();
        return [['light',sample.lightHTML,light,true],['dashboard',sample.dashboardHTML,dashboard,false],['dashboard-card',sample.dashboardHTML,dashboard,true]].map(([kind,old,next,card])=>`<div data-pair="${index}/${kind}"><section data-original><div class="${card?'light-channels-section':''}">${old}</div></section><section data-current><div data-light-channel-section class="${card?channelSectionClasses(false):''}">${next}</div></section></div>`);
      }).join('');
      await document.fonts.ready;await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      const props=['display','width','height','minHeight','maxWidth','fontSize','fontWeight','lineHeight','marginTop','paddingTop','paddingRight','paddingBottom','paddingLeft','gap','alignItems','gridTemplateColumns','gridTemplateAreas','gridArea','borderTopWidth','borderTopStyle','borderTopColor','backgroundColor','backgroundImage','borderRadius','color','boxShadow','opacity','flexGrow','flexShrink','minWidth','letterSpacing','fill'] as const;
      const errors:string[]=[];let pairs=0;
      for(const pair of element.querySelectorAll('[data-pair]')){
        const old=[...pair.querySelector('[data-original]')!.querySelectorAll('*')],next=[...pair.querySelector('[data-current]')!.querySelectorAll('*')];
        if(old.length!==next.length){errors.push(`nodes ${pair.getAttribute('data-pair')}: ${old.length}/${next.length}`);continue;}
        for(let index=0;index<old.length;index++){const a=getComputedStyle(old[index]!),b=getComputedStyle(next[index]!);for(const prop of props)if(a[prop]!==b[prop])errors.push(`${pair.getAttribute('data-pair')}/${index}/${prop}: ${b[prop]} != ${a[prop]}`);}
        // Expanded-state styling is compared independently of the action handler.
        const oldPill=pair.querySelector<HTMLElement>('[data-original] .light-pill-interactive');
        const newPill=pair.querySelector<HTMLElement>('[data-current] .light-pill-interactive');
        if(oldPill&&newPill){
          oldPill.setAttribute('aria-expanded','true');newPill.setAttribute('aria-expanded','true');
          for(const prop of ['borderTopColor','boxShadow'] as const){const a=getComputedStyle(oldPill)[prop],b=getComputedStyle(newPill)[prop];if(a!==b)errors.push(`${pair.getAttribute('data-pair')}/expanded/${prop}: ${b} != ${a}`);}
          oldPill.setAttribute('aria-expanded','false');newPill.setAttribute('aria-expanded','false');
        }
        pairs++;
      }
      return{errors,pairs,overflow:element.scrollWidth-element.clientWidth};
    },samples);
    expect(result.errors,`${width}/${theme} styles`).toEqual([]);pairs+=result.pairs;expect(result.overflow,`${width}/${theme} overflow`).toBeLessThanOrEqual(1);
    for(const placement of ['light','dashboard','dashboard-card']){
      const pair=host.locator(`[data-pair="0/${placement}"]`);
      const old=pair.locator('[data-original] .light-pill').first(),next=pair.locator('[data-current] .light-pill').first();
      const style=(element:Element)=>{const css=getComputedStyle(element);return{border:css.borderTopColor,shadow:css.boxShadow,filter:css.filter};};
      await old.hover();await expect.poll(()=>old.evaluate(element=>element.getAnimations().filter(animation=>animation.playState==='running').length)).toBe(0);
      const before=await old.evaluate(style);
      let expanded: ReturnType<typeof style> | null=null;
      if(placement==='light'){await old.evaluate(element=>element.setAttribute('aria-expanded','true'));expanded=await old.evaluate(style);await old.evaluate(element=>element.setAttribute('aria-expanded','false'));}
      await next.hover();await expect.poll(()=>next.evaluate(element=>element.getAnimations().filter(animation=>animation.playState==='running').length)).toBe(0);
      expect(await next.evaluate(style),`${width}/${theme}/${placement} actual hover`).toEqual(before);
      if(expanded){await next.evaluate(element=>element.setAttribute('aria-expanded','true'));expect(await next.evaluate(style),`${width}/${theme} actual expanded hover`).toEqual(expanded);await next.evaluate(element=>element.setAttribute('aria-expanded','false'));}
    }
    await host.locator('[data-original]').evaluateAll(elements=>elements.forEach(element=>element.remove()));
    const violations=await host.evaluate(async element=>(await(window as unknown as{axe:typeof import('axe-core')}).axe.run(element,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.failureSummary)})));
    expect(violations,`${width}/${theme} accessibility`).toEqual([]);
    await page.keyboard.press('Tab');const focus=await host.evaluate(async element=>{
      const errors:string[]=[];let checked=0;
      for(const control of element.querySelectorAll<HTMLElement>('button')){
        control.focus();const deadline=performance.now()+10000;while(getComputedStyle(control).outlineWidth!=='2px'&&performance.now()<deadline)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
        if(document.activeElement!==control||getComputedStyle(control).outlineWidth!=='2px')errors.push(`focus ${checked}`);
        if(matchMedia('(pointer:coarse)').matches){const box=control.getBoundingClientRect();if(box.width<44||box.height<44)errors.push(`target ${checked}: ${box.width}x${box.height}`);}checked++;
      }return{errors,checked};
    });expect(focus.checked).toBe(await host.locator('button').count());expect(focus.errors,`${width}/${theme} focus/targets`).toEqual([]);
  }}
  expect(pairs).toBe(samples.length*3*18);await fs.promises.writeFile(info.outputPath('pill-style-pairs.json'),JSON.stringify({pairs,samples:samples.length,placements:3,themes:6,widths:3}));
  await host.evaluate(async element=>{
    const channel=await import('/js/light-channel-view.js'),page=await import('/js/light-page-view.js');const calls:string[]=[];Object.assign(window,{pillCalls:calls});
    channel.configureLightChannelView({channelDisplay:{circadian:{label:'Body clock'}},dailyChannelBreakdown:null,rollingChannelTotals:()=>({}),rollingDeviceTotals:()=>({}),getDevices:()=>[]});
    page.configureLightPageView({openChannelOnLightPage:(key:string)=>calls.push(key)});
    element.innerHTML=channel.renderChannelPills({})+page.renderDashboardLightChannelPills();
  });
  const pill=host.locator('.light-pill[data-light-channel-action="toggle-detail"][data-channel="circadian"]');await pill.focus();await page.keyboard.press('Enter');await expect(pill).toHaveAttribute('aria-expanded','true');await expect(host.locator('[data-light-channel-presentation]')).toBeFocused();
  await pill.focus();await page.keyboard.press('Space');await expect(pill).toHaveAttribute('aria-expanded','false');await expect(host.locator('[data-light-channel-presentation]')).toHaveCount(0);
  await host.locator('[data-light-page-action="open-channel"][data-channel="circadian"]').focus();await page.keyboard.press('Enter');expect(await page.evaluate(()=>(window as unknown as{pillCalls:string[]}).pillCalls)).toEqual(['circadian']);
});
