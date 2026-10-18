import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import {compilePriorDashboardDataStyles,dashboardLabMarkerDataOwnership} from './dashboard-native-style-inverse.js';
import {compileDashboardInsightsStyles,dashboardInsightsOwnership} from '../../scripts/dashboard-insights-style-ownership.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const currentSource=readFileSync(path.join(root,'css/dashboard-data.base.css'),'utf8');
const originalSource=readFileSync(path.join(root,'tests/fixtures/dashboard-lab-markers-original-dashboard-data.base.css'),'utf8');
const scope=JSON.parse(readFileSync(path.join(root,'tests/fixtures/dashboard-lab-markers-style-scope.json'),'utf8')) as {rows:{file:string;selected:{selector:string;media:string|null}[]}[]};
const selected=scope.rows.find(row=>row.file==='css/dashboard-data.base.css')!.selected;
function primitives(css:string){
 const rows:unknown[]=[];
 postcss.parse(css).walk(node=>{
  if(node.type==='rule')rows.push(['rule',node.selector]);
  else if(node.type==='decl')rows.push(['decl',node.prop,node.value,node.important===true]);
  else if(node.type==='atrule')rows.push(['at',node.name,node.params]);
  else if(node.type==='comment')rows.push(['comment',node.text]);
 });
 return rows;
}
function bodies(css:string){
 const rows:{selector:string;media:string|null;start:number;end:number;body:string}[]=[];
 postcss.parse(css).walkRules(rule=>{
  assert.ok(rule.parent?.type==='root'||rule.parent?.type==='atrule'&&rule.parent.name==='media');
  const start=rule.source!.start!.offset!+rule.selector.length+(rule.raws.between||'').length+1,end=rule.source!.end!.offset!-1;
  assert.equal(css[start-1],'{');assert.equal(css[end],'}');
  rows.push({selector:rule.selector,media:rule.parent.type==='atrule'?rule.parent.params:null,start,end,body:css.slice(start,end)});
 });
 return rows;
}
/** Run the current complete owner first, then retain the original 159-owner
 * Insights contract through exactly 26 independently validated Lab body inverses.
 * Caller-appended foreign CSS is checked byte-for-byte on both compiler paths. */
export async function compileCurrentDashboardInsightsStyles(...args:Parameters<typeof compileDashboardInsightsStyles>){
 const compiled=await compilePriorDashboardDataStyles(...args);
 assert.ok(args[0].startsWith(currentSource),'Only the exact current stylesheet plus literal caller-appended foreign CSS');
 const suffix=args[0].slice(currentSource.length);
 const prior=await compileDashboardInsightsStyles(originalSource+suffix,args[1],args[2]);
 assert.equal(compiled.receivers.length,185);assert.equal(prior.receivers.length,159);
 assert.equal(dashboardInsightsOwnership.declarationCount,576);
 assert.equal(dashboardLabMarkerDataOwnership.declarationCount,693);
 assert.deepEqual(dashboardLabMarkerDataOwnership.receivers.slice(0,159),dashboardInsightsOwnership.receivers);
 assert.deepEqual(dashboardLabMarkerDataOwnership.receivers.slice(159).map(([,selector,media])=>({selector,media})),selected);
 assert.equal(selected.length,26);
 assert.deepEqual(primitives(compiled.css),primitives(prior.css),'Complete ordered semantic parity before any body inverse');
 const previous=bodies(prior.css),current=bodies(compiled.css),edits=selected.map(({selector,media})=>{
  const old=previous.filter(row=>row.selector===selector&&row.media===media),next=current.filter(row=>row.selector===selector&&row.media===media);
  assert.equal(old.length,1);assert.equal(next.length,1);return {...next[0]!,nativeBody:old[0]!.body};
 });
 let restored=compiled.css;
 for(const edit of edits.sort((a,b)=>b.start-a.start)){
  assert.equal(restored.slice(edit.start,edit.end),edit.body);
  restored=restored.slice(0,edit.start)+edit.nativeBody+restored.slice(edit.end);
 }
 assert.equal(restored,prior.css,'All foreign bytes and exactly 26 qualified Lab body inverses');
 return {...prior,css:restored};
}
