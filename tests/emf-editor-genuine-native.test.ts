// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {state} from '../js/state.js';
import * as current from '../js/emf-editor.js';
import {nativeEMFEditor} from './helpers/emf-editor-native.js';
import {expectedEMFEditorHTML} from './helpers/emf-comparison-owned-receipts.js';
const saved=state.importedData;
afterEach(()=>{state.importedData=saved;document.body.innerHTML='';localStorage.clear();vi.restoreAllMocks();});
interface Data {emfAssessment:{assessments:unknown[]};protected:unknown}
const createData=():Data=>({protected:{keep:['all',3]},emfAssessment:{assessments:[{id:'assessment<&>',date:'2026-06-12',label:'Bedroom <&>',consultant:'Test "consultant"',note:'General <&>',rooms:[{name:'Custom <room>',location:'Pillow <&>',sleeping:true,note:'Room "note"',measurements:{acElectric:{value:8,meter:'NFA <&>'},acMagnetic:{value:0},rfMicrowave:{value:100}},sources:['WiFi router'],mitigations:['WiFi off at night'],photos:[{mediaType:'image/png',base64:'c3ludGhldGlj',name:'Photo <&>'}]},{name:'Office',sleeping:false,measurements:{}}]}]}});
const frameworkComments=new Set(['','[',']','[0','[1','[2','[-1']);
/** Ignore only Svelte's finite branch delimiters; all native nodes/attributes,
 * text whitespace, form defaults and unknown comments remain observable. */
