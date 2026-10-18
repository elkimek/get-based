import {expectedEMFComparisonReceipt} from './helpers/emf-comparison-owned-receipts.js';
// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import fixtures from './fixtures/emf-comparison-presentation-original.json' with {type:'json'};
import * as candidate from '../js/emf-editor.js';
import {state} from '../js/state.js';
import {MEASUREMENT_TYPES} from '../js/emf-model.js';
const saved=state.importedData;
afterEach(()=>{state.importedData=saved;localStorage.clear();vi.restoreAllMocks();document.body.innerHTML='';});
type Scenario={name:string;kind?:string;count?:number;provider?:string;compare?:boolean};
function tree(n:Node):unknown{return n.nodeType===Node.ELEMENT_NODE?{tag:(n as Element).tagName,namespace:(n as Element).namespaceURI,attributes:[...(n as Element).attributes].map(a=>[a.name,a.value]),children:[...n.childNodes].map(tree)}:{type:n.nodeType,text:n.nodeValue};}
/** Preserve full ordered own data/descriptor structure without triggering extra getter reads. */
function snapshot(value:unknown,seen=new Map<object,number>()):unknown{
 if(value===undefined)return {type:'undefined'};if(typeof value==='number'&&!Number.isFinite(value))return {type:'number',value:String(value)};
 if(typeof value==='symbol')return {type:'symbol',value:value.description};if(typeof value==='function')return {type:'function',name:value.name};
 if(value===null||typeof value!=='object')return value;if(seen.has(value))return {reference:seen.get(value)};seen.set(value,seen.size);
 return {type:Array.isArray(value)?'array':'object',properties:Reflect.ownKeys(value).map(key=>{const d=Object.getOwnPropertyDescriptor(value,key)!;return {key:typeof key==='symbol'?'symbol:'+key.description:key,enumerable:d.enumerable,configurable:d.configurable,...('value'in d?{writable:d.writable,value:snapshot(d.value,seen)}:{get:d.get?.name??null,set:d.set?.name??null})};})};
}
function capture(owner:typeof candidate,s:Scenario){
 const trace:string[]=[];const m=(value:unknown)=>({value});
 const before:any={id:'before',date:'2026-01-01',label:'Before <&> "',rooms:[{name:'Bedroom',sleeping:true,measurements:{acElectric:m(10),acMagnetic:m(20),rfMicrowave:m(30),dcMagnetic:m(50)}}]};
 const after:any={id:'after',date:'2026-02-03',label:'After <&> "',rooms:[{name:'Bedroom',sleeping:true,measurements:{acElectric:m(5),acMagnetic:m(30),rfMicrowave:m(30),dirtyElectricity:m(25)}}]};
 const coerce=(role:string,result:unknown)=>({[Symbol.toPrimitive](hint:string){trace.push(role+':'+hint);if(s.kind==='coercion-throw'&&hint==='number')throw new RangeError('measurement-coercion');return result;}});
 switch(s.kind){
 case 'empty-rooms':before.rooms=[];after.rooms=[];break;
 case 'empty-values':before.rooms[0].measurements={};after.rooms[0].measurements={};break;
 case 'daytime':after.rooms[0].sleeping=false;break;
 case 'before-sleeping':after.rooms=[];before.rooms[0].sleeping=false;break;
 case 'added-room':after.rooms.push({name:'Office',sleeping:false,measurements:{acElectric:m(100)}});break;
 case 'removed-room':before.rooms.push({name:'Office',measurements:{dcMagnetic:m(200)}});break;
 case 'duplicate-rooms':before.rooms.push({name:'Bedroom',measurements:{acElectric:m(999)}});after.rooms.unshift({name:'Office',measurements:{}});break;
 case 'null-values':before.rooms[0].measurements.acElectric=m(null);after.rooms[0].measurements.acElectric=m(undefined);break;
 case 'null-measurements':before.rooms[0].measurements=null;after.rooms[0].measurements=undefined;break;
 case 'falsy-values':before.rooms[0].measurements.acElectric=m(0);after.rooms[0].measurements.acElectric=m('');break;
 case 'nan':after.rooms[0].measurements.acElectric=m(NaN);break;
 case 'infinity':after.rooms[0].measurements.acElectric=m(Infinity);break;
 case 'coercion':case 'coercion-throw':after.rooms[0].measurements.acElectric=m(coerce('afterValue',15));before.rooms[0].measurements.acElectric=m(coerce('beforeValue',10));break;
 case 'symbol-value':after.rooms[0].measurements.acElectric=m(Symbol('native-measurement'));break;
 case 'getter-value':case 'throw-value':after.rooms[0].measurements.acElectric={get value(){trace.push('afterValue.get');if(s.kind==='throw-value')throw new SyntaxError('value-getter');return 5;}};break;
 case 'getter-name':case 'throw-name':Object.defineProperty(before.rooms[0],'name',{enumerable:true,configurable:true,get(){trace.push('beforeName.get');if(s.kind==='throw-name')throw Error('room-name');return 'Bedroom';}});break;
 case 'name-coercion':before.rooms[0].name=coerce('roomName','<room> gb-emf-comparison-emfcomparison-room-row-open-room-label-end');after.rooms[0].name=before.rooms[0].name;break;
 case 'symbol-name':before.rooms[0].name=Symbol('room');after.rooms[0].name=before.rooms[0].name;break;
 case 'nan-name':before.rooms[0].name=NaN;after.rooms[0].name=NaN;break;
 case 'null-name':before.rooms[0].name=null;after.rooms[0].name=null;break;
 case 'label-coercion':before.label=coerce('beforeLabel','gb-emf-comparison-emfcomparison-header-before-label-end <&>');after.label=coerce('afterLabel','<&>');break;
 case 'getter-label':case 'throw-label':Object.defineProperty(before,'label',{enumerable:true,configurable:true,get(){trace.push('beforeLabel.get');if(s.kind==='throw-label')throw Error('label-getter');return '<label>';}});break;
 case 'empty-labels':before.label='';after.label=null;break;
 case 'date-coercion':case 'date-throw':before.date={localeCompare(v:unknown){trace.push('date.localeCompare');return '2026-01-01'.localeCompare(String(v));},[Symbol.toPrimitive](hint:string){trace.push('beforeDate:'+hint);if(s.kind==='date-throw')throw Error('date-coercion');return '2026-01-01';}};break;
 case 'invalid-date':before.date='invalid';break;
 case 'proxy-room':before.rooms[0]=new Proxy(before.rooms[0],{get(t,k,r){trace.push('room.'+String(k));return Reflect.get(t,k,r);}});break;
 case 'sleeping-getter':Object.defineProperty(after.rooms[0],'sleeping',{enumerable:true,configurable:true,get(){trace.push('sleeping.get');return false;}});break;
 }
 const assessments=s.count===0?[]:s.count===1?[after]:[before,after,...Array.from({length:Math.max(0,(s.count??2)-2)},(_,n)=>({id:'earlier-'+n,date:'2025-01-0'+(n+1),label:'Older',rooms:[]}))];
 const imported:any={syntheticSentinel:{protected:'<profile> & native'},emfAssessment:{assessments,interpretation:{text:'retained'},foreign:[1,null,'x']},wearableConnections:{manual:{connectedAt:1}},wearableSummary:{metrics:{steps:{latest:100}}}};
 if(s.kind==='initialize')delete imported.emfAssessment;
 state.importedData=imported;owner.emfEditorState.compareMode=s.compare??true;owner.emfEditorState.editingAssessmentId=null;owner.emfEditorState.activeRoomIdx=2;
 localStorage.clear();localStorage.setItem('synthetic-protected','preserve<&>');localStorage.setItem('synthetic-order','second');
 let aiCalls=0;const hasAI=s.provider==='null'?null:()=>{trace.push('hasAI:'+ ++aiCalls);if(s.provider==='throw-first'||s.provider==='throw-second'&&aiCalls===2)throw new TypeError('provider-port');return s.provider==='true';};
 const previous=owner.configureEMFEditor({hasAIProvider:hasAI});const profileBefore=snapshot(imported);trace.length=0;let raw='',error:string|null=null;
 const modal={get innerHTML(){return raw;},set innerHTML(value:string){trace.push('modal.innerHTML');raw=value;}};
 try{owner.renderEMFEditor(modal);}catch(e){error=e instanceof Error?e.name+':'+e.message:String(e);}finally{owner.configureEMFEditor(previous);}
 const nativeTrace=[...trace],host=document.createElement('div');host.innerHTML=raw;
 return {raw,dom:tree(host),actions:[...host.querySelectorAll('[data-emf-action],[data-emf-change-action]')].map(el=>({tag:el.tagName,attributes:[...el.attributes].map(a=>[a.name,a.value])})),trace:nativeTrace,error,state:snapshot(owner.emfEditorState),profileBefore,profileAfter:snapshot(imported),storage:[...Array(localStorage.length)].map((_,n)=>{const k=localStorage.key(n)!;return[k,localStorage.getItem(k)];}),columns:[...host.querySelectorAll('.emf-compare-table thead th')].map(el=>el.textContent),rows:[...host.querySelectorAll('.emf-compare-table tbody tr')].map(el=>el.textContent)};
}
const scenarios:Scenario[]=[{name:'two-recent'},{name:'three-earlier-singular',count:3},{name:'four-earlier-plural',count:4},{name:'five-earlier-plural',count:5},{name:'one-native-assessment',count:1},{name:'zero-native-assessments',count:0},{name:'native-initialize',kind:'initialize'},
 ...['empty-rooms','empty-values','daytime','before-sleeping','added-room','removed-room','duplicate-rooms','null-values','null-measurements','falsy-values','nan','infinity','coercion','coercion-throw','symbol-value','getter-value','throw-value','getter-name','throw-name','name-coercion','symbol-name','nan-name','null-name','label-coercion','getter-label','throw-label','empty-labels','date-coercion','date-throw','invalid-date','proxy-room','sleeping-getter'].map(kind=>({name:kind,kind})),
 ...['false','true','null','throw-first','throw-second'].map(provider=>({name:'provider-'+provider,provider}))];
