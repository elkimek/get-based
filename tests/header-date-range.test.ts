// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {state} from '../js/state.js';
import {configureDataRuntimeDeps, configureDataViewCoreDependencies, installDataActionDelegates, updateHeaderDates, updateHeaderRangeToggle} from '../js/data-view-controls.js';
import type {ActiveData} from '../js/data-view-types.js';

// Real public owners and compiled renderer; method/JSDOM events are unit contracts, not native input evidence.
const originalState = Object.getOwnPropertyDescriptors(state);
const initialBody = document.body.innerHTML;
const initialStorage = Array.from({length:localStorage.length},(_,i)=>{const key=localStorage.key(i)!;return [key,localStorage.getItem(key)!] as const;});
const initialRAF = Object.getOwnPropertyDescriptor(window,'requestAnimationFrame');
const activeData: ActiveData = {categories:{},dates:['2024-01-01','2025-02-01'],dateLabels:['Jan 2024','Feb 2025']};
let restoreCore: ReturnType<typeof configureDataViewCoreDependencies>;
let restoreRuntime: ReturnType<typeof configureDataRuntimeDeps>;
const frames: FrameRequestCallback[] = [], calls: string[] = [];
const source = (value: unknown): ActiveData => value as ActiveData;
function host(id: string): HTMLElement {const value=document.getElementById(id);if(!value)throw new Error(`Required header fixture: ${id}`);return value;}
function dateState() {const el=host('header-dates');return {html:el.innerHTML,style:el.getAttribute('style'),first:el.firstChild};}
const timer = (): Promise<void> => new Promise(resolve=>setTimeout(resolve,0));
beforeEach(()=>{
  document.body.innerHTML='<div id="header-dates" class="chip header-date-chip"><span class="label">Dates:</span> retained</div><div id="header-range-toggle" class="range-toggle"></div>';
  Object.defineProperties(state,originalState);
    state.rangeMode='optimal';state.currentProfile='header-contract';state.currentView='dashboard';delete state._activeDetailMarkerId;
  calls.length=0;frames.length=0;
  restoreCore=configureDataViewCoreDependencies({getActiveData:()=>{calls.push('getActiveData');return activeData;}});
  restoreRuntime=configureDataRuntimeDeps({buildSidebar:data=>{expect(data).toBe(activeData);calls.push('build');},navigate:(route,data)=>{expect(route).toBe('dashboard');
    expect(data).toBe(activeData);calls.push('navigate');},showDetailModal:()=>{throw new Error('No active detail in this fixture');}});
  Object.defineProperty(window,'requestAnimationFrame',{value:function(this: unknown,callback: FrameRequestCallback): number {expect(this).toBe(window);frames.push(callback);return frames.length;},writable:true,configurable:true});
});
afterEach(async()=>{
  for(const frame of frames.splice(0))frame(0);await timer();
  configureDataRuntimeDeps(restoreRuntime);configureDataViewCoreDependencies(restoreCore);
  for(const key of Reflect.ownKeys(state))if(!Object.hasOwn(originalState,key))Reflect.deleteProperty(state,key);Object.defineProperties(state,originalState);
  expect(Object.getOwnPropertyDescriptors(state)).toEqual(originalState);
  localStorage.clear();for(const [key,value]of initialStorage)localStorage.setItem(key,value);
  document.body.innerHTML=initialBody;
  if(initialRAF)Object.defineProperty(window,'requestAnimationFrame',initialRAF);else Reflect.deleteProperty(window,'requestAnimationFrame');
});