function tree(node:Node):unknown {
 if(node.nodeType===8)return frameworkComments.has(node.nodeValue||'')?null:{unexpectedComment:node.nodeValue};
 if(node.nodeType===3)return node.nodeValue;
 const e=node as Element,children:unknown[]=[];
 for(const child of e.childNodes){const value=tree(child);if(value===null)continue;if(typeof value==='string'&&typeof children.at(-1)==='string')children[children.length-1]=(children.at(-1) as string)+value;else children.push(value);}
 return{tag:e.tagName,namespace:e.namespaceURI,attributes:[...e.attributes].map(a=>[a.name,a.value]),children,
 defaults:e.tagName==='INPUT'?{type:(e as HTMLInputElement).type,value:(e as HTMLInputElement).value,defaultValue:(e as HTMLInputElement).defaultValue,checked:(e as HTMLInputElement).checked,defaultChecked:(e as HTMLInputElement).defaultChecked,multiple:(e as HTMLInputElement).multiple}:e.tagName==='SELECT'?{value:(e as HTMLSelectElement).value,selectedIndex:(e as HTMLSelectElement).selectedIndex,options:[...(e as HTMLSelectElement).options].map(o=>({value:o.value,selected:o.selected,defaultSelected:o.defaultSelected,disabled:o.disabled}))}:e.tagName==='BUTTON'?{type:(e as HTMLButtonElement).type,disabled:(e as HTMLButtonElement).disabled}:null};
}
/** Only the reviewed accessibility changes are applied to expected native DOM. */
function accessibleNative(host:HTMLElement):void {
 for(const label of host.querySelectorAll('label.emf-tags-label')){const heading=document.createElement('div');for(const a of label.attributes)heading.setAttribute(a.name,a.value);heading.append(...label.childNodes);label.replaceWith(heading);}
 for(const image of host.querySelectorAll<HTMLImageElement>('img[data-emf-action="view-photo"]')){
  const button=document.createElement('button');button.type='button';button.className='emf-photo-open';button.setAttribute('style','display:block;width:100%;height:100%;padding:0;border:0;background:none;cursor:pointer');
  for(const a of [...image.attributes])if(a.name.startsWith('data-emf-')){button.setAttribute(a.name,a.value);image.removeAttribute(a.name);}
  image.removeAttribute('role');image.removeAttribute('tabindex');image.replaceWith(button);button.append(image);
 }
}
function snapshot(value:unknown,seen=new Map<object,number>()):unknown {
 if(value===undefined)return{type:'undefined'};if(typeof value==='number'&&!Number.isFinite(value))return{type:'number',value:String(value)};
 if(typeof value==='symbol')return{type:'symbol',value:value.description};if(typeof value==='function')return{type:'function',name:value.name};
 if(value===null||typeof value!=='object')return value;if(seen.has(value))return{reference:seen.get(value)};seen.set(value,seen.size);
 return{type:Array.isArray(value)?'array':'object',properties:Reflect.ownKeys(value).map(key=>{const d=Object.getOwnPropertyDescriptor(value,key)!;return{key:typeof key==='symbol'?'symbol:'+key.description:key,enumerable:d.enumerable,configurable:d.configurable,...('value'in d?{writable:d.writable,value:snapshot(d.value,seen)}:{get:d.get?.name??null,set:d.set?.name??null})};})};
}
function capture(native:boolean,scenario:string){
 const owner=native?nativeEMFEditor():current,data=createData(),trace:string[]=[];
 const assessment=data.emfAssessment.assessments[0] as {id:unknown;rooms:{measurements?:Record<string,unknown>;photos?:unknown[]}[]};
 if(scenario==='empty')data.emfAssessment.assessments=[];
 if(scenario==='no-rooms')assessment.rooms=[];
 if(scenario==='no-photos')assessment.rooms[0]!.photos=[];
 if(scenario==='missing-values')assessment.rooms[0]!.measurements={};
 if(scenario==='getter'||scenario==='throw-getter')Object.defineProperty(assessment.rooms[0],'location',{get(){trace.push('location.get');if(scenario==='throw-getter')throw new RangeError('location');return 'Tracked';}});
 if(scenario==='id-coercion')assessment.id={[Symbol.toPrimitive](hint:string){trace.push('id:'+hint);return 'coerced';}};
 (state as {importedData:unknown}).importedData=data;owner.emfEditorState.editingAssessmentId=scenario==='collapsed'?null:assessment.id;owner.emfEditorState.activeRoomIdx=scenario==='clamp'?99:0;owner.emfEditorState.compareMode=false;
 localStorage.setItem('synthetic-protected','{"keep":true}');const before=snapshot(data),storage=JSON.stringify(Object.entries(localStorage));trace.length=0;
 const previous=owner.configureEMFEditor({hasAIProvider:()=>{trace.push('provider');return scenario!=='no-provider';}});
 let raw='',error:string|null=null;
 try{owner.renderEMFEditor({get innerHTML(){return raw;},set innerHTML(value:string){trace.push('commit');raw=value;}});}catch(e){error=String((e as Error).name)+':'+String((e as Error).message);}finally{owner.configureEMFEditor(previous);if(native)(owner as ReturnType<typeof nativeEMFEditor>).dispose();}
 const host=document.createElement('div');host.innerHTML=raw;if(native)accessibleNative(host);
 return{dom:tree(host),trace,error,state:JSON.stringify(owner.emfEditorState),data:snapshot(data),before,storageAfter:JSON.stringify(Object.entries(localStorage)),storage,raw};
}
it('pins the complete actual pre-migration editor source',()=>{expect(createHash('sha256').update(readFileSync('tests/fixtures/emf-editor-native-before.ts.txt')).digest('hex')).toBe('40f34e8543ea5c7db5ad837594ec0887bc1b1f181ad01bae76b04951ea55ca43');});
it.each(['expanded','collapsed','empty','no-photos','missing-values','no-provider','clamp','getter','throw-getter','id-coercion','no-rooms'])('preserves complete native DOM/defaults, getter chronology, faults and data/storage for %s',scenario=>{const before=capture(true,scenario),after=capture(false,scenario);expect({...after,raw:undefined}).toEqual({...before,raw:undefined});});
it('keeps extra text, attributes, controls, defaults and unknown comments observable',()=>{const html=capture(false,'expanded').raw,host=document.createElement('div');host.innerHTML=html;const baseline=tree(host);for(const change of[html.replace('class="emf-room-content"','class="emf-room-content" data-foreign="yes"'),html.replace('value="8"','value="9"'),html.replace('Sleeping area','Changed label'),html.replace('data-emf-action="save"','data-emf-action="delete-assessment"'),html.replace('</select>','<option value="foreign">Foreign</option></select>'),html.replace('<h3>','<!--foreign--><h3>')]){expect(change).not.toBe(html);host.innerHTML=change;expect(tree(host)).not.toEqual(baseline);}});
it('has genuine readonly owner children and only the two explicit editor/preview commit boundaries',()=>{for(const name of['EMFEditor','EMFAssessmentDetail','EMFRoomContent','EMFImportPreview','EMFMeterRecommendations'])expect(readFileSync('js/components/'+name+'.svelte','utf8')).not.toMatch(/\{@html|svelte-ignore|NativePort|CompilerFrame|sentinel/);const source=readFileSync('js/emf-editor.ts','utf8');expect(source).not.toMatch(/emfActionAttrs|emfChangeAttrs|html\s*\+=|<button|<input|<div/);expect(source.match(/\.innerHTML\s*=/g)).toHaveLength(2);});

it('retains exact current parent bytes and complete genuine comment graph for collapsed native cards',()=>{
 const before=capture(true,'collapsed'),after=capture(false,'collapsed'),expected=expectedEMFEditorHTML(before.raw);expect(after.raw).toBe(expected);
 for(const changed of[after.raw.replace('<!--[-->',''),after.raw.replace('<!--[-1-->','<!--[0-->'),after.raw.replace('emf-assessment-card','emf-assessment-card foreign'),after.raw.replace('data-emf-action="toggle-assessment"','data-emf-action="delete-assessment"')]){expect(changed).not.toBe(after.raw);expect(changed).not.toBe(expected);}
});
function preview(native:boolean,scenario:string){
 const owner=native?nativeEMFEditor():current,trace:string[]=[];
 document.body.innerHTML=scenario==='missing-modal'?'<div id="modal-overlay"></div>':'<div id="modal-overlay"><div id="detail-modal">original</div></div>';
 const parsed:{date?:unknown;consultant?:unknown;rooms:unknown;note?:unknown}={date:'2026-06-12',consultant:'Consultant <&>',note:'Imported note',rooms:[{name:'Bedroom',location:'Pillow <&>',measurements:{acElectric:{value:8},rfMicrowave:{value:0}},sources:['WiFi <&>'],mitigations:['Off <&>']},{name:'Office',measurements:{}}]};
 if(scenario==='empty')parsed.rooms=[];
 if(scenario==='unknown-date')parsed.date=null;
 if(scenario==='no-consultant')parsed.consultant='';
 if(scenario==='bad-rooms')parsed.rooms=null;
 if(scenario==='getter'||scenario==='throw-getter'||scenario==='missing-modal')Object.defineProperty(parsed,'consultant',{get(){trace.push('consultant.get');if(scenario!=='getter')throw new RangeError('consultant');return '<tracked>';}});
 const before=snapshot(parsed),previous=owner.configureEMFEditor({collectActiveAssessmentState:()=>trace.push('collect')});let error:string|null=null;
 try{owner.showEMFImportPreview(parsed);}catch(e){error=String((e as Error).name)+':'+String((e as Error).message);}finally{owner.configureEMFEditor(previous);if(native)(owner as ReturnType<typeof nativeEMFEditor>).dispose();}
 const modal=document.getElementById('detail-modal'),overlay=document.getElementById('modal-overlay');
 return{dom:modal?tree(modal):null,error,trace,before,after:snapshot(parsed),shown:overlay?.classList.contains('show')??false};
}
it.each(['full','empty','unknown-date','no-consultant','bad-rooms','getter','throw-getter','missing-modal'])('preserves complete native import-preview DOM/defaults, chronology and faults for %s',scenario=>{expect(preview(false,scenario)).toEqual(preview(true,scenario));});
it('renders preview measurement values as literal text rather than executable imported HTML',()=>{
 document.body.innerHTML='<div id="modal-overlay"><div id="detail-modal"></div></div>';
 current.showEMFImportPreview({rooms:[{name:'Bedroom',measurements:{acElectric:{value:'<img src=x onerror="alert(1)">'}}}]});
 const modal=document.getElementById('detail-modal')!;expect(modal.querySelector('img')).toBeNull();expect(modal.textContent).toContain('<img src=x onerror="alert(1)">');
});
it('keeps hostile photo payload characters inside the literal image URL',()=>{
 const data=createData();const assessment=data.emfAssessment.assessments[0] as {rooms:{photos:{base64:unknown}[]}[]};assessment.rooms[0]!.photos[0]!.base64='payload" onerror="alert(1)';
 (state as {importedData:unknown}).importedData=data;current.emfEditorState.editingAssessmentId='assessment<&>';current.emfEditorState.activeRoomIdx=0;current.emfEditorState.compareMode=false;
 let raw='';current.renderEMFEditor({set innerHTML(value:string){raw=value;}});const host=document.createElement('div');host.innerHTML=raw;const image=host.querySelector('img')!;expect(image.getAttribute('src')).toBe('data:image/png;base64,payload" onerror="alert(1)');expect(host.querySelector('[onerror]')).toBeNull();
});
