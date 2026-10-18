// @vitest-environment jsdom
import {describe,it,expect,afterEach,vi} from 'vitest';
import {categoryNativeDOM,categoryRawDOM} from './helpers/category-genuine-native-dom.js';
import {compareGenuineReceipt} from './helpers/compare-genuine-native-receipts.js';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import * as current from '../js/compare-correlations.js';
import {state} from '../js/state.js';
import {getActiveData} from '../js/data.js';
import {renderTableColgroup,renderScrollableTableShell} from '../js/category-view-renderers.js';
import {renderCategoryGlyph} from '../js/category-glyphs.js';
import type {CompareData,CompareNumericMarker} from '../types/compare-correlations.js';
const originalMode=state.rangeMode,originalData=state.importedData,originalFirst=state.compareDate1,originalSecond=state.compareDate2;
afterEach(()=>{state.rangeMode=originalMode;state.importedData=originalData;state.compareDate1=originalFirst;state.compareDate2=originalSecond;document.body.replaceChildren();vi.unstubAllGlobals();});
const dependencies={renderTableColgroup,renderScrollableTableShell,renderCategoryGlyph};
current.configureCompareCorrelationViews(dependencies);
function marker(overrides:Partial<CompareNumericMarker> & {contextRangeLabels?:unknown[];optimalRangeSource?:string}={}):CompareNumericMarker {
 return {name:'Glucose',unit:'mmol/l',values:[4,7,0],refMin:3,refMax:8,optimalMin:4.5,optimalMax:5.5,...overrides};
}
function data(m=marker()):CompareData {return {dates:['2026-01-01','2026-02-01','2026-03-01'],dateLabels:['Jan 1','Feb 1','Mar 1'],categories:{biochemistry:{label:'Biochemistry',markers:{glucose:m}}}};}
function tree(html:string) {
 const host=document.createElement('div');host.innerHTML=html;
 function read(node:Node):unknown {
  if(node instanceof Element) return {type:node.nodeType,name:node.nodeName,namespace:node.namespaceURI,attrs:[...node.attributes].map(a=>[a.name,a.value]),children:[...node.childNodes].map(read),
   ...(node instanceof HTMLOptionElement?{selected:node.selected,defaultSelected:node.defaultSelected,disabled:node.disabled,value:node.value}:{}),
   ...(node instanceof HTMLSelectElement?{value:node.value,selectedIndex:node.selectedIndex}:{}),
   ...(node instanceof HTMLButtonElement?{type:node.type,disabled:node.disabled}: {})};
  return {type:node.nodeType,text:node.nodeValue};
 }
 return [...host.childNodes].map(read);
}
const cases:[string,()=>CompareData,string][]=[
 ['reference',()=>data(),'reference'],['both',()=>data(),'both'],['optimal',()=>data(),'optimal'],
 ['missing-first',()=>data(marker({values:[null,7,0]})),'reference'],['missing-second',()=>data(marker({values:[4,null,0]})),'reference'],
 ['both-missing',()=>data(marker({values:[null,null,0]})),'reference'],['zero-baseline',()=>data(marker({values:[0,7,0]})),'reference'],
 ['improved',()=>data(marker({values:[10,8,0],contextRefRanges:[{min:3,max:6},{min:4,max:9}]})),'reference'],
 ['worsened',()=>data(marker({values:[4,10,0]})),'reference'],['unchanged',()=>data(marker({values:[4,4,0]})),'reference'],
 ['open-upper',()=>data(marker({refMin:null,refMax:5})),'reference'],['open-lower',()=>data(marker({refMin:3,refMax:null})),'reference'],
 ['dated-ranges',()=>data(marker({contextRefRanges:[{min:3,max:6},{min:4,max:9}],contextRangeLabels:['Morning assay','Afternoon assay']})),'reference'],
 ['lab-optimal',()=>data(marker({optimalRangeSource:'import'})),'both'],['custom-optimal',()=>data(marker({optimalRangeSource:'manual'})),'both'],
 ['markup-fields',()=>data(marker({name:'<em>gb-compare-marker</em><!--unterminated',unit:'"gb-compare-unit" & <'})),'reference'],
 ['no-categories',()=>({...data(),categories:{}}),'reference'],
 ['single-point-skipped',()=>({...data(),categories:{snp:{label:'Single',singlePoint:true,markers:{one:marker()}}}}),'reference'],
 ['hostile-label',()=>({...data(),dateLabels:['<script>gb-compare-heading1</script>','<!--]-->']}),'both'],
];
const before=JSON.parse(readFileSync(path.join(__dirname,'fixtures/compare-dates-original.json'),'utf8')) as {name:string;html:string;tree:unknown;first?:unknown;second?:unknown}[];
const after:unknown[]=[];
describe('full original Compare Dates public renderer contract',()=>{
 it.each(cases)('%s',(name,input,mode)=>{
  state.rangeMode=mode;const record=before.find(r=>r.name===name);expect(record).toBeDefined();const old=record!.html,candidate=current.renderCompareTable(input(),0,1);
  expect(typeof old).toBe('string');expect(typeof candidate).toBe('string');
  if(typeof old!=='string'||typeof candidate!=='string')throw new Error('Expected public renderer string');
  expect(tree(old)).toEqual(record!.tree);after.push({name,html:candidate,tree:tree(candidate)});
  expect(categoryRawDOM(candidate)).toEqual(categoryRawDOM(old));expect(categoryNativeDOM(tree(candidate))).toEqual(categoryNativeDOM(tree(old)));
 });
 it.each(cases)('%s genuine default path retains the complete native table DOM',(name,input,mode)=>{
  const previous=current.configureCompareCorrelationViews({renderTableColgroup:null,renderScrollableTableShell:null,renderCategoryGlyph:null});
  try {state.rangeMode=mode;const old=before.find(record=>record.name===name)!,actual=current.renderCompareTable(input(),0,1);expect(typeof actual).toBe('string');if(typeof actual!=='string')throw new Error('Genuine synchronous table expected');expect(categoryRawDOM(actual)).toEqual(categoryRawDOM(old.html));}
  finally {current.configureCompareCorrelationViews(previous);}
 });
 it.each([0,1,2,3])('page dates %i preserves defaults and literal raw HTML',(count)=>{
  const source=data();source.dates=source.dates.slice(0,count);source.dateLabels=source.dateLabels.slice(0,count);
  function render(owner:typeof current){document.body.innerHTML='<main id="main-content"></main>';state.compareDate1=null;state.compareDate2=null;state.importedData={...originalData,entries:source.dates.map((date,index)=>({date:String(date),markers:{'biochemistry.glucose':[4,7,0][index]??0}}))};owner.showCompare(source);const html=document.getElementById('main-content')!.innerHTML;return {html,tree:tree(html),first:state.compareDate1,second:state.compareDate2};}
  const old=before.find(r=>r.name==='page-'+count);expect(old).toBeDefined();const candidate=render(current);after.push({name:'page-'+count,...candidate});expect(compareGenuineReceipt({name:'page-'+count,...candidate})).toEqual(compareGenuineReceipt(old));
 });
 it('preserves opaque name/unit getter/coercion and native throw order',()=>{
  const traces:string[][]=[];
  for(const owner of [current]){
   const trace:string[]=[];const m=marker();Object.defineProperty(m,'name',{get(){trace.push('name');return {toString(){trace.push('name.string');return '<b>gb-compare-marker</b>';}};}});
   Object.defineProperty(m,'unit',{get(){trace.push('unit');throw new RangeError('native-unit');}});
   expect(()=>owner.renderCompareTable(data(m),0,1)).toThrowError(new RangeError('native-unit'));traces.push(trace);
  }
  expect(traces).toHaveLength(1);expect(traces[0]).toEqual(['name','name.string','unit']);
 });
 it('keeps date selection/swap/update on real delegated native controls',()=>{
  // Use one fresh native document with one eagerly installed module owner.
  // The archived original capture is immutable data, not a second runtime renderer.
  vi.stubGlobal('document',document.implementation.createHTMLDocument('Compare Dates native controls'));
  const source=data();state.importedData={...originalData,entries:source.dates.map((date,index)=>({date:String(date),markers:{'biochemistry.glucose':[4,7,0][index]??0}}))};document.body.innerHTML='<main id="main-content"></main>';state.compareDate1=null;state.compareDate2=null;
  current.installCompareCorrelationDelegates(document);current.showCompare(source);
  const first=document.querySelector<HTMLSelectElement>('#compare-select-1')!,second=document.querySelector<HTMLSelectElement>('#compare-select-2')!;
  expect(first.value).toBe(source.dates[0]);expect(second.value).toBe(source.dates[2]);
  first.value='2026-02-01';first.dispatchEvent(new Event('change',{bubbles:true}));expect(state.compareDate1).toBe('2026-02-01');
  document.querySelector<HTMLButtonElement>('.compare-swap-btn')!.click();expect(state.compareDate1).toBe('2026-03-01');expect(state.compareDate2).toBe('2026-02-01');
  current.setCompareDate2('invalid');expect(document.getElementById('compare-results')!.innerHTML).toBe('');expect(getActiveData()).toBeDefined();
 });
 it('matches all 23 immutable complete original raw and parsed-tree receipts',()=>{
  expect(compareGenuineReceipt(after)).toEqual(compareGenuineReceipt(before));expect(before).toHaveLength(23);
 });
});