describe('header dates preserve public ordering and intentionally render supplied labels as literal text',()=>{
  it('calls fallback before missing-host return but leaves supplied data unread without a host',()=>{
    host('header-dates').remove();
    updateHeaderDates();
    expect(calls).toEqual(['getActiveData']);let reads=0;
    updateHeaderDates(source({get dateLabels(){reads++;throw new Error('must not read');}}));
    expect(reads).toBe(0);
    expect(calls).toEqual(['getActiveData']);
  });
  it('uses configured null fallback and preserves exact normal first/last label text',()=>{
    updateHeaderDates(null);
    expect(calls).toEqual(['getActiveData']);
    const el=host('header-dates');
    expect(el.textContent).toBe('Dates: Jan 2024 – Feb 2025');
    expect(el.querySelector('span')!.outerHTML).toBe('<span class="label">Dates:</span>');
    expect(el.style.display).toBe('');
  });
  it('hides empty labels without clearing existing children or foreign attributes',()=>{
    const el=host('header-dates');el.dataset.foreign='keep';
    const first=el.firstChild;
    const html=el.innerHTML;
    updateHeaderDates(source({dateLabels:[]}));
    expect(el.innerHTML).toBe(html);
    expect(el.firstChild).toBe(first);
    expect(el.dataset.foreign).toBe('keep');
    expect(el.style.display).toBe('none');
  });
  it('escapes hostile markup and entities as literal text, without any injectable node or attribute',()=>{
    const label='<img src="x" onerror="bad()"><script>bad()</script><em>&amp;\u00a0↔</em>\n  tail';
    updateHeaderDates(source({dateLabels:[label]}));
    const el=host('header-dates');
    expect(el.textContent).toBe('Dates: '+label);
    expect(el.querySelectorAll('img,script,em,[onerror]')).toHaveLength(0);
    expect(el.querySelectorAll('span')).toHaveLength(1);
  });
  it.each([null,undefined])('retains original template nullish coercion (%s)',value=>{updateHeaderDates(source({dateLabels:[value]}));
    expect(host('header-dates').textContent).toBe('Dates: '+String(value));});
  it('uses string-hint template coercion and keeps Symbol failure atomic',()=>{
    const hints: string[]=[];
    updateHeaderDates(source({dateLabels:[{[Symbol.toPrimitive](hint:string){hints.push(hint);return '<literal>';}}]}));
    expect(hints).toEqual(['string']);
    expect(host('header-dates').textContent).toBe('Dates: <literal>');
    const el=host('header-dates');el.style.display='none';
    const before=dateState();
    expect(()=>updateHeaderDates(source({dateLabels:[Symbol('native')]}))).toThrow(TypeError);
    expect(dateState()).toEqual(before);
    expect(el.firstChild).toBe(before.first);
  });
  it('keeps repeated dateLabels reads and first/last coercion order, never converting the middle',()=>{
    const trace: string[]=[];let reads=0;
    const labels=new Proxy([{toString(){trace.push('first:String');return 'A';}},{toString(){throw new Error('middle');}},{toString(){trace.push('last:String');return 'Z';}}],{get(target,key,receiver){if(key==='length'||key==='0'||key==='2')trace.push(String(key));return Reflect.get(target,key,receiver);}});
    updateHeaderDates(source({get dateLabels(){trace.push('labels:'+ ++reads);return labels;}}));
    expect(trace).toEqual(['labels:1','length','labels:2','length','0','first:String','length','2','last:String']);
    expect(host('header-dates').textContent).toBe('Dates: A – Z');
  });
  it('preserves the previous DOM and display on a second labels-read error',()=>{
    let reads=0;
    const fault=new Error('second-read');
    const el=host('header-dates');
    const before=dateState();
    expect(()=>updateHeaderDates(source({get dateLabels(){if(++reads===2)throw fault;return ['A'];}}))).toThrow(fault);
    expect(dateState()).toEqual(before);
    expect(el.firstChild).toBe(before.first);
  });
});

