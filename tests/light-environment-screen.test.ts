import{nativeEnvironmentView,nativeTodayView,expectedGenuineLightChildren,genuineLightChildReceipts}from'./helpers/light-genuine-child-native-receipts.js';
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderScreenCard, activeScreenHoursBucket, activeScreenEveningBucket, type ScreenCardReader } from '../js/light-env-screen-ui.js';
import { projectEnvironmentToday } from '../js/light-environment-screen-presentation.js';
import { renderHTML as renderToday } from '../js/components/LightEnvironmentTodayToggle.svelte.html.js';
interface Sample { name:string;screen:ScreenCardReader;expanded:boolean;rooms:unknown;todayHTML?:string;aiHTML?:string;html:string }
const original=JSON.parse(readFileSync('tests/fixtures/light-environment-screen-original.json','utf8')) as {now:number;cases:Sample[]};
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(original.now);});
afterEach(()=>vi.useRealTimers());
function describe(html:string) {
  const root=document.createElement('div');root.innerHTML=html;
  const card=root.querySelector('.light-env-screen-card')!;
  const disclosure=card.querySelector('[data-light-env-action="toggle-screen-expanded"]')!;
  const attrs=(element:Element)=>Object.fromEntries([...element.attributes].filter(attr=>!['class','style','type','aria-label'].includes(attr.name)).map(attr=>[attr.name,attr.value]));
  return {
    cardId:card.getAttribute('data-id'),states:[...card.classList].filter(name=>name==='expanded'||name==='light-env-card-skipped'||name.startsWith('light-env-card-sev-')).sort(),
    disclosure:{label:disclosure.getAttribute('aria-label'),expanded:disclosure.getAttribute('aria-expanded'),id:disclosure.getAttribute('data-light-env-id')},
    copy:[...card.querySelectorAll('.light-env-screen-card-name,.light-env-screen-card-summary,.light-env-sev-dot,.light-env-picker-label')].map(element=>element.textContent?.replace(/\s+/g,' ').trim()),
    actions:[...card.querySelectorAll('[data-light-env-action]')].filter(element=>element!==disclosure).map(element=>({tag:element.tagName,attrs:attrs(element),options:[...element.querySelectorAll('option')].map(option=>({value:option.value,text:option.textContent,selected:option.hasAttribute('selected')}))})),
    chips:[...card.querySelectorAll('.light-env-chip')].map(chip=>({text:chip.textContent,active:chip.getAttribute('aria-pressed'),activeClass:chip.classList.contains('light-env-chip-active')})),
    trusted:genuineLightChildReceipts(card),
    blocker:card.querySelector('.light-env-screen-blocker')?.textContent?.replace(/\s+/g,' ').trim(),
  };
}
for(const sample of original.cases)it(`preserves independent original screen controls: ${sample.name}`,()=>{
  const before=JSON.stringify(sample);
  const current=renderScreenCard(sample.screen,{expanded:sample.expanded,rooms:sample.rooms,
    ...(sample.todayHTML?{getTodayView:()=>nativeTodayView(sample.name)}:{}),...(sample.aiHTML?{getScreenAIView:()=>nativeEnvironmentView('screen')}:{})});
  expect(describe(current)).toEqual(describe(expectedGenuineLightChildren(sample.html,sample.name)));expect(JSON.stringify(sample)).toBe(before);
  const root=document.createElement('div');root.innerHTML=current;
  expect(root.querySelector('img,script,[onerror]')).toBeNull();
  expect(root.querySelector('[data-light-env-action="toggle-screen-expanded"]')?.tagName).toBe('BUTTON');
  expect(root.querySelector('button button, [role="button"] button')).toBeNull();
  if(sample.expanded)expect(root.querySelector('input[type="checkbox"]')?.getAttribute('aria-label')).toBe('Blue reduction active');
});
it('evaluates public callbacks with original arguments and only expands AI when requested',()=>{
  const screen={id:'callback',device:'phone'},today=vi.fn(()=>undefined),ai=vi.fn(()=>null);
  const collapsed=renderScreenCard(screen,{getTodayView:today,getScreenAIView:ai});
  expect(today).toHaveBeenCalledExactlyOnceWith('screen','callback',true);expect(ai).not.toHaveBeenCalled();expect(collapsed).not.toContain('undefined');
  expect(renderScreenCard(screen,{expanded:true,getTodayView:today,getScreenAIView:ai})).not.toContain('>null<');expect(ai).toHaveBeenCalledExactlyOnceWith(screen);
});
it('composes the typed today child without invoking the compatibility callback',()=>{
  const fallback=vi.fn();const root=document.createElement('div');root.innerHTML=renderScreenCard({id:'typed'},{todayToggle:true,getTodayView:fallback});
  expect(fallback).not.toHaveBeenCalled();expect(root.querySelectorAll('[data-light-environment-today]')).toHaveLength(1);
  expect(root.querySelector('[data-light-env-action="set-today-active"]')?.getAttribute('data-light-env-id')).toBe('typed');
});
it('keeps bucket boundaries, unchecked scalars and original helper exports',()=>{
  expect([null,undefined,'bad',-1,0,.999,1,2.999,3,5.999,6,24].map(activeScreenHoursBucket)).toEqual([null,null,null,'most','short','short','some','some','lots','lots','most','most']);
  expect([null,undefined,-1,0,.5,1,2.999,3,'bad'].map(activeScreenEveningBucket)).toEqual([null,null,'none','none','lt1','mid','mid','gt3','gt3']);
});
it('projects shared room/screen today controls with stable action omission and escaped metadata',()=>{
  for(const active of [true,false])for(const compact of [true,false]){
    const view=projectEnvironmentToday('room','literal-"<&',active,compact),root=document.createElement('div');root.innerHTML=renderToday({view});
    const button=root.querySelector('button')!;
    expect(button.type).toBe('button');expect(button.getAttribute('data-light-env-active')).toBe(String(!active));expect(button.getAttribute('aria-pressed')).toBe(String(active));
    expect(button.getAttribute('data-light-env-id')).toBe('literal-"<&');expect(button.textContent?.replace(/\s+/g,' ').trim()).toBe(`${view.icon}${compact?'':' '}${view.label}`);
    expect(button.getAttribute('aria-label')).toBe(`${view.label} — click to flip`);expect(root.querySelector('img,script')).toBeNull();
  }
  expect(projectEnvironmentToday(false,0,false)).toMatchObject({kind:undefined,id:'0',active:false});
});
it('renders unsupported device identities as a safe fallback, including inherited object keys',()=>{
  const root=document.createElement('div');root.innerHTML=renderScreenCard({device:'__proto__'});
  expect(root.querySelector('.light-env-screen-card-icon')?.textContent).toBe('📱');expect(root.querySelector('.light-env-screen-card-name')?.textContent).toBe('Device');
});
