import fs from 'node:fs';
import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { scopedFrozenStyles, type FrozenStyleBlock } from '../helpers/frozen-style-scope.js';
import { projectChannelDetail, type ChannelDay } from '../../js/light-channel-presentation.js';
interface Sample { channel: string; pattern: string; meta: { icon?: string; label?: string; what?: string }; sun: number; device: number; breakdown: boolean; matchingDevice: boolean; html: string }
const original=JSON.parse(fs.readFileSync('tests/fixtures/light-channel-original.json','utf8')) as {now:number;cases:Sample[];styleBlocks:FrozenStyleBlock[]};
function days(sample:Sample,n:number):ChannelDay[]{return Array.from({length:n},(_,index)=>{const date=new Date(original.now);date.setHours(0,0,0,0);date.setDate(date.getDate()-(n-1-index));return{date,sun:index%3===0?sample.sun:0,device:index%2===0?sample.device:0};});}
const samples=original.cases.filter(sample=>['empty','mixed'].includes(sample.pattern)||sample.channel==='vitamin_d'&&['sun','device'].includes(sample.pattern)).map(sample=>({html:sample.html,view:projectChannelDetail({...sample,recentDays:sample.breakdown?days(sample,14).slice(7):[],chartDays:sample.breakdown?days(sample,7):null,iuDays:sample.breakdown&&sample.channel==='vitamin_d'?days(sample,7):null,pbmJoulesPerCm2:n=>n/100,peakAt:null,peakUV:null},new Date(original.now))}));
test('authored channel details preserve original source charts, responsive geometry and accessible research/actions',async({page},info)=>{
  test.setTimeout(120000);await installDiscussionFixture(page.context());await page.goto('/app');await expect(page.locator('html[data-app-ready]')).toBeAttached();
  await page.evaluate(async css=>{
    await(await import('/js/light-sun-loader.js')).loadLightSunUI();
    // Baseline scoping has zero specificity, preserving the original theme cascade.
    // Light-theme research ink and coarse action sizes are declared improvements.
    const style=document.createElement('style');const readableMuted=['neuromancer','cyberterm'].map(theme=>`html[data-theme='${theme}'] :where([data-original]) :is(.light-channel-detail-close,.light-channel-source.is-empty,.light-channel-sources small,.light-channel-weekchart-legend,.light-channel-nextmove-label,.light-channel-cit summary,.light-channel-cit-why,.light-channel-cit-suggest a){color:var(--text-secondary);}html[data-theme='${theme}'] :where([data-original]) svg text[fill="var(--text-muted)"]{fill:var(--text-secondary);}`).join('');
    style.textContent=css+readableMuted+"html[data-theme='light'] [data-original] .light-channel-cit-refs a{color:color-mix(in srgb,var(--accent-light) 90%,var(--text-primary));}"+'@media(pointer:coarse){[data-original] .light-channel-cta-btn,[data-original] summary{min-width:44px;min-height:44px;}[data-original] .light-channel-cit a{display:inline-block;min-width:44px;min-height:44px;}}';document.head.append(style);
    const host=document.createElement('div');host.id='channel-acceptance';host.style.cssText='position:fixed;inset:16px;overflow:auto;z-index:20000;background:var(--bg-primary);padding:12px';document.body.append(host);
  },scopedFrozenStyles(original.styleBlocks).replaceAll('[data-original]',':where([data-original])'));
  const host=page.locator('#channel-acceptance');await page.emulateMedia({reducedMotion:'reduce'});let pairs=0;
  for(const width of [320,1100]){await page.setViewportSize({width,height:1000});for(const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']){
    await page.evaluate(async theme=>(await import('/js/theme.js')).setTheme(theme),theme);
    const result=await host.evaluate(async(element,samples)=>{
      const{renderHTML}=await import('/js/components/LightChannelDetail.svelte.html.js');
      element.innerHTML=samples.map((sample,index)=>`<div data-pair="${index}"><section data-original inert aria-hidden="true">${sample.html}</section><section data-current>${renderHTML({view:sample.view})}</section></div>`).join('');
      const closedErrors:string[]=[];
      for(const pair of element.querySelectorAll('[data-pair]')){
        const old=pair.querySelector<HTMLElement>('[data-original] > div')!,next=pair.querySelector<HTMLElement>('[data-current] > div')!;
        // Local layout dimensions avoid subtraction of large document-space
        // coordinates (Firefox DOMRect rounding); compare CSS and pixel boxes exactly.
        const box=(node:HTMLElement)=>[getComputedStyle(node).width,getComputedStyle(node).height,node.offsetWidth,node.offsetHeight,node.clientWidth,node.clientHeight,node.scrollWidth,node.scrollHeight];
        const a=box(old),b=box(next);
        if(JSON.stringify(a)!==JSON.stringify(b))closedErrors.push(`closed ${pair.getAttribute('data-pair')}: ${JSON.stringify(b)} != ${JSON.stringify(a)}`);
      }
      // Compare research layout while actually disclosed. Closed details defer
      // descendant layout differently between browser style engines.
      for(const detail of element.querySelectorAll('details'))detail.open=true;
      await document.fonts.ready;
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      const properties=['display','width','height','fontSize','fontWeight','lineHeight','marginTop','marginBottom','marginLeft','paddingTop','paddingRight','paddingBottom','paddingLeft','gap','alignItems','borderTopWidth','borderTopColor','borderLeftWidth','backgroundColor','backgroundImage','borderRadius','color','boxShadow','opacity','flexGrow','flexShrink','minWidth','letterSpacing','fontStyle','verticalAlign','fill'] as const;
      const errors:string[]=closedErrors;let pairs=0;
      for(const pair of element.querySelectorAll('[data-pair]')){
        const old=pair.querySelector('[data-original]')!,next=pair.querySelector('[data-current]')!;
        const oldNodes=[...old.querySelectorAll('*')],newNodes=[...next.querySelectorAll('*')];
        if(oldNodes.length!==newNodes.length){errors.push(`nodes ${pair.getAttribute('data-pair')}: ${oldNodes.length}/${newNodes.length}`);continue;}
        for(let i=0;i<oldNodes.length;i++){
          const oldStyle=getComputedStyle(oldNodes[i]!),newStyle=getComputedStyle(newNodes[i]!);
          for(const property of properties){const before=oldStyle[property],after=newStyle[property];if(before!==after)errors.push(`${pair.getAttribute('data-pair')}/${i}/${property}: ${after} != ${before}`);}
        }
        pairs++;old.remove();
      }
      return{errors,pairs,overflow:element.scrollWidth-element.clientWidth};
    },samples);
    expect(result.errors,`${width}/${theme} computed styles`).toEqual([]);pairs+=result.pairs;expect(result.overflow,`${width}/${theme} overflow`).toBeLessThanOrEqual(1);
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const violations=await host.evaluate(async element=>(await(window as unknown as{axe:typeof import('axe-core')}).axe.run(element,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
    expect(violations,`${width}/${theme} accessibility`).toEqual([]);
    // Playwright's focus port uses the same DOM method. Batch independent
    // focus/style/box observations to avoid thousands of protocol round trips.
    await page.keyboard.press('Tab');
    const focus=await host.evaluate(async element=>{
      const errors:string[]=[];const controls=[...element.querySelectorAll<HTMLElement>('button,summary,a')];
      const coarse=matchMedia('(pointer:coarse)').matches;
      for(const [index,control] of controls.entries()){
        control.focus();
        // Preserve the original auto-wait for the browser's focus ring.
        const deadline=performance.now()+10000;
        while(getComputedStyle(control).outlineWidth!=='2px'&&performance.now()<deadline)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
        if(document.activeElement!==control)errors.push(`${index}: focus was not retained`);
        if(getComputedStyle(control).outlineWidth!=='2px')errors.push(`${index}: focus-visible=${control.matches(':focus-visible')}, outline=${getComputedStyle(control).outlineWidth}, control=${control.outerHTML}`);
        if(coarse){const box=control.getBoundingClientRect();if(box.height<44||box.width<44)errors.push(`${index}: target ${box.width}x${box.height}`);}
      }
      return{errors,checked:controls.length};
    });
    expect(focus.checked).toBe(await host.locator('button,summary,a').count());
    expect(focus.errors,`${width}/${theme} focus and touch`).toEqual([]);
  }}
  expect(pairs).toBe(samples.length*12);await fs.promises.writeFile(info.outputPath('channel-style-pairs.json'),JSON.stringify({pairs,samples:samples.length,themes:6,widths:2}));
  await host.evaluate(async element=>{
    const service=await import('/js/light-channel-view.js');
    Object.assign(window,{channelActionCalls:[]});const calls=(window as unknown as{channelActionCalls:string[]}).channelActionCalls;
    service.configureLightChannelView({channelDisplay:{circadian:{label:'Body clock'},nir_solar:{label:'Cell energy'}},dailyChannelBreakdown:null,rollingChannelTotals:()=>({}),rollingDeviceTotals:()=>({}),getDevices:()=>[{channels:['circadian']}],quickLogSunSession:()=>calls.push('sun'),quickLogDeviceSession:()=>calls.push('device')});
    element.innerHTML=service.renderChannelPills({});
  });
  await host.locator('.light-pill[data-channel="circadian"]').focus();await page.keyboard.press('Enter');
  const detail=host.locator('[data-light-channel-presentation]');await expect(detail).toHaveCount(1);await expect(detail).toBeFocused();
  await detail.locator('[data-light-channel-action="quick-log-sun"]').focus();await page.keyboard.press('Enter');
  await detail.locator('[data-light-channel-action="quick-log-device"]').focus();await page.keyboard.press('Space');
  expect(await page.evaluate(()=>(window as unknown as{channelActionCalls:string[]}).channelActionCalls)).toEqual(['sun','device']);
  const research=detail.locator('details');await research.locator('summary').focus();await page.keyboard.press('Enter');await expect(research).toHaveAttribute('open','');
  await expect(research.locator('.light-channel-cit-refs a')).toHaveCount(3);
  await host.locator('.light-pill[data-channel="nir_solar"]').click();await expect(detail).toHaveCount(1);await expect(detail).toHaveAttribute('data-channel','nir_solar');
  await detail.getByRole('button',{name:'Close Cell energy detail',exact:true}).click();await expect(detail).toHaveCount(0);
});
