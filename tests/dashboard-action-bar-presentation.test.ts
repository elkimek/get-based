// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import fixture from './fixtures/dashboard-action-bar-original.json' with {type:'json'};
import {createDashboardWidgetControls} from '../js/dashboard-widget-controls.js';
import {state} from '../js/state.js';
import {dashboardBiometricSelectionKey} from '../js/dashboard-widgets.js';

const originalState=Object.getOwnPropertyDescriptors(state);
const originalNodes=[...document.body.childNodes];
const originalFocus=document.activeElement;
const storage=Array.from({length:localStorage.length},(_,i)=>{const key=localStorage.key(i)!;return [key,localStorage.getItem(key)!] as const;});
const listeners:Array<{type:string;listener:EventListenerOrEventListenerObject;options:boolean|AddEventListenerOptions|undefined}>=[];
const calls:string[]=[];
let controls:ReturnType<typeof createDashboardWidgetControls>;
let resetFailure=false;
function expectedNative(key:string):unknown {const sample=fixture.cases.find(row=>row.key===key);expect(sample).toBeDefined();const view=fixture.views.find(row=>row.key===sample!.viewKey);expect(view).toBeDefined();return view!.tree;}
const cases=[['undefined',undefined],['false',false],['null',null],['zero',0],['one',1],['empty-string',''],['string','reset'],['array',[]],['object',{}],['boxed-false',new Boolean(false)],['symbol',Symbol('reset')],['zero-bigint',0n],['one-bigint',1n],['nan',NaN]] as const;
const anchors={
  'plain-hidden':[[[0],'['],[[1],'[-1'],[[6],'[-1'],[[7],']'],[[8],']'],[[9],']']],
  'plain-reset':[[[0],'['],[[1],'[-1'],[[6],'[0'],[[8],']'],[[9],']'],[[10],']']],
  'sticky-hidden':[[[0],'['],[[1],'[0'],[[2,4],'[-1'],[[2,5],']'],[[2,6],''],[[3],']'],[[4],']']],
  'sticky-reset':[[[0],'['],[[1],'[0'],[[2,4],'[0'],[[2,6],']'],[[2,7],''],[[3],']'],[[4],']']],
} as const;
function comments(node:Node,path:number[]=[]):Array<{path:number[];value:string|null}>{return [...node.childNodes].flatMap((child,index)=>{const next=[...path,index];return [...(child.nodeType===Node.COMMENT_NODE?[{path:next,value:child.nodeValue}]:[]),...comments(child,next)];});}
function nativeTree(node:Node):unknown {
 if(node instanceof Element)return {tag:node.tagName,attrs:[...node.attributes].map(attr=>[attr.name,attr.value]),children:[...node.childNodes].map(nativeTree),...(node instanceof HTMLButtonElement?{type:node.type,disabled:node.disabled,name:node.name,tabIndex:node.tabIndex}: {})};
 if(node.nodeType===Node.TEXT_NODE)return {text:node.nodeValue};
 if(node instanceof DocumentFragment)return [...node.childNodes].map(nativeTree);
 throw new Error('Unexpected native node; only exact reviewed compiler comments may be removed');
}
function parsed(html:string,sticky:boolean,reset:boolean):unknown {
 const template=document.createElement('template');template.innerHTML=html;
 const expected=anchors[`${sticky?'sticky':'plain'}-${reset?'reset':'hidden'}`];
 expect(comments(template.content)).toEqual(expected.map(([path,value])=>({path:[...path],value})));
 const nodes=expected.map(([path,value])=>{let node:Node=template.content;for(const index of path)node=node.childNodes[index]!;expect(node.nodeType).toBe(Node.COMMENT_NODE);expect(node.nodeValue).toBe(value);return node;});
 for(const node of nodes)node.parentNode!.removeChild(node);
 return nativeTree(template.content);
}
beforeEach(()=>{
 calls.length=0;resetFailure=false;
 document.body.innerHTML='<main id="host"><span id="foreign">retained</span></main>';
 state.currentProfile='synthetic-action-bar';
 const add=document.addEventListener.bind(document);
 const capture=vi.spyOn(document,'addEventListener').mockImplementation((type,listener,options)=>{listeners.push({type,listener,options});add(type,listener,options);});
 try{controls=createDashboardWidgetControls({state,getActiveData:()=>({categories:{}}),getAvailableDashboardFixedWidgets:()=>[],getDashboardWidgetPrefs:()=>({order:[],hidden:[]}),dashboardMarkerIdFromWidgetId:()=>'',getDashboardBiometricSelection:()=>[],getDashboardBiometricMetricOrder:()=>[],resetDashboardWidgetPrefs(){calls.push('reset');if(resetFailure)throw new Error('synthetic reset failure');},rerenderDashboardFromWidgetChange(){calls.push('render');}});}finally{capture.mockRestore();}
});
afterEach(()=>{
 controls.closeDashboardWidgetPicker();
 for(const row of listeners.splice(0))document.removeEventListener(row.type,row.listener,row.options);
 for(const key of Reflect.ownKeys(state))if(!Object.hasOwn(originalState,key))Reflect.deleteProperty(state,key);Object.defineProperties(state,originalState);
 localStorage.clear();for(const [key,value]of storage)localStorage.setItem(key,value);
 document.body.replaceChildren(...originalNodes);if(originalFocus instanceof HTMLElement&&originalFocus.isConnected)originalFocus.focus();
 vi.restoreAllMocks();
});