for(const scenario of scenarios)it('preserves complete native comparison public renderer '+scenario.name,()=>{
 const before=fixtures.find(row=>row.name===scenario.name)!.original,after=capture(candidate,scenario);expect(after).toEqual(expectedEMFComparisonReceipt(before));
 if(scenario.name==='two-recent'){expect(before.columns).toEqual(['Room',...MEASUREMENT_TYPES.map(t=>t.short)]);expect(before.raw).toContain('Before: Jan 1, 2026');expect(before.raw).toContain('After: Feb 3, 2026');expect(before.raw).toContain('↓');expect(before.raw).toContain('↑');expect(before.raw).toContain('=');}
 if(scenario.name==='three-earlier-singular')expect(before.raw).toContain('1 earlier assessment not shown.');
 if(scenario.name==='four-earlier-plural')expect(before.raw).toContain('2 earlier assessments not shown.');
 if(scenario.name==='provider-true')expect(before.actions.at(-1)?.attributes).toContainEqual(['data-emf-action','interpret-comparison']);
 if(scenario.name==='symbol-value')expect(before.error).toContain('TypeError');
 if(scenario.name==='coercion'){expect(before.trace).toContain('afterValue:number');expect(before.trace).toContain('beforeValue:string');expect(before.trace.filter(x=>x==='beforeValue:number').length).toBeGreaterThan(1);}
 if(scenario.name==='zero-native-assessments')expect(before.state).toEqual(after.state);
});
it('retains the complete ordered set of original native receipts',()=>{expect(fixtures.map(row=>row.name)).toEqual(scenarios.map(row=>row.name));expect(fixtures.every(row=>JSON.stringify(row.original)===JSON.stringify(row.candidate))).toBe(true);});
