import fs from 'node:fs';
import {expect,test} from './coverage-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {scopedFrozenStyles,type FrozenStyleBlock} from '../helpers/frozen-style-scope.js';
import type {CameraMessageView,CameraToolKey} from '../../js/light-camera-presentation.js';
const original=JSON.parse(fs.readFileSync('tests/fixtures/light-camera-original.json','utf8')) as {
 shells:{key:CameraToolKey;authored:string}[];messages:{view:CameraMessageView;html:string}[];styleBlocks:FrozenStyleBlock[];
};
test('camera tools preserve frozen shells, results and live geometry with native focus',async({page},info)=>{
 test.setTimeout(120000);await installDiscussionFixture(page.context());await page.goto('/app');
 await expect(page.locator('html[data-app-ready]')).toBeAttached();await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.evaluate(async({original,css})=>{
  await(await import('/js/light-sun-loader.js')).loadLightSunUI();
  const {renderHTML}=await import('/js/components/LightCameraPresentation.svelte.html.js');
  const {projectAimingGuide}=await import('/js/light-camera-presentation.js');
  // Explicit improvements: shrinkable calibration input, visible focus, and 44px coarse controls.
  const style=document.createElement('style');style.textContent=css+'[data-original] #lux-cal-reference{min-width:0}@media(pointer:coarse){[data-original] #lux-cal-reference{min-width:44px}[data-original] .modal-close,[data-original] .import-btn,[data-original] .ctx-btn-option,[data-original] input,[data-original] summary{min-width:44px;min-height:44px}}';document.head.append(style);
  const host=document.createElement('div');host.id='light-camera-acceptance';host.style.cssText='position:fixed;inset:0;z-index:20000;overflow:auto;background:var(--bg-primary);padding:12px';document.body.append(host);
  const oldHost=document.createElement('div');oldHost.innerHTML=original.shells.find(sample=>sample.key==='lux')!.authored;
  const zones=[...oldHost.querySelectorAll('.lux-zone-marker')].map(node=>({max:Number(node.textContent?.match(/\d+/)?.[0]),label:node.querySelector('span')!.textContent!}));
  const pair=(name:string,tool:CameraToolKey,message?:{view:CameraMessageView;html:string})=>{
   const sample=original.shells.find(sample=>sample.key===tool)!;
   const pair=document.createElement('div');pair.dataset.pair=name;
   for(const kind of ['original','current']){
    const section=document.createElement('section');section.dataset[kind]='';section.className='modal-overlay light-tool-overlay show';section.style.cssText='position:static;display:block;padding:0;background:none;backdrop-filter:none;-webkit-backdrop-filter:none;cursor:default';
    section.innerHTML=kind==='original'?sample.authored:renderHTML({kind:'shell',view:{tool,guide:projectAimingGuide(tool),zones}});
    if(message){const target=tool==='cct'?'#cct-coherence':tool==='spectrum'?'#spec-result':tool==='flicker'?'#flicker-result':tool==='darkness'?'#dark-status':tool==='glass-transmission'?'#glass-result':'#lux-source-line';section.querySelector(target)!.innerHTML=kind==='original'?message.html:renderHTML(message.view);}
    if(name==='lux-manual'){section.querySelector<HTMLElement>('#lux-live-dial')!.hidden=true;section.querySelector<HTMLElement>('#lux-manual-entry')!.hidden=false;}
    section.querySelectorAll('details').forEach(node=>node.open=true);pair.append(section);
   }
   host.append(pair);
  };
  for(const sample of original.shells)pair(sample.key,sample.key);
  pair('lux-manual','lux');
  for(const [index,message] of original.messages.entries()){
   const prefix=message.view.kind.split('-')[0]!;
   const tool=prefix==='glass'?'glass-transmission':prefix as CameraToolKey;
   pair(message.view.kind+'-'+index,tool,message);
  }
 },{original,css:scopedFrozenStyles(original.styleBlocks)});
 const host=page.locator('#light-camera-acceptance');let pairs=0;
 const widths=[320,430,431,700,721,1100];
 for(const width of widths)for(const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']){
  await page.setViewportSize({width,height:1000});await page.mouse.move(0,0);
  await page.evaluate(async theme=>(await import('/js/theme.js')).setTheme(theme),theme);
  await expect.poll(()=>host.evaluate(host=>{
   const properties=['display','width','height','minWidth','minHeight','fontSize','fontWeight','fontFamily','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','gridTemplateColumns','alignItems','borderTopWidth','borderTopStyle','borderTopColor','borderLeftWidth','borderLeftColor','borderRadius','whiteSpace','overflow','opacity','backgroundColor','backgroundImage','color','fontVariantNumeric','aspectRatio','objectFit'] as const;
   const failures:string[]=[];
   for(const pair of host.querySelectorAll('[data-pair]')){
    const old=[...pair.querySelector('[data-original]')!.querySelectorAll('*')],current=[...pair.querySelector('[data-current]')!.querySelectorAll('*')];
    if(old.length!==current.length){failures.push(`${pair.getAttribute('data-pair')}: nodes ${current.length}/${old.length}`);continue;}
    old.forEach((node,index)=>{const a=getComputedStyle(node),b=getComputedStyle(current[index]!);for(const prop of properties)if(a[prop]!==b[prop])failures.push(`${pair.getAttribute('data-pair')}/${index}/${node.tagName}/${prop}: ${b[prop]} != ${a[prop]}`);});
   }
   return failures;
  }),{message:`${width}/${theme} frozen camera styles`}).toEqual([]);
  pairs+=await host.locator('[data-pair]').count();
 }
 await host.locator('[data-original]').evaluateAll(nodes=>nodes.forEach(node=>node.remove()));
 for(const modal of await host.locator('.modal').all()){await expect(modal).toHaveCSS('opacity','1');await expect(modal).toHaveCSS('transform','matrix(1, 0, 0, 1, 0, 0)');}
 await page.keyboard.press('Tab');let controls=0;
 for(const control of await host.locator('button:not(:disabled),input,summary').all()){
  if(!await control.isVisible())continue;await control.focus();await expect(control).toBeFocused();controls++;
  const style=await control.evaluate(node=>({outline:parseFloat(getComputedStyle(node).outlineWidth),width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,coarse:matchMedia('(pointer:coarse)').matches}));
  expect(style.outline).toBeGreaterThanOrEqual(2);if(style.coarse){expect(style.width).toBeGreaterThanOrEqual(44);expect(style.height).toBeGreaterThanOrEqual(44);}
 }
 const disclosure=host.locator('[data-pair=lux] summary');await disclosure.focus();await page.keyboard.press('Space');await expect(disclosure.locator('..')).not.toHaveAttribute('open');await page.keyboard.press('Enter');await expect(disclosure.locator('..')).toHaveAttribute('open','');
 expect(errors).toEqual([]);fs.writeFileSync(info.outputPath('light-camera-parity.json'),JSON.stringify({pairs,controls,widths,themes:6,pageErrors:errors}));
});
