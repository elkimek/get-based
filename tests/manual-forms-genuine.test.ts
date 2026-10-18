// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parse} from 'svelte/compiler';
import native from './fixtures/manual-marker-form-native.json' with {type:'json'};
import {renderManualMarkerEntry,projectManualEntryUnits,type ManualEntryInput} from '../js/manual-marker-entry-presentation.js';
import {normalizeManualFormDOM} from './helpers/manual-forms-dom.js';
function tree(node:Node):unknown {
 const element=node instanceof Element?node:null;
 const defaults=element instanceof HTMLInputElement?{type:element.type,value:element.value,defaultValue:element.defaultValue,max:element.max,step:element.step,placeholder:element.placeholder,autofocus:element.autofocus,disabled:element.disabled,required:element.required}
  :element instanceof HTMLSelectElement?{type:element.type,value:element.value,selectedIndex:element.selectedIndex,multiple:element.multiple,disabled:element.disabled,required:element.required}
  :element instanceof HTMLOptionElement?{value:element.value,selected:element.selected,defaultSelected:element.defaultSelected,disabled:element.disabled}
  :element instanceof HTMLTextAreaElement?{value:element.value,defaultValue:element.defaultValue,rows:element.rows,placeholder:element.placeholder}
  :element instanceof HTMLButtonElement?{type:element.type,disabled:element.disabled,value:element.value}:null;
 return {type:node.nodeType,name:node.nodeName,text:node.nodeValue,namespace:element?.namespaceURI??null,attrs:element?[...element.attributes].map(a=>[a.namespaceURI,a.name,a.value]):[],defaults,children:[...node.childNodes].map(tree)};
}
function box(html:string):HTMLElement{const host=document.createElement('main');host.innerHTML=html;normalizeManualFormDOM(host);return host;}
function input(spec:typeof native[number]['spec']):ManualEntryInput {
 return {...spec,category:()=>spec.category,name:()=>spec.name,unit:()=>spec.unit,unitPicker:projectManualEntryUnits(spec.options,()=>spec.unit),
  closeAction:()=>({action:'show-detail-modal',id:spec.id}),saveAction:()=>({action:'save-manual-entry',id:spec.id}),addAction:()=>({action:'save-and-add-manual-entry',id:spec.id}),cancelAction:()=>({action:'show-detail-modal',id:spec.id})};
}
it.each(native)('retains complete native form tree, ordered fields/defaults/attributes and literal values: $name',record=>{
 expect(tree(box(renderManualMarkerEntry(input(record.spec))))).toEqual(tree(box(record.html)));
});
it.each(['category','close','name','unit','save','add','cancel'])('retains the current first failure at %s without producing a partial form',fault=>{
 const expected=['category','close','name','unit','save','add','cancel'],trace:string[]=[];
 const read=(name:string)=>{trace.push(name);if(name===fault)throw new Error('fault:'+name);};
 const spec=native[0]!.spec;
 const fixture:ManualEntryInput={...input(spec),category:()=>{read('category');return spec.category;},closeAction:()=>{read('close');return {action:'show-detail-modal',id:spec.id};},name:()=>{read('name');return spec.name;},unit:()=>{read('unit');return spec.unit;},saveAction:()=>{read('save');return {action:'save-manual-entry',id:spec.id};},addAction:()=>{read('add');return {action:'save-and-add-manual-entry',id:spec.id};},cancelAction:()=>{read('cancel');return {action:'show-detail-modal',id:spec.id};}};
 expect(()=>renderManualMarkerEntry(fixture)).toThrow('fault:'+fault);expect(trace).toEqual(expected.slice(0,expected.indexOf(fault)+1));
});
it.each(['ManualMarkerEntry','ManualMarkerEntryUnits','CustomMarkerForm','CustomMarkerOptions'])('%s owns genuine form children without HTML/coordinate protocols',name=>{
 const source=readFileSync(new URL('../js/components/'+name+'.svelte',import.meta.url),'utf8');
 expect(source).not.toMatch(/\{@html|private-action|private-reference|private-units|OptionsHTML|ManualEntryHTML|\.svelte\.html\.js/);
 function visit(value:unknown):void{if(!value||typeof value!=='object')return;if('type'in value){expect(value.type).not.toBe('HtmlTag');expect(value.type).not.toBe('EventDirective');}for(const child of Object.values(value))if(Array.isArray(child))child.forEach(visit);else visit(child);}
 visit(parse(source,{modern:true}));
});
it('retains the exact retired protocol source/assertions as history, separately from active current controls',()=>{
 const bytes=readFileSync(path.join(import.meta.dirname,'fixtures/manual-forms-retired-protocol.json'));
 expect(createHash('sha256').update(bytes).digest('hex')).toBe('17a1e8f1f4de1beb19bcd506f1ac3146583bb5483f2433e5a8a32383042f1709');
 const source:unknown=JSON.parse(bytes.toString());
 if(!source||typeof source!=='object'||!('tests/custom-marker-presentation.test.ts'in source)||!('tests/manual-marker-entry-presentation.test.ts'in source))throw new Error('Missing exact retired protocol source');
 expect(Object.keys(source)).toHaveLength(8);
 expect(source['tests/custom-marker-presentation.test.ts']).toContain('rejects compiler return corruption');
 expect(source['tests/manual-marker-entry-presentation.test.ts']).toContain('view.reference');
});
it.each(['unknown comment','whitespace','attribute order','control value'])('preserves observable current %s corruption beyond inert compiler anchors',kind=>{
 const html=native[0]!.html;
 const changed=kind==='unknown comment'?html+'<!--[99-->':kind==='whitespace'?html.replace('Add Value Manually','Add Value  Manually'):kind==='attribute order'?html.replace('type="date" id="me-date"','id="me-date" type="date"'):html.replace('id="me-value"','id="me-value" value="7"');
 expect(tree(box(changed))).not.toEqual(tree(box(html)));
});
