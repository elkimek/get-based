// @vitest-environment jsdom
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const owned=vi.hoisted(()=>{
 const effects:unknown[]=[],bootstrap:unknown[]=[];
 return {state:{} as Record<string,unknown>,effects,bootstrap,effect:(port:string,...args:unknown[])=>{effects.push({port,args});throw new Error('Overview invoked application effect '+port);}};
});
vi.mock('../js/state.js',()=>({state:owned.state}));
vi.mock('../js/utils.js',async original=>({...await original<Record<string,unknown>>(),showNotification:(...args:unknown[])=>owned.effect('notify',...args),showConfirmDialog:(...args:unknown[])=>owned.effect('confirm',...args)}));
vi.mock('../js/data.js',()=>({saveImportedData:(...args:unknown[])=>owned.effect('persist',...args)}));
vi.mock('../js/modal-lifecycle.js',()=>({openModalOverlay:(...args:unknown[])=>owned.effect('open-modal',...args),closeModalOverlay:(...args:unknown[])=>owned.effect('close-modal',...args)}));
vi.mock('../js/tour.js',()=>({startCycleTour:(...args:unknown[])=>owned.effect('tour',...args)}));
vi.mock('../js/context-cards-runtime.js',()=>({recordContextCardChangeRuntime:(...args:unknown[])=>owned.effect('history',...args)}));
vi.mock('../js/cycle-runtime.js',()=>({isCycleStylesheetLoaded:()=>true,loadCycleStylesheetForAction:(...args:unknown[])=>owned.effect('stylesheet',...args),closeCycleModalRuntime:(...args:unknown[])=>owned.effect('close-modal',...args),navigateCycleViewRuntime:(...args:unknown[])=>owned.effect('navigate',...args),configureCycleAnalysisBridge:(bridge:Record<string,unknown>)=>owned.bootstrap.push({port:'configure-analysis',functions:Object.keys(bridge)})}));
// The cold summary/picker facade and all normalization, draw and clinical helpers
// stay real. Direct Svelte Picker composition replaces only its former HTML call.
import {renderMenstrualCycleSection,getNextBestDrawDate,getBloodDrawPhases,detectPerimenopausePattern,detectCycleIronAlerts} from '../js/cycle.js';
import {upgradeMenstrualCycleProfile,recentCyclePeriods} from '../js/cycle-summary.js';
import {cycleOverviewClasses} from '../js/cycle-overview-classes.js';
import {bodyMeasurementTiming} from '../js/body-measurement-cycle.js';
import {bodyMeasurementRecords} from '../js/body-measurement-model.js';
import {isoDay} from '../js/wearable-adapters.js';
interface Control {tag:string;id:string;action:string|null;value:unknown;checked:unknown;disabled:unknown;hidden:HTMLElement['hidden'];pressed:string|null;selectedIndex:number|null;options:{value:string;text:string|null;selectedAttribute:boolean;selected:boolean;disabled:boolean}[]|null}
interface Prepared {compact:boolean;showHeader:boolean;hasProfile:boolean;summary:null|{primary:string;aria:string|null;meta:(string|null)[]};drawDescription:string|null;phases:{phase:string;label:string|null;spans:(string|null)[]}[];phaseOverflowLabel:string|null;periods:{dateLabel:string|null;flowClass:string;flow:string|null;symptoms:(string|null)[];notes:string|null}[];alerts:{classes:string;title:string|null;message:string|null;iconPaths:(string|null)[]}[]}
interface Sample {kind:'overview'|'throw';name:string;input:{name:string;mc?:unknown;profileDob?:string|null;data?:unknown;opts?:unknown};html:string;error:null|{name:string;message:string};events:{stage:string;values:Record<string,unknown>}[];prepared:Prepared|null;controls:Control[];initialState:Record<string,unknown>;finalState:Record<string,unknown>;bootstrapTrace:unknown[];runtimeTrace:{port:string}[];originalInputUnmutated:boolean}
const fixtureBytes=fs.readFileSync('tests/fixtures/cycle-overview-original.json','utf8');
const frozen=JSON.parse(fixtureBytes) as {revision:string;fixedNow:string;timezone:string;samples:Sample[];styleBlocks:unknown[]};
function fragment(html:string){const root=document.createElement('div');root.innerHTML=html;return root;}
function nativeClasses(element:Element){return [...element.classList].filter(name=>!name.startsWith('gb:')).join(' ');}
function normalized(root:Element):unknown {
 const node=(element:Element):unknown=>({tag:element.tagName,namespace:element.namespaceURI,attrs:Object.fromEntries([...element.attributes].filter(attr=>attr.name!=='data-cycle-overview-view').map(attr=>[attr.name,attr.name==='class'?nativeClasses(element):attr.value]).sort(([a],[b])=>a!.localeCompare(b!))),children:[...element.childNodes].flatMap(child=>{if(child.nodeType===Node.ELEMENT_NODE)return[node(child as Element)];if(child.nodeType!==Node.TEXT_NODE)return[];const text=child.textContent!.replace(/\s+/g,' ').trim();return text?[{text}]:[];})});
 return [...root.children].map(node);
}
function equalDOM(current:Element,original:Element){
 expect(normalized(current)).toEqual(normalized(original));
 const prior=[...original.querySelectorAll('*')],next=[...current.querySelectorAll('*')];expect(next).toHaveLength(prior.length);
 prior.forEach((node,index)=>{const target=next[index]!;expect(new Set(target.classList),sampleNode(node,index)).toEqual(new Set(cycleOverviewClasses(node.getAttribute('class')||'').split(/\s+/).filter(Boolean)));});
 const markers=current.querySelectorAll('[data-cycle-overview-view]');expect(markers).toHaveLength(1);expect(markers[0]).toBe(current.firstElementChild);expect(markers[0]!.getAttribute('data-cycle-overview-view')).toBe('');
}
function sampleNode(node:Element,index:number){return 'Original class ownership at '+index+' '+node.tagName+' '+node.className;}
function controls(root:Element):Control[]{return [...root.querySelectorAll<HTMLElement>('.cycle-section input,.cycle-section button,.cycle-section select,.cycle-section textarea,.cycle-section [hidden]')].map(node=>{const control=node as HTMLInputElement;return{tag:node.tagName,id:node.id,action:node.getAttribute('data-cycle-action')||node.getAttribute('data-cycle-import-action'),value:control.value??null,checked:control.checked??null,disabled:control.disabled??null,hidden:node.hidden,pressed:node.getAttribute('aria-pressed'),selectedIndex:node instanceof HTMLSelectElement?node.selectedIndex:null,options:node instanceof HTMLSelectElement?[...node.options].map(option=>({value:option.value,text:option.textContent,selectedAttribute:option.hasAttribute('selected'),selected:option.selected,disabled:option.disabled})):null};});}
function displayFacts(root:Element):Prepared {
 const section=root.querySelector('.cycle-section')!,summary=section.querySelector('.cycle-summary-card'),draw=section.querySelector('.cycle-draw-copy > span');
 return {compact:section.classList.contains('cycle-section-compact'),showHeader:!!section.querySelector('.cycle-widget-head'),hasProfile:!!summary,summary:summary?{primary:summary.querySelector('strong')!.textContent!,aria:summary.getAttribute('aria-label'),meta:[...summary.querySelectorAll('.cycle-meta-tag')].map(node=>node.textContent)}:null,drawDescription:draw?.textContent??null,phases:[...section.querySelectorAll('.cycle-draw-tag:not(.cycle-draw-more)')].map(node=>({phase:nativeClasses(node.querySelector('.cycle-phase-badge')!),label:node.querySelector('.cycle-phase-badge')!.textContent,spans:[...node.children].map(child=>child.textContent)})),phaseOverflowLabel:section.querySelector('.cycle-draw-more')?.textContent??null,periods:[...section.querySelectorAll('.cycle-period-entry')].map(node=>({dateLabel:node.querySelector('.cycle-period-date')!.textContent,flowClass:nativeClasses(node.querySelector('.goals-severity-badge')!),flow:node.querySelector('.goals-severity-badge')!.textContent,symptoms:[...node.querySelectorAll('.period-symptom-tag')].map(tag=>tag.textContent),notes:node.querySelector('.cycle-period-note')?.textContent??null})),alerts:[...section.querySelectorAll('.cycle-alert')].map(node=>({classes:nativeClasses(node),title:node.querySelector('strong')!.textContent,message:node.querySelector('.cycle-alert-detail')!.textContent,iconPaths:[...node.querySelectorAll('svg path')].map(path=>path.getAttribute('d'))}))};
}
function event(sample:Sample,stage:string){return sample.events.find(item=>item.stage===stage)?.values;}
function domainFacts(sample:Sample,input:Sample['input']){
 const raw=input.mc??null,mc=raw?upgradeMenstrualCycleProfile(raw):null;expect(mc).toEqual(event(sample,'profile')!.mc);
 const data=input.data as {dates?:string[];entryContextByDate?:Record<string,Record<string,unknown>>}|null|undefined;
 if(event(sample,'summary'))expect(recentCyclePeriods(mc,12)).toEqual(event(sample,'summary')!.sortedPeriods);
 const draw=event(sample,'draw');if(draw?.isActiveCycle)expect(getNextBestDrawDate(mc)).toEqual(draw.drawRec);
 const phases=event(sample,'all-phases');if(phases)expect(getBloodDrawPhases(mc,data?.dates,data?.entryContextByDate)).toEqual(phases.phases);
 const peri=event(sample,'perimenopause');if(peri)expect(detectPerimenopausePattern(mc,input.profileDob??null)).toEqual(peri.perimenopause);
 const iron=event(sample,'iron');if(iron)expect(input.data?detectCycleIronAlerts(mc,input.data as Parameters<typeof detectCycleIronAlerts>[1]):[]).toEqual(iron.ironAlerts);
}
beforeEach(()=>{vi.stubEnv('TZ','UTC');vi.useFakeTimers();vi.setSystemTime(frozen.fixedNow);owned.effects.length=0;document.body.innerHTML='';});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
it.each(frozen.samples)('preserves prior overview content, controls, domain facts and exact throws alongside optional measurement timing: $name',sample=>{
 const frozenBefore=JSON.stringify(sample),input=structuredClone(sample.input),inputBefore=structuredClone(input);
 for(const key of Object.keys(owned.state))delete owned.state[key];Object.assign(owned.state,structuredClone(sample.initialState));
 const stateBefore=structuredClone(owned.state);let html='',error:Sample['error']=null;
 try{const data=(input.data??null) as Parameters<typeof renderMenstrualCycleSection>[0];html=Object.hasOwn(input,'opts')?renderMenstrualCycleSection(data,input.opts as Parameters<typeof renderMenstrualCycleSection>[1]):renderMenstrualCycleSection(data);}catch(caught){expect(caught).toBeInstanceOf(Error);const exception=caught as Error;error={name:exception.name,message:exception.message};}
 expect(error).toEqual(sample.error);
 if(sample.kind==='overview'){
  const current=fragment(html),original=fragment(sample.html);
  // The new, independently tested timing note is additive. Keep every original
  // node, class, clinical fact and control covered by the immutable receipts.
  const profile=owned.state.importedData as Parameters<typeof bodyMeasurementRecords>[0]&{menstrualCycle?:unknown};
  const mc=profile?.menstrualCycle?upgradeMenstrualCycleProfile(profile.menstrualCycle):null;
  const timing=bodyMeasurementTiming(mc,profile?[...bodyMeasurementRecords(profile,'waist'),...bodyMeasurementRecords(profile,'abdominal_depth')]:[],isoDay());
  const added=current.querySelectorAll('[data-cycle-body-timing]');expect(added).toHaveLength(timing?1:0);
  if(timing){const note=added[0]!;expect(note.querySelector('strong')?.textContent).toBe(`Waist & abdominal depth · ${timing.heading.toLowerCase()}`);expect(note.querySelector('small')?.textContent).toBe(timing.hint);expect(note.querySelector('.cycle-draw-copy > span')?.textContent??null).toBe(timing.dateLabel);note.remove();}
  equalDOM(current,original);expect(controls(current)).toEqual(sample.controls);expect(displayFacts(current)).toEqual(sample.prepared);domainFacts(sample,input);
  expect(current.querySelector('img[onerror],svg[onload],script,[onclick],[onchange]')).toBeNull();
  // Preserve the hidden file reader and sibling/accept/input contract whenever
  // the actual original header predicate includes its direct Picker child.
  const picker=current.querySelector<HTMLInputElement>('[data-cycle-import-action="select-file"]');expect(!!picker).toBe(sample.prepared!.showHeader);if(picker){expect(picker.hidden).toBe(true);expect(picker.type).toBe('file');expect(picker.previousElementSibling?.getAttribute('data-cycle-import-action')).toBe('pick-file');}
 }else{expect(html).toBe(sample.html);expect(sample.prepared).toBeNull();expect(sample.controls).toEqual([]);}
 expect(owned.state).toEqual(stateBefore);expect(owned.state).toEqual(sample.finalState);expect(input).toEqual(inputBefore);expect(JSON.stringify(sample)).toBe(frozenBefore);expect(sample.originalInputUnmutated).toBe(true);expect(sample.initialState).toEqual(sample.finalState);expect(owned.effects).toEqual([]);
 // This capture port observed the old pure string facade. Migration directly
 // composes that same Picker, whose complete DOM is compared above.
 expect(sample.runtimeTrace.every(item=>item.port==='cold-picker')).toBe(true);
});
it('seals original revision, full case counts, caps, opaque/literal branches and authored boundaries',()=>{
 expect(createHash('sha256').update(fixtureBytes).digest('hex')).toBe('c09588b881304c574bb61edb2ebf79065b1170ba585eb7ea999d2f45c4f2058c');expect(frozen.revision).toBe('4d88598e7b518cd5d7b20738e58568c4fe3c16ce');expect(frozen.fixedNow).toBe('2026-10-09T08:00:00.000Z');expect(frozen.timezone).toBe('UTC');expect(frozen.samples).toHaveLength(80);expect(frozen.samples.filter(sample=>sample.kind==='overview')).toHaveLength(71);expect(frozen.samples.filter(sample=>sample.kind==='throw')).toHaveLength(9);expect(frozen.styleBlocks).toHaveLength(65);
 const byName=(name:string)=>{const sample=frozen.samples.find(item=>item.name===name);expect(sample,name).toBeDefined();return sample!;};
 expect(event(byName('many-periods-full-caps-order'),'summary')!.sortedPeriods).toHaveLength(12);expect(byName('many-periods-full-caps-order').prepared!.periods).toHaveLength(6);expect(byName('many-periods-full-caps-order-dashboard').prepared!.periods).toHaveLength(0);
 expect(byName('recorded-all-phases-priority-source-detail').prepared!.phases).toHaveLength(5);expect(byName('recorded-all-phases-priority-source-detail-dashboard').prepared!.phases).toHaveLength(2);expect(byName('recorded-all-phases-priority-source-detail-dashboard').prepared!.phaseOverflowLabel).toBe('+3 more draws');
 expect(byName('perimenopause-plus-ordered-critical-warning').prepared!.alerts.map(alert=>alert.classes)).toEqual(['cycle-alert cycle-alert-perimenopause','cycle-alert cycle-alert-critical','cycle-alert cycle-alert-warning','cycle-alert cycle-alert-warning']);expect(byName('perimenopause-plus-ordered-critical-warning-dashboard').prepared!.alerts).toHaveLength(1);
 expect(byName('opaque-empty-meta-truthiness').prepared!.summary!.meta).toEqual(['','moderate flow','','']);expect(byName('opaque-empty-meta-truthiness').prepared!.summary!.aria).toBe('Edit cycle: 28-day cycle, , moderate flow, , ');for(const name of ['inactive-unused-opaque-fallbacks','computed-unused-opaque-fallbacks'])expect(byName(name).kind).toBe('overview');
 for(const component of ['CycleOverviewPresentation','CycleOverviewHeader','CycleOverviewProfile','CycleOverviewPhases','CycleOverviewHistory','CycleOverviewAlerts'])expect(fs.readFileSync(`js/components/${component}.svelte`,'utf8')).not.toContain('{@html');
 expect(owned.bootstrap).toEqual(frozen.samples[0]!.bootstrapTrace);
});
