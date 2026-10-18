import fs from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {JSDOM} from 'jsdom';
import {expect,it} from 'vitest';
import {renderEMFPhoto} from '../js/emf-photo-presentation.js';
import {escapeHTML} from '../js/utils.js';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/emf-photo-original.json',import.meta.url),'utf8')) as {source:string};
expect(createHash('sha256').update(fs.readFileSync(new URL('./fixtures/emf-photo-original.json',import.meta.url))).digest('hex')).toBe('0de264517b84bd4a292ccc72bd42b6b555a52dd29936f8b61cd84727ac9c93c0');
const native = stripTypeScriptTypes(fixture.source).replace('export ','');
const emitted = fs.readFileSync(new URL('../js/emf.js',import.meta.url),'utf8');
const current = emitted.slice(emitted.indexOf('export function viewEMFPhoto('),emitted.indexOf('export function saveEMFExplicit(')).replace('export ','');
function run(source:string,values:Record<string,unknown>,failAt=Infinity) {
 const dom=new JSDOM('<body></body>'),trace:string[]=[],document=dom.window.document;
 const read=(label:string)=>{trace.push(label);if(trace.length===failAt)throw new Error('fault:'+label);};
 const photo=new Proxy(values,{get(target,key){read(String(key));return target[String(key)];}});
 const listeners:Array<()=>void>=[];
 const create=document.createElement.bind(document);
 document.createElement=((tag:string)=>{read('create:'+tag);const el=create(tag);const add=el.addEventListener.bind(el);el.addEventListener=((type:string,callback:EventListener)=>{read('listen:'+type);listeners.push(()=>callback(new dom.window.Event(type)));add(type,callback);}) as typeof el.addEventListener;return el;}) as typeof document.createElement;
 let error:string|null=null;
 try{vm.runInNewContext(source+';viewEMFPhoto("assessment",0,0)',{
  document,ensureAssessments(){read('assessments');return [{id:'assessment',rooms:[{photos:[photo]}]}];},
  safeMediaType(value:unknown){read('media-check');return value==='image/jpeg'?'image/jpeg':'image/png';},
  escapeHTML,renderEMFPhoto,openModalOverlay(){read('open');},trapModalFocus(){read('focus');},removeModalOverlay(){read('remove');},
 });}catch(e){error=(e as Error).message;}
 const images=[...document.querySelectorAll('img')].map(el=>[...el.attributes].map(a=>[a.name,a.value]));
 const html=document.body.innerHTML;
 for(const listener of listeners){try{listener();}catch(e){error=(e as Error).message;}}
 return {trace,error,images,html};
}
it.each([
 {mediaType:'image/jpeg',base64:'YWJj',name:'Room photo'},
 {mediaType:'text/html',base64:'YWJj',name:'<Room>&"'},
 {mediaType:null,base64:null,name:''},
 {mediaType:undefined,base64:undefined,name:0},
 {mediaType:'image/jpeg',base64:123,name:true},
])('preserves native attributes, lifecycle, getter order and defaults %#',values=>{
 const before=run(native,values),after=run(current,values);
 expect(after.images).toEqual(before.images);expect(after.trace).toEqual(before.trace);expect(after.error).toEqual(before.error);
 expect(new JSDOM(after.html).window.document.querySelectorAll('.emf-lightbox')).toHaveLength(1);
});
it('preserves every observed failure boundary',()=>{
 const values={mediaType:'image/jpeg',base64:'YWJj',name:'Room'};
 for(let index=1;index<=run(native,values).trace.length;index++){
  const before=run(native,values,index),after=run(current,values,index);
  expect(after.trace).toEqual(before.trace);expect(after.error).toEqual(before.error);expect(after.images).toEqual(before.images);
 }
});
it('escapes the data attribute instead of creating imported markup',()=>{
 const values={mediaType:'image/jpeg',base64:'abc" onerror="evil()" data-extra="',name:'Room'};
 const before=run(native,values),after=run(current,values);
 expect(before.images[0]?.some(([name])=>name==='onerror')).toBe(true);
 expect(after.images).toEqual([[['src','data:image/jpeg;base64,'+values.base64],['alt','Room']]]);
 expect(after.trace).toEqual(before.trace);
});
