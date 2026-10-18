import assert from 'node:assert/strict';
export interface CompareRangeLine {label:string;bounds:string;used:boolean;badge:string}
export interface CompareRangeGroup {date:string|null;lines:CompareRangeLine[]}
export interface CompareRowReceipt {name:string;unit:string;values:string[];statuses:string[];direction:string[];ranges:CompareRangeGroup[]}
export interface CompareObservation {first:string;second:string;mode:string;headers:string[];rows:CompareRowReceipt[];dateOptions:string[][];preference:string|null;view:string;unitSystem:string;unitsPreference:string|null}
/** Compare and range display controls must never mutate the complete native profile receipt. */
export function verifyCompareProfile(before:unknown,after:unknown){assert.deepEqual(after,before,'Every live/IDB/raw/registry/active profile field remains exact');}
/** Finite fixture oracle checks date/range/status/delta rows together, not isolated substrings. */
export function verifyCompareObservation(actual:CompareObservation,expected:CompareObservation){assert.deepEqual(actual,expected,'Complete selected dates, native ranges/status/delta and persisted display preference');}
const dates=['2024-01-01','2024-04-01','2024-07-01'] as const,labels=['Jan 2024','Apr 2024','Jul 2024'] as const;
const pairs={
 '0:2':{g:['4.50','5','+0.500','+11.1%'],gs:['normal','normal'],gd:'neutral',c:['800','200','-600','-75.0%'],cs:['high','normal'],cd:'improved'},
 '1:2':{g:['6.20','5','-1.20','-19.4%'],gs:['high','normal'],gd:'improved',c:['300','200','-100','-33.3%'],cs:['normal','normal'],cd:'neutral'},
 '1:0':{g:['6.20','4.50','-1.70','-27.4%'],gs:['high','normal'],gd:'improved',c:['300','800','+500','+166.7%'],cs:['normal','high'],cd:'worsened'},
 '0:1':{g:['4.50','6.20','+1.70','+37.8%'],gs:['normal','high'],gd:'worsened',c:['800','300','-500','-62.5%'],cs:['high','normal'],cd:'improved'},
} as const;
export function expectedCompare(first:0|1,second:0|1|2,mode:'reference'|'optimal'|'both'):CompareObservation{
 const key=(first+':'+second) as keyof typeof pairs;assert(Object.hasOwn(pairs,key),'Finite authored fixture date pair');const p=pairs[key];
 const gl:CompareRangeLine[]=mode==='both'?[{label:'Reference',bounds:'4.11 – 5.60',used:false,badge:''},{label:'Optimal',bounds:'4 – 5',used:true,badge:'used'}]:[{label:mode==='reference'?'Reference':'Optimal',bounds:mode==='reference'?'4.11 – 5.60':'4 – 5',used:true,badge:''}];
 const cortisol=(index:number):CompareRangeLine=>({label:index===1?'Afternoon assay range':'Morning assay range',bounds:index===1?'55.2 – 386':'193 – 690',used:true,badge:''});
 const cr:CompareRangeGroup[]=first===1||second===1?[{date:labels[first],lines:[cortisol(first)]},{date:labels[second],lines:[cortisol(second)]}]:[{date:null,lines:[cortisol(first)]}];
 return {first:dates[first],second:dates[second],mode,headers:['Biomarker','Unit','Ranges',labels[first],labels[second],'Delta','% Change','Biomarker','Unit','Ranges',labels[first],labels[second],'Delta','% Change'],rows:[{name:'Glucose',unit:'mmol/l',values:[...p.g],statuses:p.gs.map(s=>'value-cell val-'+s),direction:['compare-'+p.gd,'compare-'+p.gd],ranges:[{date:null,lines:gl}]},{name:'Cortisol',unit:'nmol/l',values:[...p.c],statuses:p.cs.map(s=>'value-cell val-'+s),direction:['compare-'+p.cd,'compare-'+p.cd],ranges:cr}],dateOptions:[[...dates],[...dates]],preference:mode,view:'compare',unitSystem:'EU',unitsPreference:'EU'};
}