it('preserves all original action-bar defaults, native attributes, text and whitespace for both modes',()=>{
 for(const mode of [false,true]){
  controls.toggleDashboardOrganizeMode(mode);calls.length=0;
  for(const [label,includeReset]of cases){expect(parsed(controls.renderDashboardControlButtons({includeReset}),false,!!(includeReset||mode))).toEqual(expectedNative(`${mode}:${label}`));}
  expect(parsed(controls.renderDashboardStickyControls(),true,mode)).toEqual(expectedNative(`${mode}:sticky`));
  expect(calls).toEqual([]);
 }
});
it('reads the reset getter exactly once and never coerces a truthy object',()=>{
 const trace:string[]=[];const value={ [Symbol.toPrimitive](){throw new Error('ToBoolean never coerces this object');}};
 const html=controls.renderDashboardControlButtons({get includeReset(){trace.push('read');return value;}});
 expect(trace).toEqual(['read']);expect(parsed(html,false,true)).toEqual(expectedNative('false:object'));
 controls.toggleDashboardOrganizeMode(true);trace.length=0;
 controls.renderDashboardControlButtons({get includeReset(){trace.push('read');return false;}});expect(trace).toEqual(['read']);
});
it('preserves null destructuring and getter exceptions before any DOM or controller mutation',()=>{
 const host=document.getElementById('host')!,first=host.firstChild,html=host.innerHTML;
 expect(()=>controls.renderDashboardControlButtons(null as unknown as {includeReset?:unknown})).toThrow(TypeError);
 const failure=new Error('synthetic getter failure');expect(()=>controls.renderDashboardControlButtons({get includeReset(){throw failure;}})).toThrow(failure);
 expect(controls.isOrganizeMode()).toBe(false);expect(calls).toEqual([]);expect(host.innerHTML).toBe(html);expect(host.firstChild).toBe(first);
});
it('uses actual delegated Organize and Reset actions without changing per-profile reset chronology',()=>{
 const host=document.getElementById('host')!;host.innerHTML=controls.renderDashboardControlButtons();
 host.querySelector<HTMLButtonElement>('[data-dashboard-widget-action="toggle-organize"]')!.click();
 expect(controls.isOrganizeMode()).toBe(true);expect(calls).toEqual(['render']);
 host.innerHTML=controls.renderDashboardControlButtons();const key=dashboardBiometricSelectionKey();localStorage.setItem(key,'synthetic-selection');localStorage.setItem('labcharts-other-dashboardBiometrics','other-selection');
 host.querySelector<HTMLButtonElement>('[data-dashboard-widget-action="reset-widgets"]')!.click();
 expect(calls).toEqual(['render','reset','render']);expect(controls.isOrganizeMode()).toBe(false);expect(localStorage.getItem(key)).toBeNull();expect(localStorage.getItem('labcharts-other-dashboardBiometrics')).toBe('other-selection');
});
it('retains organizing state and selection when the existing reset dependency throws',()=>{
 controls.toggleDashboardOrganizeMode(true);calls.length=0;const key=dashboardBiometricSelectionKey();localStorage.setItem(key,'keep');resetFailure=true;
 expect(()=>controls.resetDashboardWidgets()).toThrow('synthetic reset failure');expect(controls.isOrganizeMode()).toBe(true);expect(localStorage.getItem(key)).toBe('keep');expect(calls).toEqual(['reset']);
});


it.each(['Escape','close button','backdrop'] as const)('returns Dashboard picker focus to its delegated initiator after %s without click autofocus',dismissal=>{
 const host=document.getElementById('host')!;host.innerHTML=controls.renderDashboardControlButtons()+'<button id="other-focus">Other focus</button>';
 const opener=host.querySelector<HTMLButtonElement>('[data-dashboard-widget-action="open-picker"]')!,other=document.getElementById('other-focus')!;
 other.focus();opener.click();
 const overlay=document.getElementById('dashboard-widget-picker-overlay')!;expect(overlay).not.toBeNull();
 expect(document.activeElement).toBe(other); // A click need not focus a button in Safari.
 const close=overlay.querySelector<HTMLButtonElement>('[data-dashboard-widget-action="close-picker"]')!;close.focus();
 if(dismissal==='Escape')document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 else if(dismissal==='close button')close.click();
 else overlay.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
 expect(document.getElementById('dashboard-widget-picker-overlay')).toBeNull();expect(document.activeElement).toBe(opener);expect(calls).toEqual([]);
});
it('does not restore Dashboard picker focus to a disconnected initiator',()=>{
 const host=document.getElementById('host')!;host.innerHTML=controls.renderDashboardControlButtons()+'<button id="other-focus">Other focus</button>';
 const opener=host.querySelector<HTMLButtonElement>('[data-dashboard-widget-action="open-picker"]')!,other=document.getElementById('other-focus')!;
 other.focus();opener.click();expect(document.getElementById('dashboard-widget-picker-overlay')).not.toBeNull();opener.remove();other.focus();
 controls.closeDashboardWidgetPicker();expect(document.activeElement).toBe(other);expect(calls).toEqual([]);
});
it('preserves the active-element fallback for programmatic Dashboard picker opening',()=>{
 const other=document.createElement('button');document.getElementById('host')!.append(other);other.focus();
 controls.openDashboardWidgetPicker();const overlay=document.getElementById('dashboard-widget-picker-overlay')!;expect(overlay).not.toBeNull();
 overlay.querySelector<HTMLButtonElement>('[data-dashboard-widget-action="close-picker"]')!.focus();controls.closeDashboardWidgetPicker();
 expect(document.activeElement).toBe(other);expect(calls).toEqual([]);
});
