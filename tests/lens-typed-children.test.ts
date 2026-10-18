// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it} from 'vitest';
import fs from 'node:fs';
import {configureLensPageShell,renderLensHeader,renderLensWidget,renderLensPageWidgets} from '../js/lens-page-shell.js';
import type {LensWidgetContent} from '../js/lens-widget-content.js';
import {lensWidgetHasContent} from '../js/lens-widget-content.js';
import {evaluateLegacyLensShell} from './helpers/lens-shell-legacy.js';
import {renderHTML as genomeHTML} from '../js/components/DashboardGenomeWidget.svelte.html.js';
import {renderHTML as trendsHTML} from '../js/components/DashboardKeyTrends.svelte.html.js';
import {renderHTML as contentHTML} from '../js/components/LensPageContent.svelte.html.js';
import {renderHTML as rangeHTML} from '../js/components/LabDateRange.svelte.html.js';
import {projectLensActions} from '../js/lens-content-presentation.js';
import {projectLabDateRange} from '../js/lab-date-range-presentation.js';
import {state} from '../js/state.js';
import {profileStorageKey} from '../js/profile.js';
const legacy=await evaluateLegacyLensShell();
const legacyRawHashes=new Set<string>();
function rawHash(value:string):string{let hash=5381,index=value.length;while(index--)hash=((hash<<5)-hash)^value.charCodeAt(index);return (hash>>>0).toString(36);}
function originalLeaf(value:string):string{legacyRawHashes.add(rawHash(value));return value;}
interface Tree {name:string;attrs:readonly [string,string][];children:readonly (Tree|string)[];defaults?:readonly unknown[]}
function receipt(html:string):readonly (Tree|string)[]{
 const template=document.createElement('template');template.innerHTML=html;
 function children(node:Node):Array<Tree|string>{const result:Array<Tree|string>=[];
  for(const child of node.childNodes){
   if(child.nodeType===Node.COMMENT_NODE){expect(['','[',']','[-1',...Array.from({length:16},(_,i)=>'['+i),...legacyRawHashes]).toContain(child.nodeValue);continue;}
   if(child.nodeType===Node.TEXT_NODE){if(!child.nodeValue)continue;const last=result.at(-1);if(typeof last==='string')result[result.length-1]=last+child.nodeValue;else result.push(child.nodeValue);continue;}
   expect(child).toBeInstanceOf(Element);const element=child as Element;
   const value:Tree={name:element.nodeName,attrs:[...element.attributes].map(a=>[a.name,a.value]),children:children(element)};
   if(element instanceof HTMLButtonElement)value.defaults=[element.type,element.disabled,element.value];
   if(element instanceof HTMLInputElement)value.defaults=[element.type,element.checked,element.defaultChecked,element.value,element.defaultValue];
   result.push(value);
  }return result;
 }return children(template.content);
}
const sources={kind:'body-sources',view:{empty:true,sources:[]}} satisfies LensWidgetContent;
const genome={kind:'genome',view:{kind:'empty',contributionHref:null}} satisfies LensWidgetContent;
const trends={kind:'key-trends',view:{rows:[]}} satisfies LensWidgetContent;
let restore:ReturnType<typeof configureLensPageShell>;
beforeEach(()=>{localStorage.clear();legacyRawHashes.clear();state.currentProfile='typed-lens';restore=configureLensPageShell({getAvailableDashboardFixedWidgetIds:()=>['native'],getDashboardWidgetPrefs:()=>({hidden:[]})});legacy.configureLensPageShell({getAvailableDashboardFixedWidgetIds:()=>['native'],getDashboardWidgetPrefs:()=>({hidden:[]})});});
afterEach(()=>{configureLensPageShell(restore);localStorage.clear();});
for(const [name,body,original]of [['body-sources',sources,()=>contentHTML({kind:'body-sources',view:sources.view})],['genome',genome,()=>genomeHTML({view:genome.view})],['key-trends',trends,()=>trendsHTML({view:trends.view})]]as const){
 for(const size of ['full','half','quarter','third','two-third'])it(`preserves complete native ${name}/${size} chrome and child`,()=>{
  const options={pageRoute:'body',pageIndex:1,pageCount:3};
  expect(receipt(renderLensWidget('native','Title <literal>','Description & copy',body,size,options)))
   .toEqual(receipt(legacy.renderLensWidget('native','Title <literal>','Description & copy',originalLeaf(original()),size,options)));
 });
}
it('preserves typed header actions and native control defaults',()=>{
 const actions=projectLensActions('insight');
 expect(receipt(renderLensHeader('Insight','',{kind:'actions',view:actions})))
  .toEqual(receipt(legacy.renderLensHeader('Insight','',originalLeaf(contentHTML({kind:'actions',view:actions})))));
 const range=projectLabDateRange('all');
 expect(receipt(renderLensHeader('Labs','',{kind:'date-range',view:range})))
  .toEqual(receipt(legacy.renderLensHeader('Labs','',originalLeaf(rangeHTML({view:range})))));
});
it('preserves grid stored ordering, tools, selectors and native delegated actions',()=>{
 const prefs={hidden:[]as string[]};const calls:unknown[][]=[];
 const deps={getAvailableDashboardFixedWidgetIds:()=>['native','genome'],getDashboardWidgetPrefs:()=>prefs,navigate:(route:string)=>calls.push(['navigate',route]),removeDashboardWidgetFromLens:(id:string)=>calls.push(['remove',id])};
 configureLensPageShell(deps);legacy.configureLensPageShell(deps);state.currentView='body';
 const key=profileStorageKey('typed-lens','lensPageOrder-body-group-v1');localStorage.setItem(key,JSON.stringify(['genome','native']));
 const widgets=[{id:'native',title:'Sources',body:sources},{id:'genome',title:'Genome',body:genome}];
 const before=[{...widgets[0],body:originalLeaf(contentHTML({kind:'body-sources',view:sources.view}))},{...widgets[1],body:originalLeaf(genomeHTML({view:genome.view}))}];
 const html=renderLensPageWidgets('body',widgets,{group:'group'});
 expect(receipt(html)).toEqual(receipt(legacy.renderLensPageWidgets('body',before,{group:'group'})));
 const host=document.createElement('div');host.innerHTML=html;document.body.append(host);
 try{expect([...host.querySelectorAll('[data-widget-id]')].map(e=>e.getAttribute('data-widget-id'))).toEqual(['genome','native']);
  (host.querySelector('[data-lens-page-action="remove-dashboard-widget"]')as HTMLButtonElement).click();expect(calls).toContainEqual(['remove','genome']);
  (host.querySelector('[data-lens-page-action="move-widget"][data-lens-page-direction="1"]')as HTMLButtonElement).click();expect(JSON.parse(localStorage.getItem(key)!)).toEqual(['native','genome']);expect(calls.at(-1)).toEqual(['navigate','body']);
 }finally{host.remove();}
});
it('retains public arities and rejects ordinary HTML rather than creating a generic trust brand',()=>{
 expect(renderLensHeader.length).toBe(2);expect(renderLensWidget.length).toBe(4);expect(renderLensPageWidgets.length).toBe(2);
 for(const raw of ['<div>ordinary</div>',{html:'ordinary'},{kind:'trusted',view:'ordinary'},{kind:'html',view:'ordinary'}]){
  expect(()=>renderLensWidget('native','Title','',raw)).toThrow('typed owner view');expect(()=>renderLensHeader('Title','',raw)).toThrow('typed owner view');
 }
 expect(()=>receipt('<div><!--foreign--></div>')).toThrow();
 expect(lensWidgetHasContent(null)).toBe(false);expect(lensWidgetHasContent({kind:'nutrition',view:null})).toBe(false);expect(lensWidgetHasContent({kind:'quick-markers',view:{kind:'quick-markers',rows:[]}})).toBe(false);
});
it('has one genuine dispatcher and no ordinary HTML/private coordinate or tools insertion protocol',()=>{
 for(const name of ['js/lens-shell-presentation.ts','js/lens-page-shell.ts','js/lens-page-shell-core.ts','js/components/LensPageHeader.svelte','js/components/LensPageWidget.svelte','js/components/LensWidgetBody.svelte','js/components/LensDataWidgetBody.svelte'])expect(fs.readFileSync(name,'utf8')).not.toMatch(/actionsHTML|bodyHTML|score-tools|\{@html|\.replace\(/);
 expect(fs.readFileSync('js/components/LensDataPage.svelte','utf8')).toContain('<LensDataWidgetBody');
 expect(fs.readFileSync('js/components/FocusCardBody.svelte','utf8')).toContain('{@html current.markdown}');
});
