import {expect} from 'vitest';
const added=['projectDashboardQuickMarkersWidget','projectDashboardNotesWidget','projectDashboardSingleMarkerWidget','projectDashboardSpotlightWidget'] as const;
/** Explicit additive public methods; every original key and its order remains exact. */
export function expectedOwnedFactoryKeys(input:string[]):string[] {
 const keys=[...input];
 const insert=(anchor:string,names:readonly string[])=>{expect(names.every(name=>!keys.includes(name))).toBe(true);expect(keys.filter(key=>key===anchor)).toHaveLength(1);keys.splice(keys.indexOf(anchor)+1,0,...names);};
 insert('renderDashboardBioAgeWidget',['projectDashboardBioAgeWidget']);
 insert('renderDashboardQuickMarkersWidget',added);
 insert('renderDashboardInsightsListWidget',['prepareDashboardInsightsListWidget']);
 insert('renderDashboardWearableTilesWidget',['prepareDashboardWearableTilesWidget']);
 insert('renderDashboardGenomeWidget',['projectDashboardGenomeWidget']);
 insert('renderDashboardCorrelationWidget',['projectDashboardCorrelationWidget','projectDashboardLightTodayWidget','projectDashboardLightConditionsWidget','projectDashboardLightLiveSessionWidget','projectDashboardLightSessionLogWidget','projectDashboardLightChannelsWidget']);
 insert('renderDashboardKeyTrendsWidget',['projectDashboardKeyTrendsWidget','projectLabsPriorityBanner','projectDashboardWearableTilesWidget','projectDashboardInsightsListWidget','projectDashboardRecommendationsWidget']);
 insert('renderDashboardAlertsWidget',['projectDashboardAlertsWidget']);
 return keys;
}
/** The smaller lab factory exposes these nine exact additions in its own order. */
export function expectedOwnedLabFactoryKeys(input:string[]):string[] {
 const keys=[...input];
 const insert=(anchor:string,names:readonly string[])=>{expect(names.every(name=>!keys.includes(name))).toBe(true);expect(keys.filter(key=>key===anchor)).toHaveLength(1);keys.splice(keys.indexOf(anchor)+1,0,...names);};
 insert('buildDashboardWidgetContext',['projectDashboardAlertsWidget','projectDashboardCorrelationWidget','projectDashboardBioAgeWidget']);
 insert('renderDashboardKeyTrendsWidget',['projectDashboardKeyTrendsWidget']);
 const appended=[...added,'projectLabsPriorityBanner'];expect(appended.every(name=>!keys.includes(name))).toBe(true);
 return [...keys,...appended];
}
interface NodeValue {type?:number;name?:string;tag?:string;namespace?:string|null;attributes?:unknown[][];text?:string|null;children?:NodeValue[]}
const comment=(text:string):NodeValue=>({type:8,text});
/** Whole expected native nodes gain only the four source-owned collection comments. */
export function expectedOwnedInsightsDOM(input:unknown):unknown {
 const root=structuredClone(input) as NodeValue;if(!root.children?.length)return root;
 expect(root.children).toHaveLength(1);const list=root.children[0]!;expect(list.type).toBe(1);expect(list.name).toBe('div');expect(list.attributes).toEqual([[null,'class','db-insights-list']]);
 expect(Array.isArray(list.children)).toBe(true);
 for(const card of list.children!){expect(card.type).toBe(1);expect(card.name).toBe('button');expect(card.namespace).toBe('http://www.w3.org/1999/xhtml');expect(card.attributes?.find(a=>a[1]==='class')?.[2]).toMatch(/^db-insight db-insight-/);}
 list.children=[comment('['),...list.children!,comment(']')];root.children=[comment('['),list,comment(']')];return root;
}
/** Independent, source-qualified contextual encoding: text [&<], double-quoted attributes [&"<]. */
export function expectedSvelteText(value:string):string {return value.replace(/[&<]/g,char=>char==='&'?'&amp;':'&lt;');}
export function expectedSvelteAttribute(value:string):string {return value.replace(/[&"<]/g,char=>char==='&'?'&amp;':char==='"'?'&quot;':'&lt;');}
/** Test-only fixed owned skeleton. Input fields come solely from immutable native markup; no production serializer is imported or called. */
export function expectedOwnedInsightsRaw(raw:string):string {
 if(!raw)return raw;const host=document.createElement('template');host.innerHTML=raw;
 const list=host.content.firstElementChild;expect(host.content.childNodes).toHaveLength(1);expect(list?.className).toBe('db-insights-list');
 const cards:string[]=[];
 for(const node of list!.childNodes){
  expect(node instanceof HTMLButtonElement).toBe(true);const card=node as HTMLButtonElement,children=[...card.children];expect(children).toHaveLength(3);expect(children.map(child=>child.localName)).toEqual(['span','strong','span']);expect(children[0]!.className).toBe('db-insight-tag');
  const cls=card.getAttribute('class')!;expect(cls.startsWith('db-insight db-insight-')).toBe(true);expect(card.getAttribute('type')).toBe('button');
  const detail=card.hasAttribute('data-dashboard-widget-action');if(detail)expect(card.getAttribute('data-dashboard-widget-action')).toBe('open-marker-detail');
  const names=[...card.attributes].map(attr=>attr.name);expect(names).toEqual(['type','class',...(detail?['data-dashboard-widget-action']:[]),...(card.hasAttribute('data-dashboard-widget-id')?['data-dashboard-widget-id']:[])]);
  const optional=(detail?' data-dashboard-widget-action="open-marker-detail"':'')+(card.hasAttribute('data-dashboard-widget-id')?' data-dashboard-widget-id="'+expectedSvelteAttribute(card.getAttribute('data-dashboard-widget-id')!)+'"':'');
  cards.push('<button type="button" class="'+expectedSvelteAttribute(cls)+'"'+optional+'>\n        <span class="db-insight-tag">'+expectedSvelteText(children[0]!.textContent!)+'</span>\n        <strong>'+expectedSvelteText(children[1]!.textContent!)+'</strong>\n        <span>'+expectedSvelteText(children[2]!.textContent!)+'</span>\n      </button>');
 }
 return '<!--[--><div class="db-insights-list"><!--[-->'+cards.join('')+'<!--]--></div><!--]-->';
}
export function expectedOwnedInsightsPublic(original:Record<string,unknown>):Record<string,unknown> {
 const result=structuredClone(original);if(Array.isArray(result.factoryKeys))result.factoryKeys=expectedOwnedFactoryKeys(result.factoryKeys as string[]);
 if(typeof result.raw==='string'){const raw=expectedOwnedInsightsRaw(result.raw);result.raw=raw;result.assignments=[raw];}
 if(result.dom)result.dom=expectedOwnedInsightsDOM(result.dom);return result;
}
export function expectedOwnedLoading(original:unknown):unknown {
 const result=structuredClone(original) as {keys:string[];factoryTrace:string[];outputs:{raw:string|null;dom:NodeValue}[]};result.keys=expectedOwnedFactoryKeys(result.keys);
 // The genuine Light view ports are captured immediately after markerHasData.
 // Add only these five source-owned dependency reads to the frozen expectation;
 // all original factory reads and every readiness/load/settlement trace stay exact.
 const projectorReads=['dependency:getLightTodayHeroView','dependency:getLightConditionsWidgetView','dependency:getLightLiveSessionView','dependency:getLightSessionLogActionsView','dependency:getDashboardLightChannelsWidgetView'];
 expect(result.factoryTrace[0]).toBe('dependency:markerHasData');
 expect(result.factoryTrace[1]).toBe('dependency:renderDashboardLightChannelsWidget');
 expect(projectorReads.every(read=>!result.factoryTrace.includes(read))).toBe(true);
 result.factoryTrace.splice(1,0,...projectorReads);
 for(const output of result.outputs){if(output.raw?.startsWith('<div class="dashboard-widget-empty" aria-busy="true" aria-live="polite">')){expect(output.dom.children).toHaveLength(1);output.raw='<!--[-->'+output.raw+'<!--]-->';output.dom.children=[comment('['),...output.dom.children!,comment(']')];}}
 return result;
}
