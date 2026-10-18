// @vitest-environment jsdom
import {describe,it,expect,vi,afterEach} from 'vitest';
import {compareGenuineReceipt} from './helpers/compare-genuine-native-receipts.js';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import * as candidate from '../js/compare-correlations.js';
import {state} from '../js/state.js';
import type {CompareData,CompareNumericMarker} from '../types/compare-correlations.js';
const fixture=vi.hoisted(()=>({saves:0,load:'pending',loads:0}));
vi.mock('../js/correlation-workspace-store.js',()=>({saveCorrelationWorkspace:()=>{fixture.saves++;return Promise.resolve();}}));
vi.mock('../js/health-data-loader.js',()=>({ensureChartJs:()=>{fixture.loads++;return fixture.load==='failure'?Promise.reject(new Error('synthetic unavailable chart')):new Promise<void>(()=>{});}}));
const initialData=state.importedData,initialMarkers=state.selectedCorrelationMarkers,initialTreatments=state.selectedCorrelationSupplements,initialView=state.correlationView;
const records:unknown[]=[];
const before=JSON.parse(readFileSync(path.join(__dirname,'fixtures/correlations-selection-original.json'),'utf8')) as {name:string;original:unknown}[];
afterEach(()=>{state.importedData=initialData;state.selectedCorrelationMarkers=initialMarkers;state.selectedCorrelationSupplements=initialTreatments;state.correlationView=initialView;vi.unstubAllGlobals();vi.restoreAllMocks();});