describe('fresh header range buttons and preserved native patch nodes',()=>{
  it.each(['optimal','reference','both'] as const)('creates native controls for %s with exact attributes/order/defaults',mode=>{
    state.rangeMode=mode;
    updateHeaderRangeToggle();
    const el=host('header-range-toggle');
    const buttons=Array.from(el.querySelectorAll('button'));
    expect(buttons.map(b=>b.dataset.range)).toEqual(['optimal','reference','both']);
    for(const button of buttons){const m=button.dataset.range!;
    expect(Array.from(button.attributes,a=>[a.name,a.value])).toEqual([['class','range-toggle-btn'+(m===mode?' active':'')],['type','button'],['data-range',m],['aria-pressed',String(m===mode)],['data-lab-data-action','switch-range-mode'],['data-lab-data-range',m]]);
    expect(button.type).toBe('button');
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe(m.charAt(0).toUpperCase()+m.slice(1));}
    expect(Array.from(el.childNodes).filter(node=>node.nodeType===Node.TEXT_NODE)).toHaveLength(0); // Compiler comments are qualified separately after the actual build.
  });
  it('keeps two independent mode reads per creation row, even when values change',()=>{
    const values=['optimal','both','reference','optimal','both','reference'];let reads=0;Object.defineProperty(state,'rangeMode',{get(){return values[reads++];},configurable:true});
    updateHeaderRangeToggle();
    const buttons=Array.from(host('header-range-toggle').querySelectorAll('button'));
    expect(reads).toBe(6);
    expect(buttons.map(b=>b.className)).toEqual(['range-toggle-btn active','range-toggle-btn active','range-toggle-btn active']);
    expect(buttons.map(b=>b.getAttribute('aria-pressed'))).toEqual(['false','false','false']);
  });
  it('keeps creation getter failure atomic and never reads mode without a host',()=>{
    const el=host('header-range-toggle');el.innerHTML='<i data-foreign="keep">old</i>';
    const old=el.firstChild;let reads=0;
    const fault=new Error('third-mode-read');Object.defineProperty(state,'rangeMode',{get(){if(++reads===3)throw fault;return 'optimal';},configurable:true});
    expect(()=>updateHeaderRangeToggle()).toThrow(fault);
    expect(el.firstChild).toBe(old);
    expect(el.innerHTML).toBe('<i data-foreign="keep">old</i>');el.remove();reads=0;
    updateHeaderRangeToggle();
    expect(reads).toBe(0);
  });
  it('patches reordered/nested native controls while retaining focused identity, listener, label, style and foreign contents',()=>{
    const el=host('header-range-toggle');el.innerHTML='<section data-foreign="wrapper"><button class="range-toggle-btn foreign" type="submit" data-range="both" data-extra="keep" style="color:red">Custom both</button><button class="range-toggle-btn active" data-range="optimal">A</button><button class="range-toggle-btn" data-range="reference">R</button></section><i>extra</i>';
    const nodes=Array.from(el.querySelectorAll<HTMLButtonElement>('.range-toggle-btn'));
    const first=nodes[0]!;let events=0;first.addEventListener('contract-probe',()=>events++);first.focus();
    const style=first.getAttribute('style');
    const extra=el.lastChild;
    state.rangeMode='reference';
    updateHeaderRangeToggle();
    const patched=Array.from(el.querySelectorAll('.range-toggle-btn'));
    expect(patched).toHaveLength(nodes.length);patched.forEach((node,index)=>expect(node).toBe(nodes[index]));
    expect(nodes.map(node=>node.type)).toEqual(['submit','submit','submit']);
    expect(document.activeElement).toBe(first);
    expect(first.textContent).toBe('Custom both');
    expect(first.type).toBe('submit');
    expect(first.getAttribute('data-extra')).toBe('keep');
    expect(first.getAttribute('style')).toBe(style);
    expect(first.className).toBe('range-toggle-btn foreign');
    expect(first.getAttribute('aria-pressed')).toBe('false');
    expect(nodes[2]!.getAttribute('aria-pressed')).toBe('true');
    expect(el.lastChild).toBe(extra);first.dispatchEvent(new Event('contract-probe'));
    expect(events).toBe(1);
  });
  it('preserves the original loose nonbutton predicate and rebuilds duplicate-mode sets',()=>{
    const el=host('header-range-toggle');el.innerHTML='<span class="range-toggle-btn" data-range="both" data-extra="yes">span</span><button class="range-toggle-btn" data-range="optimal">A</button><button class="range-toggle-btn" data-range="reference">R</button>';
    const span=el.firstChild;
    state.rangeMode='both';
    updateHeaderRangeToggle();
    expect(el.firstChild).toBe(span);
    expect(el.querySelector('span')!.getAttribute('data-extra')).toBe('yes');
    expect(el.querySelector('span')!.getAttribute('aria-pressed')).toBe('true');
    el.innerHTML='<button class="range-toggle-btn" data-range="both">old</button><button class="range-toggle-btn" data-range="both">old2</button><button class="range-toggle-btn" data-range="optimal">A</button>';
    const old=el.firstChild;
    updateHeaderRangeToggle();
    expect(old!.isConnected).toBe(false);
    expect(el.querySelectorAll('button')).toHaveLength(3);
    expect(el.querySelector('[data-range="reference"]')).not.toBeNull();
  });
  it('keeps repeated delegate installation single and uses unchanged state/storage/RAF→timer callbacks',async()=>{
    updateHeaderRangeToggle();installDataActionDelegates();installDataActionDelegates();
    const button=host('header-range-toggle').querySelector<HTMLButtonElement>('[data-range="both"]')!;
    const trusted:boolean[]=[];button.addEventListener('click',event=>trusted.push(event.isTrusted));button.click();
    expect(trusted).toEqual([false]);
    expect(state.rangeMode).toBe('both');
    expect(localStorage.getItem('labcharts-header-contract-rangeMode')).toBe('both');
    expect(frames).toHaveLength(1);
    expect(calls).toEqual([]);for(const frame of frames.splice(0))frame(0);
    expect(calls).toEqual([]);await timer();
    expect(calls).toEqual(['getActiveData','build','navigate']);
  });
});
