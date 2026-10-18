import fs from 'node:fs';
import {createHash} from 'node:crypto';
import type {EnvironmentAIView} from '../../js/light-environment-ai-presentation.js';
import type {EnvironmentTodayView} from '../../js/light-environment-screen-presentation.js';
import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { scopedFrozenStyles, type FrozenStyleBlock } from '../helpers/frozen-style-scope.js';
import type { ScreenCardReader } from '../../js/light-env-screen-ui.js';
interface Sample {name:string;screen:ScreenCardReader;expanded:boolean;rooms:unknown;todayHTML?:string;aiHTML?:string;html:string}
interface TypedSample extends Sample {todayView:Readonly<EnvironmentTodayView>;aiView:Readonly<EnvironmentAIView>}
const original=JSON.parse(fs.readFileSync('tests/fixtures/light-environment-screen-original.json','utf8')) as {now:number;cases:Sample[];styleBlocks:FrozenStyleBlock[]};
const childBytes=fs.readFileSync('tests/fixtures/light-genuine-child-native-before.json');
expect(createHash('sha256').update(childBytes).digest('hex')).toBe('01ae5ade9a27cd1b2ad7f9ea3a5eae998766e87cb1a9b668749da25be6e1201d');
const children=JSON.parse(new TextDecoder().decode(childBytes))as{rows:{kind:string;view:EnvironmentAIView;html:string}[];screens:{name:string;view:EnvironmentTodayView;html:string}[]};
const nativeAI=children.rows.find(row=>row.kind==='screen');if(!nativeAI)throw new Error('Missing authenticated original screen AI child');
const examples:TypedSample[]=original.cases.filter(sample=>['0/true/true','1/true/true','2/true/true','3/true/true','4/true/true','5/false/true','6/false/true','8/true/true','0/false/true'].includes(sample.name)).map(sample=>{
 const nativeToday=children.screens.find(row=>row.name===sample.name);if(!nativeToday)throw new Error('Missing authenticated original screen Today input');
 let html=sample.html;
 if(html.includes('<div data-fixture-ai>Trusted AI renderer</div>'))html=html.replaceAll('<div data-fixture-ai>Trusted AI renderer</div>',nativeAI.html);
 if(html.includes('<button type="button" data-fixture-today>Trusted today</button>'))html=html.replaceAll('<button type="button" data-fixture-today>Trusted today</button>',nativeToday.html);
 expect(html).not.toContain('data-fixture-');
 return {...sample,html,aiView:structuredClone(nativeAI.view),todayView:structuredClone(nativeToday.view)};
});
test('shared authored screen editor preserves independent layouts, accessible themes, focus and delegated keyboard controls',async({page},info)=>{
  test.setTimeout(120000);await installDiscussionFixture(page.context());await page.goto('/app');await expect(page.locator('html[data-app-ready]')).toBeAttached();await page.emulateMedia({reducedMotion:'reduce'});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(async({examples,css})=>{
    localStorage.setItem('labcharts-ai-paused','true');await(await import('/js/light-sun-loader.js')).loadLightSunUI();
    // Declared accessibility improvements retain readable skipped screens and add
    // 44px coarse select/switch hit areas; all other geometry uses frozen CSS.
    const style=document.createElement('style');style.textContent=css+`[data-original] .light-env-card-skipped{opacity:1}[data-original] .light-env-screen-card-icon{pointer-events:none}@media(pointer:coarse){[data-original] .ctx-select{min-height:44px}[data-original] .toggle-switch{min-width:44px;min-height:44px}}`;document.head.append(style);
    const host=document.createElement('div');host.id='environment-screen-acceptance';host.style.cssText='position:fixed;inset:0;z-index:20000;overflow:auto;background:var(--bg-primary);padding:12px';document.body.append(host);
    const {renderScreenCard}=await import('/js/light-env-screen-ui.js');
    for(const sample of examples){
      const pair=document.createElement('div');pair.dataset.pair=sample.name;
      // The inherited-key icon now uses the same safe Device fallback as other unknown devices.
      const reference=document.createElement('section');reference.dataset.original='';reference.innerHTML=sample.html;
      if(sample.screen.device==='__proto__')reference.querySelector('.light-env-screen-card-icon')!.textContent='📱';
      const current=document.createElement('section');current.dataset.current='';
      const screen={...sample.screen};if(screen.todayOverride)screen.todayOverride={date:new Date().toLocaleDateString('sv-SE'),active:false};
      current.innerHTML=renderScreenCard(screen,{expanded:sample.expanded,rooms:sample.rooms,getTodayView:()=>sample.todayView,getScreenAIView:()=>sample.aiView});
      pair.append(reference,current);host.append(pair);
    }
  },{examples,css:scopedFrozenStyles(original.styleBlocks)});
  const host=page.locator('#environment-screen-acceptance');let pairs=0;
  for(const width of [320,375,600,768,1100]){
    await page.setViewportSize({width,height:1000});
    for(const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']){
      await page.mouse.move(0,0);await page.evaluate(async theme=>(await import('/js/theme.js')).setTheme(theme),theme);
      await host.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const result=await host.evaluate(element=>{
        const props=['display','width','height','fontSize','fontWeight','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','gridTemplateColumns','alignItems','borderTopWidth','borderTopStyle','borderRadius','whiteSpace','overflow','textOverflow','opacity'] as const;
        const selectors=['.light-env-screen-card','.light-env-screen-card-head','.light-env-sev-dot','.light-env-screen-card-icon','.light-env-screen-card-name','.light-env-screen-card-summary','.light-env-room-disclosure-chevron','.light-env-overflow','.light-env-screen-card-body','.light-env-screen-meta-row','.ctx-label','.ctx-select','.light-env-picker','.light-env-picker-label','.light-env-chip-row','.light-env-chip','.light-env-screen-blocker'];
        const failures:string[]=[];
        for(const pair of element.querySelectorAll('[data-pair]'))for(const selector of selectors){
          const old=pair.querySelector('[data-original]')!.querySelectorAll(selector),current=pair.querySelector('[data-current]')!.querySelectorAll(selector);
          if(old.length!==current.length){failures.push(`${pair.getAttribute('data-pair')}/${selector} count ${old.length}/${current.length}`);continue;}
          old.forEach((node,index)=>{const a=getComputedStyle(node),b=getComputedStyle(current[index]!);for(const prop of props)if(a[prop]!==b[prop])failures.push(`${pair.getAttribute('data-pair')}/${selector}/${index}/${prop}: ${b[prop]} != ${a[prop]}`);});
        }
        const probe=document.createElement('span');probe.style.cssText='position:fixed;visibility:hidden';element.append(probe);
        probe.style.backgroundColor='var(--accent)';probe.style.color='var(--on-accent)';
        const selectedFill=getComputedStyle(probe).backgroundColor,selectedInk=getComputedStyle(probe).color;
        for(const chip of element.querySelectorAll('[data-current] .light-env-chip-active')){
          const css=getComputedStyle(chip);if(css.backgroundColor!==selectedFill||css.color!==selectedInk)failures.push(`selected palette: ${css.backgroundColor}/${css.color} != ${selectedFill}/${selectedInk}`);
        }
        for(const pair of element.querySelectorAll('[data-pair]')){
          const old=pair.querySelector('[data-original] .light-env-screen-card')!,current=pair.querySelector('[data-current] .light-env-screen-card')!;
          if(old.classList.contains('light-env-card-sev-incomplete'))continue;
          const a=getComputedStyle(old,'::before'),b=getComputedStyle(current,'::before');
          for(const prop of ['content','width','position','backgroundColor','top','left','bottom'] as const)if(a[prop]!==b[prop])failures.push(`${pair.getAttribute('data-pair')}/severity rail/${prop}: ${b[prop]} != ${a[prop]}`);
        }
        probe.remove();return {failures,overflow:element.scrollWidth-element.clientWidth};
      });
      expect(result.failures,`${width}/${theme} original geometry`).toEqual([]);expect(result.overflow).toBeLessThanOrEqual(1);pairs+=examples.length;
    }
  }
  await host.locator('[data-original]').evaluateAll(elements=>elements.forEach(element=>element.remove()));
  await host.evaluate(async (element,examples)=>{
    const {renderScreenCard}=await import('/js/light-env-screen-ui.js');
    const {projectEnvironmentToday}=await import('/js/light-environment-screen-presentation.js');
    const {renderHTML}=await import('/js/components/LightEnvironmentTodayToggle.svelte.html.js');
    // Both phases exercise genuine typed children. The reference uses the exact
    // original child renderer bytes from the authenticated native fixture.
    for(const sample of examples){
      const current=element.querySelector(`[data-pair="${sample.name}"] [data-current]`)!;
      const screen={...sample.screen};if(screen.todayOverride)screen.todayOverride={date:new Date().toLocaleDateString('sv-SE'),active:false};
      current.innerHTML=renderScreenCard(screen,{expanded:sample.expanded,rooms:sample.rooms,todayToggle:true,getScreenAIView:()=>sample.aiView});
    }
    const typed=document.createElement('section');typed.dataset.typedControls='';
    typed.innerHTML=renderScreenCard({id:'typed',device:'phone',hoursPerDay:2,eveningUseAfterSunset:0},{expanded:true,todayToggle:true});
    for(const active of [true,false])for(const compact of [true,false])typed.innerHTML+=renderHTML({view:projectEnvironmentToday('room','typed-room',active,compact)});
    element.append(typed);
  },examples);
  for(const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']){
    await page.evaluate(async theme=>(await import('/js/theme.js')).setTheme(theme),theme);
    await host.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const violations=await host.evaluate(async element=>(await(window as unknown as{axe:typeof import('axe-core')}).axe.run(element,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(item=>({id:item.id,nodes:item.nodes.map(node=>({target:node.target,summary:node.failureSummary}))})));
    expect(violations,`${theme} accessibility`).toEqual([]);
  }
  await page.keyboard.press('Tab');
  const focus=await host.evaluate(async element=>{
    const errors:string[]=[];let count=0;
    for(const control of element.querySelectorAll<HTMLElement>('[data-light-env-action]')){
      control.focus();const target=control.matches('input')?control.nextElementSibling!:control;
      const deadline=performance.now()+10000;while(getComputedStyle(target).outlineWidth!=='2px'&&performance.now()<deadline)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      const css=getComputedStyle(target),box=control.getBoundingClientRect();
      if(document.activeElement!==control||css.outlineWidth!=='2px')errors.push(`focus ${count}: ${css.outlineWidth}`);
      if(matchMedia('(pointer:coarse)').matches&&(box.width<44||box.height<44))errors.push(`target ${count}: ${box.width}x${box.height}`);count++;
    }return{errors,count};
  });
  expect(focus.count).toBeGreaterThan(60);expect(focus.errors).toEqual([]);
  await page.evaluate(async()=>{
    const host=document.querySelector<HTMLElement>('#environment-screen-acceptance')!;host.dataset.disclosures='0';
    const editor=await import('/js/light-env-editor.js');
    editor.configureLightEnvEditor({refreshUI:()=>{host.dataset.disclosures=String(Number(host.dataset.disclosures)+1);host.dataset.expanded=String(editor.isLightEnvScreenExpanded('screen-0'));}});
  });
  const disclosure=host.locator('.light-env-screen-disclosure').first();await disclosure.focus();await page.keyboard.press('Enter');await expect(host).toHaveAttribute('data-disclosures','1');await expect(host).toHaveAttribute('data-expanded','true');await page.keyboard.press('Space');await expect(host).toHaveAttribute('data-disclosures','2');await expect(host).toHaveAttribute('data-expanded','false');
  expect(errors).toEqual([]);expect(pairs).toBe(examples.length*30);
  await fs.promises.writeFile(info.outputPath('environment-screen-pairs.json'),JSON.stringify({pairs,examples:examples.length,themes:6,widths:[320,375,600,768,1100],focus:focus.count}));
});
