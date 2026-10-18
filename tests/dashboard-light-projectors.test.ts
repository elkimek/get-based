// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {createDashboardWidgetRenderers} from '../js/dashboard-widget-renderers.js';
import {renderDashboardLightWidget} from '../js/dashboard-light-widget-presentation.js';
import {renderHTML as reviewHTML} from '../js/components/LightReviewAI.svelte.html.js';
import {renderHTML as conditionsHTML} from '../js/components/LightConditionsPresentation.svelte.html.js';
import {renderHTML as pageHTML} from '../js/components/LightPagePresentation.svelte.html.js';
import {projectReviewAI} from '../js/light-review-ai-presentation.js';
import {projectLightSessionActions,type LightPageBodyProps} from '../js/light-page-presentation.js';
import type {ConditionsPresentationProps} from '../js/light-conditions-presentation.js';
import type {WidgetRendererDependencies} from '../types/dashboard-widget-renderers.js';
const ports=vi.hoisted(()=>({events:[] as string[],failAt:Infinity}));
function event(label:string){ports.events.push(label);if(ports.events.length===ports.failAt)throw new Error('fault:'+label);}
vi.mock('../js/dashboard-widget-runtime.js',async importActual=>({...await importActual<typeof import('../js/dashboard-widget-runtime.js')>(),
  getDashboardLightSessions:()=>{event('sun');return new Proxy(new Array(2),{get(target,key,receiver){if(key==='length')event('sun.length');return Reflect.get(target,key,receiver);}});},
  getDashboardDeviceSessions:()=>{event('device');return new Proxy(new Array(1),{get(target,key,receiver){if(key==='length')event('device.length');return Reflect.get(target,key,receiver);}});},
}));
const today=projectReviewAI({kind:'today',status:'idle',variant:'idle',analysis:null,actionOwner:'owner',trends:['Literal <& trend']});
const conditions:ConditionsPresentationProps={kind:'widget',hasLocation:false,slot:{id:'cond-now-dashboard-widget',variant:'full',view:null}};
const actions:LightPageBodyProps={kind:'actions',view:projectLightSessionActions({sunActive:false,deviceActive:false,hasDevices:true,totalSessions:3})};
const live:LightPageBodyProps={kind:'prompt',view:{status:'No light session is running',label:'Open Light & Sun',action:'navigate-light',hint:'Literal <& hint',extraClass:'light-live-session-empty'}};
const channels:LightPageBodyProps={kind:'dashboard-channels',lead:'Seven-day light rhythm, with sunlight and device signals kept separate.',pills:[]};
function fixture({ready=true,load=()=>Promise.resolve(),rerender=()=>{}}:{ready?:boolean;load?:()=>Promise<void>;rerender?:()=>void}={}){
  const getToday=()=>{event('today');return today;};
  const getConditions=(options:{variant:string;slotId:string})=>{event('conditions:'+options.variant+':'+options.slotId);return conditions;};
  const getLive=(options:{includeEmptyState:boolean})=>{event('live:'+options.includeEmptyState);return live;};
  const getActions=()=>{event('actions');return actions;};
  const getChannels=(count:number)=>{event('channels:'+count);return channels;};
  const deps:WidgetRendererDependencies={markerHasData:()=>true,getMobileDashboardMarkers:()=>[],getMobileDashboardInsights:()=>[],getMobileWearableTiles:()=>[],formatMobileWearableValue:()=>'',formatMobileWearableDelta:()=>'',
    isLightSunUILoaded:()=>{event('ready');return ready;},loadLightSunUI:load,rerenderDashboardFromWidgetChange:rerender,
    getLightTodayHeroView:getToday,getLightConditionsWidgetView:getConditions,getLightLiveSessionView:getLive,getLightSessionLogActionsView:getActions,getDashboardLightChannelsWidgetView:getChannels,
    renderLightTodayHero:()=>reviewHTML({view:getToday()}),renderLightConditionsWidgetBody:options=>conditionsHTML(getConditions(options)),renderLightLiveSession:options=>pageHTML(getLive(options)),renderLightSessionLogActions:()=>pageHTML(getActions()),renderDashboardLightChannelsWidget:count=>pageHTML(getChannels(count)),
  };
  const factory=createDashboardWidgetRenderers(deps);
  return {deps,factory,entries:[
    {name:'today',legacy:factory.renderDashboardLightTodayWidget,project:factory.projectDashboardLightTodayWidget},
    {name:'conditions',legacy:factory.renderDashboardLightConditionsWidget,project:factory.projectDashboardLightConditionsWidget},
    {name:'live',legacy:factory.renderDashboardLightLiveSessionWidget,project:factory.projectDashboardLightLiveSessionWidget},
    {name:'actions',legacy:factory.renderDashboardLightSessionLogWidget,project:factory.projectDashboardLightSessionLogWidget},
    {name:'channels',legacy:factory.renderDashboardLightChannelsWidget,project:factory.projectDashboardLightChannelsWidget},
  ]};
}
function legacyHTML(value:unknown):string {
  if(typeof value!=='string')throw new Error('This native DOM fixture requires an HTML callback');
  return value;
}
function tree(html:string):unknown {
  const host=document.createElement('template');host.innerHTML=html;
  const walker=document.createTreeWalker(host.content,NodeFilter.SHOW_COMMENT),removed:Node[]=[];
  for(let node=walker.nextNode();node;node=walker.nextNode())if(['','[',']','[-1','[!'].includes(node.nodeValue??'')||/^\[(?:[0-9]|1[0-9]|20)$/.test(node.nodeValue??''))removed.push(node);
  for(const node of removed)node.parentNode?.removeChild(node);host.content.normalize();
  function read(node:Node):unknown {
    if(node.nodeType===3)return node.nodeValue;
    if(!(node instanceof Element))return {comment:node.nodeValue};
    return {name:node.localName,namespace:node.namespaceURI,attrs:[...node.attributes].map(a=>[a.name,a.value]),
      defaults:node instanceof HTMLButtonElement?{type:node.type,disabled:node.disabled}:node instanceof HTMLInputElement?{type:node.type,value:node.value,checked:node.checked,defaultChecked:node.defaultChecked}:null,
      children:[...node.childNodes].map(read)};
  }
  return [...host.content.childNodes].map(read);
}
for(const index of [0,1,2,3,4]){
  it(`composes genuine feature children with exact native DOM/defaults and callback chronology for widget${index}`,()=>{
    ports.failAt=Infinity;const {entries}=fixture();const entry=entries[index]!;
    ports.events=[];const native=entry.legacy();const originalEvents=[...ports.events];expect(typeof native).toBe('string');if(typeof native!=='string')throw new Error('Legacy fixture must render HTML');
    ports.events=[];const view=entry.project();const actual=renderDashboardLightWidget(view);
    expect(tree(actual)).toEqual(tree(native));expect(ports.events).toEqual(originalEvents);
    expect(actual).not.toContain('getbased-light-private');
    if(entry.name==='channels')expect(ports.events).toEqual(['ready','sun','device','sun.length','device.length','channels:3']);
  });
  it(`retains every interrupted ready/model/domain boundary for widget${index}`,()=>{
    ports.failAt=Infinity;const {entries}=fixture();const entry=entries[index]!;ports.events=[];entry.legacy();const count=ports.events.length;
    function capture(run:()=>unknown,failAt:number){ports.events=[];ports.failAt=failAt;let error:unknown=null;try{run();}catch(value){error=value instanceof Error?value.message:String(value);}return {events:[...ports.events],error};}
    for(let point=1;point<=count;point++)expect(capture(entry.project,point)).toEqual(capture(entry.legacy,point));ports.failAt=Infinity;
  });
}
it('keeps empty Today fallback and the four optional empty typed ports equivalent to legacy empty renderers',()=>{
  const {deps}=fixture();const factory=createDashboardWidgetRenderers({...deps,getLightTodayHeroView:()=>null,renderLightTodayHero:()=>'',getLightConditionsWidgetView:()=>null,renderLightConditionsWidgetBody:()=>'',getLightLiveSessionView:()=>null,renderLightLiveSession:()=>'',getLightSessionLogActionsView:()=>null,renderLightSessionLogActions:()=>'',getDashboardLightChannelsWidgetView:()=>null,renderDashboardLightChannelsWidget:()=>''});
  expect(tree(renderDashboardLightWidget(factory.projectDashboardLightTodayWidget()))).toEqual(tree(legacyHTML(factory.renderDashboardLightTodayWidget())));
  for(const project of [factory.projectDashboardLightConditionsWidget,factory.projectDashboardLightLiveSessionWidget,factory.projectDashboardLightSessionLogWidget,factory.projectDashboardLightChannelsWidget])expect(tree(renderDashboardLightWidget(project()))).toEqual([]);
});
it('deduplicates the original load promise across all five typed projectors, then rerenders once',async()=>{
  let resolve:()=>void=()=>{throw new Error('Deferred load not initialized');};const pending=new Promise<void>(done=>{resolve=done;});const load=vi.fn(()=>pending),rerender=vi.fn();const {entries}=fixture({ready:false,load,rerender});ports.events=[];
  for(const entry of entries){expect(entry.project()).toEqual({kind:'loading'});expect(tree(renderDashboardLightWidget(entry.project()))).toEqual(tree(legacyHTML(entry.legacy())));}
  expect(load).toHaveBeenCalledTimes(1);expect(rerender).not.toHaveBeenCalled();resolve();await pending;await Promise.resolve();await Promise.resolve();
  expect(rerender).toHaveBeenCalledTimes(1);
});
it('retains the public legacy callback return identity independently of typed first-party models',()=>{
  const {deps}=fixture();const value={legacy:'opaque callback value'};const typed=vi.fn(()=>conditions);const factory=createDashboardWidgetRenderers({...deps,renderLightConditionsWidgetBody:()=>value,getLightConditionsWidgetView:typed});
  expect(factory.renderDashboardLightConditionsWidget()).toBe(value);expect(typed).not.toHaveBeenCalled();
  expect(factory.projectDashboardLightConditionsWidget()).toEqual({kind:'conditions',view:conditions});expect(typed).toHaveBeenCalledOnce();
});
it('keeps unknown comments observable in the native comparator',()=>{expect(tree('<p>same</p><!--[99-->')).not.toEqual(tree('<p>same</p>'));});
