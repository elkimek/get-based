import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,test} from './coverage-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';

test('shared tooltip styles and native hover/keyboard lifecycle work before Light loads',async({page,context},info)=>{
  test.setTimeout(45000);
  await installDiscussionFixture(context,{provider:'openrouter',paused:true});
  // Disclosed returning-user seed, installed before actual bootstrap. Real data
  // avoids the native returning empty-dashboard chat-onboarding branch.
  const syntheticImported=readFileSync(new URL('../fixtures/client-list-overview/pwa-profile.json',import.meta.url),'utf8');
  expect(Object.keys(JSON.parse(syntheticImported) as object)).toHaveLength(39);
  const registry=[{id:'default',name:'Synthetic tooltip profile',sex:'male',dob:'1987-11-22',createdAt:1,
    location:{country:'',zip:''},tags:[],notes:'',status:'active',lastUpdated:1,pinned:false,height:null,heightUnit:'cm'}];
  await context.addInitScript(({syntheticImported,registry})=>{
    if(!['http:','https:'].includes(location.protocol)||localStorage.getItem('tooltip-cold-shell-seeded'))return;
    localStorage.setItem('tooltip-cold-shell-seeded','1');localStorage.setItem('labcharts-theme','dark');
    localStorage.setItem('labcharts-profiles',JSON.stringify(registry));localStorage.setItem('labcharts-active-profile','default');
    localStorage.setItem('labcharts-default-imported',syntheticImported);
    localStorage.setItem('labcharts-analytics-disabled','true');localStorage.setItem('labcharts-show-product-recs','false');
    // Native wall time, no timer/clock override or suppression of modal CSS.
    localStorage.setItem('labcharts-last-manual-backup',new Date().toISOString());
  },{syntheticImported,registry});
  const errors:string[]=[],lightRequests:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(new URL(request.url()).pathname==='/css/light-conditions-now.css')lightRequests.push(request.url());});
  await page.goto('/app');
  await expect(page.locator('html[data-app-ready]')).toHaveCount(1);
  const styles=await page.evaluate(()=>{
    const sheet=[...document.styleSheets].find(sheet=>sheet.href&&new URL(sheet.href).pathname==='/css/app-shell.css');
    if(!sheet)throw new Error('Missing eager app-shell stylesheet');
    const rules=[...sheet.cssRules],base=rules.filter(rule=>rule instanceof CSSStyleRule&&rule.selectorText==='.app-tooltip');
    const visible=rules.filter(rule=>rule instanceof CSSStyleRule&&rule.selectorText==='.app-tooltip.is-visible');
    const reduced=rules.filter(rule=>rule instanceof CSSMediaRule&&rule.conditionText==='(prefers-reduced-motion: reduce)')
      .flatMap(rule=>rule instanceof CSSMediaRule?[...rule.cssRules]:[])
      .filter(rule=>rule instanceof CSSStyleRule&&rule.selectorText==='.app-tooltip');
    return {href:sheet.href,base:base.map(rule=>rule.cssText),visible:visible.map(rule=>rule.cssText),reduced:reduced.map(rule=>rule.cssText),
      carriers:rules.filter(rule=>rule instanceof CSSStyleRule&&['[data-app-tooltip]','button[data-app-tooltip]','[data-app-tooltip]:focus-visible, [aria-describedby="app-tooltip"]:focus-visible'].includes(rule.selectorText)).map(rule=>rule.cssText),
      lightSheets:[...document.styleSheets].filter(sheet=>sheet.href&&new URL(sheet.href).pathname==='/css/light-conditions-now.css').map(sheet=>sheet.href)};
  });
  expect(styles.base).toHaveLength(1);expect(styles.visible).toHaveLength(1);expect(styles.reduced).toHaveLength(1);expect(styles.carriers).toHaveLength(3);
  expect(styles.lightSheets).toEqual([]);expect(lightRequests).toEqual([]);
  await page.evaluate(()=>{
    const target=globalThis as typeof globalThis&{coldTooltipEvents:{type:string;trusted:boolean;key:string|null;target:string;carrier:string}[]};target.coldTooltipEvents=[];
    for(const type of ['pointerover','focusin','keydown'])document.addEventListener(type,event=>{
      const element=event.target;target.coldTooltipEvents.push({type:event.type,trusted:event.isTrusted,key:event instanceof KeyboardEvent?event.key:null,target:element instanceof Element?element.tagName:'',carrier:element instanceof Element?element.closest('.tweaks-btn')?.getAttribute('class')||'':''});
    },{passive:true});
  });
  const carrier=page.locator('.header .tweaks-btn'),tooltip=page.locator('#app-tooltip');
  await expect(carrier).toHaveAttribute('title','Tweaks');
  await carrier.hover();
  await expect(tooltip).toHaveText('Tweaks');await expect(tooltip).toHaveAttribute('role','tooltip');
  await expect(tooltip).toHaveCSS('position','fixed');await expect(tooltip).toHaveCSS('pointer-events','none');await expect(tooltip).toHaveCSS('opacity','1');
  await expect(carrier).toHaveAttribute('aria-describedby','app-tooltip');await expect(carrier).not.toHaveAttribute('title');
  const tooltipNode=await tooltip.elementHandle();expect(tooltipNode).not.toBeNull();
  await page.mouse.move(0,0);
  await expect(tooltip).toHaveCSS('opacity','0');await expect(carrier).toHaveAttribute('title','Tweaks');await expect(carrier).not.toHaveAttribute('aria-describedby');
  // Genuine Tab navigation; no programmatic focus or synthetic keyboard event.
  for(let i=0;i<40;i++){
    if(await carrier.evaluate(node=>node===document.activeElement))break;
    await page.keyboard.press('Tab');
  }
  await expect(carrier).toBeFocused();expect(await carrier.evaluate(node=>node.matches(':focus-visible'))).toBe(true);
  await expect(carrier).toHaveAttribute('aria-describedby','app-tooltip');await expect(carrier).toHaveCSS('outline-width','2px');
  await expect(tooltip).toHaveCSS('opacity','1');await expect(tooltip).toHaveCSS('position','fixed');
  expect(await tooltipNode!.evaluate(node=>node===document.getElementById('app-tooltip'))).toBe(true);
  await page.keyboard.press('Escape');await expect(tooltip).toHaveCSS('opacity','0');await expect(carrier).toBeFocused();
  await expect(carrier).toHaveAttribute('title','Tweaks');await expect(carrier).not.toHaveAttribute('aria-describedby');
  await page.emulateMedia({reducedMotion:'reduce'});
  // The eager chat-redesign.css global .01ms!important rule keeps the exact
  // computed duration, while the app-shell tooltip rule disables transitions.
  await expect(tooltip).toHaveCSS('transition-property','none');await expect(tooltip).toHaveCSS('transition-duration','1e-05s');
  await carrier.hover();await expect(tooltip).toHaveCSS('opacity','1');
  expect(await tooltip.evaluate(node=>node.getAnimations().map(animation=>animation.playState))).toEqual([]);
  await page.mouse.move(0,0);await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
  await expect(carrier).toBeFocused();await expect(tooltip).toHaveText('Tweaks');await expect(tooltip).toHaveCSS('opacity','1');
  expect(await tooltip.evaluate(node=>node.getAnimations().map(animation=>animation.playState))).toEqual([]);
  await page.keyboard.press('Escape');await expect(tooltip).toHaveCSS('opacity','0');await expect(carrier).toBeFocused();
  await expect(carrier).toHaveAttribute('title','Tweaks');await expect(carrier).not.toHaveAttribute('aria-describedby');
  const events=await page.evaluate(()=>(globalThis as typeof globalThis&{coldTooltipEvents:{type:string;trusted:boolean;key:string|null;target:string;carrier:string}[]}).coldTooltipEvents);
  expect(events.some(event=>event.type==='pointerover'&&event.trusted&&event.carrier.includes('tweaks-btn'))).toBe(true);
  expect(events.some(event=>event.type==='focusin'&&event.trusted&&event.carrier.includes('tweaks-btn'))).toBe(true);
  expect(events.some(event=>event.type==='keydown'&&event.trusted&&event.key==='Tab')).toBe(true);
  expect(events.some(event=>event.type==='keydown'&&event.trusted&&event.key==='Escape'&&event.carrier.includes('tweaks-btn'))).toBe(true);
  expect(lightRequests).toEqual([]);expect(errors).toEqual([]);
  const fixture={source:'tests/fixtures/client-list-overview/pwa-profile.json',sha256:createHash('sha256').update(syntheticImported).digest('hex'),
    fields:39,registry,provider:'openrouter',paused:true,lastManualBackup:await page.evaluate(()=>localStorage.getItem('labcharts-last-manual-backup'))};
  await info.attach('cold-shared-tooltip',{body:JSON.stringify({fixture,styles,events,lightRequests,errors}),contentType:'application/json'});
});
