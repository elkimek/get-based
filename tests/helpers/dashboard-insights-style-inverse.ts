import {compilePriorDashboardDataStyles as compileDashboardLabMarkerDataStyles,dashboardLabMarkerDataOwnership} from './dashboard-native-style-inverse.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import {compileDashboardInsightsStyles,dashboardInsightsOwnership} from '../../scripts/dashboard-insights-style-ownership.mjs';
import {dashboardBiometricOwnership} from '../../scripts/dashboard-biometric-style-ownership.mjs';
const records=JSON.parse(readFileSync(path.join(import.meta.dirname,'../fixtures/dashboard-insights-style-bodies.json'),'utf8')) as {edits:{selector:string;before:string;after:string}[]};
/** Restore only nine exact root-selector bodies; every foreign byte is retained. */
export function restoreDashboardInsightsBodies(css:string):string {
 const edits:{start:number;end:number;nativeBody:string}[]=[];
 for(const record of records.edits){
  const found:postcss.Rule[]=[];postcss.parse(css).walkRules(rule=>{if(rule.selector===record.selector)found.push(rule);});
  assert.equal(found.length,1,'Exact single Insights receiver required');const rule=found[0]!;
  assert.equal(rule.parent?.type,'root','Exclusive Insights ancestry must remain exact');
  const start=rule.source?.start?.offset,end=rule.source?.end?.offset;assert.equal(typeof start,'number');assert.equal(typeof end,'number');
  const open=start!+rule.selector.length+(rule.raws.between||'').length;assert.equal(css[open],'{');assert.equal(css[end!-1],'}');
  assert.equal(css.slice(open+1,end!-1),record.before,'Exact Insights declaration order/value/priority/raw whitespace required');
  edits.push({start:open+1,end:end!-1,nativeBody:record.after});
 }
 assert.equal(edits.length,9);let restored=css;
 for(const edit of edits.sort((a,b)=>b.start-a.start))restored=restored.slice(0,edit.start)+edit.nativeBody+restored.slice(edit.end);
 return restored;
}
/** Qualify all current185 receivers before the immutable159/150 legacy contracts. */
export async function compileLegacyDashboardDataStyles(...args:Parameters<typeof compileDashboardInsightsStyles>){
 const compiled=await compileDashboardLabMarkerDataStyles(...args);
 const priorSource=readFileSync(path.join(import.meta.dirname,'../fixtures/dashboard-lab-markers-original-dashboard-data.base.css'),'utf8');
 const prior=await compileDashboardInsightsStyles(priorSource,args[1],args[2]);
 assert.equal(dashboardInsightsOwnership.receivers.length,159);assert.equal(dashboardInsightsOwnership.declarationCount,576);
 assert.equal(dashboardLabMarkerDataOwnership.receivers.length,185);assert.equal(dashboardLabMarkerDataOwnership.declarationCount,693);
 assert.deepEqual(dashboardInsightsOwnership.receivers.slice(0,150),dashboardBiometricOwnership.receivers);
 assert.deepEqual(dashboardLabMarkerDataOwnership.receivers.slice(0,159),dashboardInsightsOwnership.receivers);
 assert.equal(compiled.receivers.length,185);assert.equal(prior.receivers.length,159);
 assert.deepEqual(compiled.receivers.map(row=>[row.utility,row.selector,row.condition]),dashboardLabMarkerDataOwnership.receivers);
 const scope=JSON.parse(readFileSync(path.join(import.meta.dirname,'../fixtures/dashboard-lab-markers-style-scope.json'),'utf8'))as {rows:{file:string;selected:{selector:string;media:string|null}[]}[]};
 const selected=scope.rows.find(row=>row.file==='css/dashboard-data.base.css')!.selected;
 assert.deepEqual(dashboardLabMarkerDataOwnership.receivers.slice(159).map(([,selector,media])=>({selector,media})),selected);
 function bodies(css:string){
  const rows:{selector:string;media:string|null;start:number;end:number;body:string}[]=[];
  postcss.parse(css).walkRules(rule=>{
   const start=rule.source!.start!.offset+rule.selector.length+(rule.raws.between||'').length+1,end=rule.source!.end!.offset-1;
   assert.equal(css[start-1],'{');assert.equal(css[end],'}');
   assert.ok(rule.parent?.type==='root'||rule.parent?.type==='atrule'&&rule.parent.name==='media');
   rows.push({selector:rule.selector,media:rule.parent?.type==='atrule'?rule.parent.params:null,start,end,body:css.slice(start,end)});
  });return rows;
 }
 // Body inverses qualify whitespace only: compare EVERY original semantic node
 // before applying them, so a changed Lab/Quick value cannot be hidden.
 function primitives(css:string){const rows:unknown[]=[];postcss.parse(css).walk(node=>{
  if(node.type==='rule')rows.push(['rule',node.selector]);
  else if(node.type==='decl')rows.push(['decl',node.prop,node.value,node.important===true]);
  else if(node.type==='atrule')rows.push(['at',node.name,node.params]);
  else if(node.type==='comment')rows.push(['comment',node.text]);
 });return rows;}
 assert.deepEqual(primitives(compiled.css),primitives(prior.css),'Whole original ordered CSS values/priorities/media/selector/comment parity BEFORE inverses');
 const previous=bodies(prior.css),current=bodies(compiled.css),edits=selected.map(({selector,media})=>{
  const old=previous.filter(row=>row.selector===selector&&row.media===media),next=current.filter(row=>row.selector===selector&&row.media===media);
  assert.equal(old.length,1);assert.equal(next.length,1);return {...next[0]!,nativeBody:old[0]!.body};
 });
 assert.equal(edits.length,26);let restored=compiled.css;
 for(const edit of edits.sort((a,b)=>b.start-a.start)){
  assert.equal(restored.slice(edit.start,edit.end),edit.body);restored=restored.slice(0,edit.start)+edit.nativeBody+restored.slice(edit.end);
 }
 assert.equal(restored,prior.css,'Whole foreign bytes and all26 exact Lab/Quick body inverses');
 return {...compiled,css:restoreDashboardInsightsBodies(restored),receivers:compiled.receivers.slice(0,150)};
}