function marker(name='Glucose'):CompareNumericMarker{return {name,unit:'mmol/L',values:[4,NaN,7,null,Infinity],refMin:3,refMax:8,optimalMin:4,optimalMax:6};}
function input():CompareData{return {dates:['2026-01-01','2026-02-01'],dateLabels:['Jan','Feb'],categories:{biochemistry:{label:'<Biochemistry> & "gb-corr-marker"',markers:{glucose:marker('<Glucose> & "gb-corr-chip-label"'),skip:marker('Skipped'),empty:marker('Empty')}},other:{label:'Other',markers:{one:marker('Single')}}}};}
function configure(source:CompareData,selected:string[],treatments:string[]){
 source.categories.biochemistry!.markers.skip!.singlePoint=true;source.categories.biochemistry!.markers.empty!.values=[null,NaN,Infinity];source.categories.other!.markers.one!.singlePoint=true;
 state.importedData={...initialData,entries:source.dates.map((date,index)=>({date:String(date),markers:{'biochemistry.glucose':index+4}})),supplements:[{id:'med01',name:'<Medicine> & "gb-corr-key"',type:'medication',startDate:'2026-01-02'},{id:'blank',name:'',periods:[{start:'2026-01-03'}]},{id:'undated',name:'Undated'},{name:''}]};
 state.selectedCorrelationMarkers=[...selected];state.selectedCorrelationSupplements=[...treatments];state.correlationView={...initialView,hidden:['biochemistry.glucose','med01'],pair:'0'};fixture.saves=0;fixture.loads=0;
 vi.stubGlobal('document',document.implementation.createHTMLDocument('One public Correlations owner'));
 document.body.innerHTML='<main id="main-content"></main>';
}
function tree(node:Node):unknown {if(node instanceof Element)return {type:node.nodeType,name:node.nodeName,attrs:[...node.attributes].map(a=>[a.name,a.value]),children:[...node.childNodes].map(tree),...(node instanceof HTMLInputElement?{value:node.value,defaultValue:node.defaultValue,type:node.type}:{}),...(node instanceof HTMLButtonElement?{type:node.type,disabled:node.disabled}:{}),...(node instanceof HTMLElement?{hidden:node.hidden}: {})};return {type:node.nodeType,text:node.nodeValue};}
async function capture(owner:typeof candidate,selected:string[]=[],treatments:string[]=[],failure=false,interact=false,advanced=false){
 const source=input();configure(source,selected,treatments);fixture.load=failure?'failure':'pending';const raw:{id:string;operation:string;html:string}[]=[];
 const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML')!;
 vi.spyOn(Element.prototype,'innerHTML','set').mockImplementation(function(this:Element,value:string){raw.push({id:this.id,operation:'innerHTML',html:String(value)});descriptor.set!.call(this,value);});
 const insert=Element.prototype.insertAdjacentHTML;vi.spyOn(Element.prototype,'insertAdjacentHTML').mockImplementation(function(this:Element,position:InsertPosition,html:string){raw.push({id:this.id,operation:position,html});insert.call(this,position,html);});
 owner.installCompareCorrelationDelegates(document);owner.showCorrelations(source);
 if(failure){await Promise.resolve();await Promise.resolve();}
 const lifecycle:unknown[]=[];
 if(interact){
  const search=document.querySelector<HTMLInputElement>('#corr-search')!;search.value='no match';search.dispatchEvent(new Event('input',{bubbles:true}));lifecycle.push({empty:document.getElementById('corr-no-results')!.hidden,expanded:search.getAttribute('aria-expanded')});
  search.value='glucose';search.dispatchEvent(new Event('input',{bubbles:true}));
  for(const option of document.querySelectorAll<HTMLElement>('.corr-option'))option.scrollIntoView=()=>{};
  search.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));lifecycle.push({active:search.getAttribute('aria-activedescendant')});
  search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));lifecycle.push({markers:[...state.selectedCorrelationMarkers],value:search.value,expanded:search.getAttribute('aria-expanded'),focused:document.activeElement?.id});
  document.querySelector<HTMLButtonElement>('.chip-remove')!.click();lifecycle.push({markers:[...state.selectedCorrelationMarkers],focused:document.activeElement?.id});
  search.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 }
 if(advanced){
  let ai=0;const previous=owner.configureCompareCorrelationViews({askAIAboutCorrelations:()=>{ai++;}});
  document.querySelector<HTMLButtonElement>('.corr-ask-ai-btn')!.click();
  lifecycle.push({ai});owner.configureCompareCorrelationViews(previous);
  state.selectedCorrelationMarkers=Array.from({length:8},(_,i)=>'synthetic.'+i);
  document.querySelector<HTMLElement>('.corr-option')!.click();lifecycle.push({markers:[...state.selectedCorrelationMarkers],notice:document.getElementById('corr-selection-status')!.textContent});
  state.selectedCorrelationMarkers=[];state.selectedCorrelationSupplements=['med01'];
  const preset=document.querySelector<HTMLButtonElement>('.corr-preset-btn:not([disabled])');expect(preset).not.toBeNull();preset!.click();
  lifecycle.push({markers:[...state.selectedCorrelationMarkers],treatments:[...state.selectedCorrelationSupplements],hidden:state.correlationView.hidden,pair:state.correlationView.pair,notice:document.getElementById('corr-selection-status')!.textContent});
  await Promise.resolve();
 }
 const result={raw,tree:tree(document.getElementById('main-content')!),markers:[...state.selectedCorrelationMarkers],treatments:[...state.selectedCorrelationSupplements],hidden:[...(state.correlationView.hidden || [])],saves:fixture.saves,loads:fixture.loads,lifecycle};vi.restoreAllMocks();vi.unstubAllGlobals();return result;
}
describe('genuine original and candidate Correlations public assignments',()=>{
 it.each([['empty',[],[],false,false],['marker',['biochemistry.glucose'],[],false,false],['therapy',[],['med01','blank','undated'],false,false],['loading',['biochemistry.glucose'],['med01'],false,false],['failure',['biochemistry.glucose'],['med01'],true,false],['filtered',['missing'],['missing'],false,false],['native lifecycle',[],[],false,true]] as const)('%s',async(name,markers,treatments,failure,interact)=>{const old=before.find(r=>r.name===name)!.original;const current=await capture(candidate,[...markers],[...treatments],failure,interact);records.push({name,original:old,candidate:current});expect(compareGenuineReceipt(current)).toEqual(compareGenuineReceipt(old));});
 it('preserves delegated AI, eight-item rejection and available preset treatment retention',async()=>{const old=before.find(r=>r.name==='advanced-actions')!.original,current=await capture(candidate,[],[],false,false,true);records.push({name:'advanced-actions',original:old,candidate:current});expect(compareGenuineReceipt(current)).toEqual(compareGenuineReceipt(old));});
 it('preserves successful repeated getter/coercion chronology',()=>{
  const receipts:unknown[]=[];
  for(const owner of [candidate]){
   const source=input();configure(source,[],['med01']);const trace:string[]=[];
   function opaque(label:string){return {toString(){trace.push(label+'.string');return '<'+label+'>';}};}
   Object.defineProperty(source.categories.biochemistry!.markers.glucose!,'name',{get(){trace.push('marker.name');return opaque('marker');}});
   Object.defineProperty(source.categories.biochemistry!,'label',{get(){trace.push('category.label');return opaque('category');}});
   Object.defineProperty(state.importedData.supplements[0]!,'name',{get(){trace.push('therapy.name');return opaque('therapy');}});
   Object.defineProperty(state.importedData.supplements[0]!,'startDate',{get(){trace.push('therapy.startDate');return opaque('date');}});
   document.body.innerHTML='<div id="corr-options"></div><div id="corr-chips"></div>';
   owner.populateCorrelationOptions(source);owner.renderCorrelationChips();receipts.push({trace,options:document.getElementById('corr-options')!.innerHTML,chips:document.getElementById('corr-chips')!.innerHTML});vi.unstubAllGlobals();
  }
  expect(compareGenuineReceipt(receipts[0])).toEqual(compareGenuineReceipt(before.find(r=>r.name==='successful-getters')!.original));
 });
 it('preserves repeated opaque getter/coercion and native throw order',()=>{
  const traces:unknown[]=[];for(const owner of [candidate]){const source=input();configure(source,[],[]);const trace:string[]=[];const m=source.categories.biochemistry!.markers.glucose!;Object.defineProperty(m,'name',{get(){trace.push('name');return {toString(){trace.push('coerce');return 'Opaque';}};}});Object.defineProperty(source.categories.biochemistry!,'label',{get(){trace.push('category');throw new RangeError('native-category');}});document.body.innerHTML='<div id="corr-options"></div>';expect(()=>owner.populateCorrelationOptions(source)).toThrowError(new RangeError('native-category'));traces.push(trace);vi.unstubAllGlobals();}expect(traces[0]).toEqual(before.find(r=>r.name==='getter-throw')!.original);expect(traces[0]).toEqual(['name','coerce','category']);
 });
});
