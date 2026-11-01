// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {renderSyncPopoverView,renderSyncIndicatorView,type SyncPopoverView} from '../js/sync-status-rendering.js';
interface LegacyView extends Omit<SyncPopoverView,'relay'|'error'|'events'> {
 relayHTML:string|null;error:{typeHTML:string;age:string}|null;
 events:{color:string;kindHTML:string;age:string;textHTML:string}[];
}
interface Row {original:{name:string;rawAssignedHTML:string|null};capturedViewWitness:LegacyView|null}
const fixture=JSON.parse(readFileSync('tests/fixtures/sync-status-original.json','utf8')) as {popovers:Row[];indicators:{original:{name:string;html:string|null}}[]};
const decode=(html:string):string=>{const element=document.createElement('textarea');element.innerHTML=html;return element.value;};
function view(old:LegacyView):SyncPopoverView {
 return {relayDot:old.relayDot,relayLabel:old.relayLabel,relay:old.relayHTML===null?null:decode(old.relayHTML),push:old.push,pullLabel:old.pullLabel,quota:old.quota,
  error:old.error?{type:decode(old.error.typeHTML),age:old.error.age}:null,
  events:old.events.map(event=>({color:event.color,kind:event.kindHTML,age:event.age,text:decode(event.textHTML)})),stuckPush:old.stuckPush,debugControls:old.debugControls};
}
const markers=new Set(['','[',']','[0','[-1']);
function tree(node:Node):unknown {
 if(node.nodeType===8)return markers.has(node.nodeValue||'')?null:{unexpectedComment:node.nodeValue};
 if(node.nodeType===3)return node.nodeValue;
 const e=node as Element,children:unknown[]=[];
 for(const child of e.childNodes){const value=tree(child);if(value===null)continue;if(typeof value==='string'&&typeof children.at(-1)==='string')children[children.length-1]=(children.at(-1) as string)+value;else children.push(value);}
 return {tag:e.tagName,namespace:e.namespaceURI,attributes:[...e.attributes].map(a=>[a.name,a.value]),children,
  defaults:e.tagName==='BUTTON'?{type:(e as HTMLButtonElement).type,disabled:(e as HTMLButtonElement).disabled}:null};
}
function dom(html:string):unknown {
 const host=document.createElement('div');host.innerHTML=html;const children:unknown[]=[];
 for(const child of host.childNodes){const value=tree(child);if(value===null)continue;if(typeof value==='string'&&typeof children.at(-1)==='string')children[children.length-1]=(children.at(-1) as string)+value;else children.push(value);}
 return children;
}
const rows=fixture.popovers.filter((row):row is Row&{capturedViewWitness:LegacyView}=>row.capturedViewWitness!==null);
it.each(rows.filter(row=>!row.original.name.startsWith('raw-kind-')))('retains complete native Sync DOM/styles/actions/defaults/whitespace: $original.name',row=>{
 expect(dom(renderSyncPopoverView(view(row.capturedViewWitness)))).toEqual(dom(row.original.rawAssignedHTML!));
});
it.each(rows.filter(row=>row.original.name.startsWith('raw-kind-')))('retains hostile event labels as literal text with all actions intact: $original.name',row=>{
 const model=view(row.capturedViewWitness),host=document.createElement('div');host.innerHTML=renderSyncPopoverView(model);
 expect([...host.querySelectorAll('div[style="margin-bottom:3px"] > span:first-child')].map(node=>node.textContent)).toEqual(model.events.map(event=>event.kind));
 expect(host.querySelectorAll('[data-sync-ui-action="sync-now"]')).toHaveLength(1);expect(host.querySelectorAll('[data-sync-ui-action="open-settings"]')).toHaveLength(1);
 expect(host.querySelectorAll('script,textarea,style,[data-probe]')).toHaveLength(0);
});
it('retains native indicator title, action and button defaults',()=>{
 for(const state of ['disabled','error','offline','syncing','synced'] as const){
  const row=fixture.indicators.find(row=>row.original.name===state);if(!row?.original.html)continue;
  const native=document.createElement('div');native.innerHTML=row.original.html;const title=native.querySelector('button')?.getAttribute('title')||'';
  expect(dom(renderSyncIndicatorView({state,title}))).toEqual(dom(row.original.html));
 }
});
it('shows temporary-storage guidance as literal status text with an explicit reload action',()=>{
 const model=view(rows[0]!.capturedViewWitness);
 model.stuckPush=false;model.reloadRequired=true;model.notice='Temporary Sync storage <img data-probe src=x> & keep this tab open.';
 const host=document.createElement('div');host.innerHTML=renderSyncPopoverView(model);
 expect(host.querySelector('[role="status"]')?.textContent?.trim()).toBe(model.notice);
 expect(host.querySelectorAll('[data-sync-ui-action="reload"]')).toHaveLength(1);
 expect(host.querySelectorAll('img,[data-probe]')).toHaveLength(0);
});
it('preserves native comparisons that expose every altered style, action, default, node and comment',()=>{
 const model=view(rows.find(row=>row.original.name==='debug-events')!.capturedViewWitness),html=renderSyncPopoverView(model),baseline=dom(html);
 for(const changed of [html.replace('data-sync-ui-action="sync-now"','data-sync-ui-action="wrong"'),html.replace('font-size:12px','font-size:99px'),html.replace('<button','<button disabled'),html.replace('Recent activity','Wrong label'),html.replace('<button','<!--foreign--><button'),html+'<i>Extra</i>']){
  expect(changed).not.toBe(html);expect(dom(changed)).not.toEqual(baseline);
 }
});
it('has no raw HTML or private compiler-coordinate path',()=>{
 expect(readFileSync('js/components/SyncPopoverPresentation.svelte','utf8')).not.toContain('{@html');
 expect(readFileSync('js/sync-status-rendering.ts','utf8')).not.toMatch(/compilerHash|kind-slot|matchAll|skeleton/);
});
