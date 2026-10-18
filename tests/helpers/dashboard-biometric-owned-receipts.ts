import {expect} from 'vitest';
import {expectedSvelteText as textHTML,expectedSvelteAttribute as attributeHTML,expectedOwnedFactoryKeys} from './dashboard-loading-insights-owned-receipts.js';
import type {DashboardBiometricTileView,DashboardBiometricsOverviewView} from '../../types/dashboard-biometric-views.js';
interface NodeValue {tag?:string;namespace?:string|null;attributes?:string[][];children?:NodeValue[];type?:number;text?:string|null}
const find=(root:NodeValue,match:(node:NodeValue)=>boolean):NodeValue|undefined=>match(root)?root:root.children?.map(node=>find(node,match)).find(Boolean);
const attr=(node:NodeValue,key:string):string|null=>node.attributes?.find(([name])=>name===key)?.[1]??null;
const classes=(node:NodeValue)=>(attr(node,'class')??'').split(' ');
const text=(node:NodeValue):string=>node.type===3?node.text??'':(node.children??[]).map(text).join('');
const requireNode=(root:NodeValue,cls:string):NodeValue=>{const node=find(root,node=>classes(node).includes(cls));expect(node).toBeDefined();return node!;};
const comment=(text:string):NodeValue=>({type:8,text}),whitespace=(text:string):NodeValue=>({type:3,text});
/** Add only source-qualified SDK boundaries; all original elements/attributes/text and row order stay exact. */
export function expectedOwnedBiometricDOM(input:NodeValue):NodeValue {
 const root=structuredClone(input);expect(root.tag).toBe('DIV');expect(root.children).toHaveLength(2);
 const bar=root.children![0]!,body=root.children![1]!;expect(attr(bar,'class')).toBe('db-biometric-overview-bar');
 const actions=requireNode(bar,'db-biometric-overview-actions'),old=actions.children!;
 const sync=old.find(node=>classes(node).includes('db-biometric-sync-status'));
 const picker=old.find(node=>attr(node,'data-dashboard-widget-action')==='open-biometric-picker');expect(picker).toBeDefined();
 if(!sync){expect(old).toEqual([whitespace('\n        \n        '),picker,whitespace('\n      ')]);actions.children=[whitespace('\n        '),comment('[-1'),comment(']'),comment(''),whitespace('\n        '),picker!,whitespace('\n      ')];}
 else {const stale=classes(sync).includes('is-stale'),button=old.find(node=>attr(node,'data-dashboard-widget-action')==='sync-biometric-now');expect(!!button).toBe(stale);
  const native=stale?[whitespace('\n        '),sync,whitespace('\n      '),button,whitespace('\n        '),picker,whitespace('\n      ')]:[whitespace('\n        '),sync,whitespace('\n      \n        '),picker,whitespace('\n      ')];expect(old).toEqual(native);
  actions.children=[whitespace('\n        '),comment('[0'),sync,whitespace('\n      '),comment(stale?'[0':'[-1'),...(button?[button]:[]),comment(']'),comment(']'),comment(''),whitespace('\n        '),picker!,whitespace('\n      ')];
 }
 const grid=classes(body).includes('db-biometric-overview-grid');
 if(grid){expect(attr(body,'class')).toBe('db-wearable-grid db-biometric-overview-grid');expect(body.children!.length).toBeGreaterThan(0);body.children=[comment('['),...body.children!.flatMap(wrap=>{expect(attr(wrap,'class')).toBe('db-biometric-tile-wrap');expect(wrap.tag).toBe('DIV');return [comment(find(wrap,n=>classes(n).includes('db-biometric-manual-empty'))?'[0':'[-1'),wrap,comment(']')];}),comment(']')];}
 else {expect(attr(body,'class')).toBe('dashboard-widget-empty');expect(body.children).toEqual([{type:3,text:'No biometrics selected.'}]);}
 root.children=[comment('['),bar,comment(grid?'[0':'[-1'),body,comment(']'),comment(']')];return root;
}
function expectedView(root:NodeValue):DashboardBiometricsOverviewView {
 const bar=requireNode(root,'db-biometric-overview-bar'),counter=bar.children?.find(node=>node.tag==='SPAN');expect(counter).toBeDefined();const match=/^(\d+) metric(s?) selected$/.exec(text(counter!));expect(match).not.toBe(null);
 const sync=find(bar,node=>classes(node).includes('db-biometric-sync-status'));
 const grid=find(root,node=>classes(node).includes('db-biometric-overview-grid'));
 const rows:DashboardBiometricTileView[]=[];
 for(const wrap of grid?.children??[]){expect(wrap.tag).toBe('DIV');expect(attr(wrap,'class')).toBe('db-biometric-tile-wrap');const remove=requireNode(wrap,'db-biometric-remove');expect(attr(remove,'data-dashboard-widget-action')).toBe('remove-biometric-metric');const removeLabel=attr(remove,'aria-label')!;expect(removeLabel.startsWith('Remove ')).toBe(true);expect(removeLabel.endsWith(' from Biometrics Overview')).toBe(true);const removal={id:attr(remove,'data-dashboard-widget-id'),label:removeLabel.slice(7,-25)};
  const empty=find(wrap,node=>classes(node).includes('db-biometric-manual-empty'));
  if(empty){expect(attr(empty,'data-dashboard-widget-action')).toBe('open-biometric-manual-log');const accessible=attr(empty,'aria-label')!;expect(accessible.startsWith('Log ')).toBe(true);expect(accessible.endsWith(' manually')).toBe(true);rows.push({kind:'manual-empty',remove:removal,id:attr(empty,'data-dashboard-widget-id'),metricId:attr(empty,'data-empty-metric')!,label:text(requireNode(empty,'wearable-metric-name')),accessibleLabel:accessible.slice(4,-9)});}
  else {const tile=requireNode(wrap,'db-biometric-widget');expect(attr(tile,'data-dashboard-widget-action')).toBe('open-biometric-detail');const strong=find(tile,n=>n.tag==='STRONG'),small=find(tile,n=>n.tag==='SMALL'),em=find(tile,n=>n.tag==='EM');expect(strong&&small&&em).toBeDefined();rows.push({kind:'populated',remove:removal,id:attr(tile,'data-dashboard-widget-id'),accessibleLabel:attr(tile,'aria-label')!,label:text(requireNode(tile,'db-wearable-label')),value:text(strong!),unit:text(small!),change:text(em!)});}
 }
 expect(rows).toHaveLength(Number(match![1]));
 return {kind:'wearables',count:match![1]!,pluralSuffix:match![2]!,sync:sync?{stale:classes(sync).includes('is-stale'),label:text(sync)}:null,rows};
}
function actionIdHTML(id:string|null):string {return id===null?'':' data-dashboard-widget-id="'+attributeHTML(id)+'"';}
function removeHTML(row:DashboardBiometricTileView):string {return '<button type="button" class="db-biometric-remove" data-dashboard-widget-action="remove-biometric-metric"'+actionIdHTML(row.remove.id)+' aria-label="Remove '+attributeHTML(row.remove.label)+' from Biometrics Overview" title="Remove metric">×</button>';}
function tileHTML(row:DashboardBiometricTileView):string {
 if(row.kind==='manual-empty')return '<!--[0--><div class="db-biometric-tile-wrap">\n        <div class="wearable-card wearable-card-empty db-biometric-manual-empty" data-empty-metric="'+attributeHTML(row.metricId)+'" data-dashboard-widget-action="open-biometric-manual-log"'+actionIdHTML(row.id)+' role="button" tabindex="0" aria-label="Log '+attributeHTML(row.accessibleLabel)+' manually">\n          <div class="wearable-card-top"><span class="wearable-metric-name">'+textHTML(row.label)+'</span></div>\n          <div class="wearable-value-row wearable-value-row-empty"><span class="wearable-value wearable-value-dash">-</span></div>\n          <div class="wearable-card-bottom"><div class="wearable-empty-cta">+ Log</div></div>\n        </div>\n        '+removeHTML(row)+'\n      </div><!--]-->';
 return '<!--[-1--><div class="db-biometric-tile-wrap">\n      <button type="button" class="db-wearable-tile db-biometric-widget" data-dashboard-widget-action="open-biometric-detail"'+actionIdHTML(row.id)+' aria-label="'+attributeHTML(row.accessibleLabel)+'">\n        <span class="db-wearable-label">'+textHTML(row.label)+'</span>\n        <strong>'+textHTML(row.value)+'</strong>\n        <span class="db-wearable-foot"><small>'+textHTML(row.unit)+'</small><em>'+textHTML(row.change)+'</em></span>\n      </button>\n      '+removeHTML(row)+'\n    </div><!--]-->';
}
/** Independent test-only fixed source skeleton and exact conditional/each markers. Readonly fields are extracted from immutable native DOM only. */
export function expectedOwnedBiometricRaw(root:NodeValue):string {
 const view=expectedView(root),sync=view.sync;
 const syncHTML=sync?'<!--[0--><span class="db-biometric-sync-status'+(sync.stale?' is-stale':'')+'">'+textHTML(sync.label)+'</span>\n      '+(sync.stale?'<!--[0--><button type="button" class="dashboard-action-btn db-biometric-sync-btn" data-dashboard-widget-action="sync-biometric-now">Sync stale data</button><!--]-->':'<!--[-1--><!--]-->')+'<!--]--><!---->':'<!--[-1--><!--]--><!---->';
 const toolbar='<div class="db-biometric-overview-bar">\n      <span>'+textHTML(view.count)+' metric'+textHTML(view.pluralSuffix)+' selected</span>\n      <div class="db-biometric-overview-actions">\n        '+syncHTML+'\n        <button type="button" class="dashboard-action-btn" data-dashboard-widget-action="open-biometric-picker">Add metrics</button>\n      </div>\n    </div>';
 const rows=view.rows.length?'<!--[0--><div class="db-wearable-grid db-biometric-overview-grid"><!--[-->'+view.rows.map(tileHTML).join('')+'<!--]--></div><!--]-->':'<!--[-1--><div class="dashboard-widget-empty">No biometrics selected.</div><!--]-->';
 return '<!--[-->'+toolbar+rows+'<!--]-->';
}
/** Keep every raw actual field; qualify only exact source-owned expected SSR transport and additive projector names. */
export function expectedOwnedBiometricReceipt<T>(input:T):T {
 const result=structuredClone(input)as T&{raw:string;dom:NodeValue;keys:string[];error:string|null};
 result.keys=expectedOwnedFactoryKeys(result.keys);
 if(result.raw){result.raw=expectedOwnedBiometricRaw(result.dom);result.dom=expectedOwnedBiometricDOM(result.dom);}return result;
}
