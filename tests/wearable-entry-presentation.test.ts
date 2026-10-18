// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {describe,it,expect,vi} from 'vitest';
import * as pickerCompiler from '../js/components/WearableSourcePicker.svelte.html.js';
import {parse} from 'svelte/compiler';
import {expectedWearableEntryHTML} from './helpers/wearable-entry-ssr-expectations.js';
import {renderWearableManualLog,renderWearableNoteField,renderWearableTagChips,renderWearableSourcePicker,projectWearableNoteField,projectWearableTagChips} from '../js/wearables-entry-presentation.js';
import type {ManualLogInput} from '../js/wearables-entry-presentation.js';
interface Input {scope:string;kind:string;unit:string;noteId?:string|null;label?:string;names?:string[];override?:string}
interface Fixture {name:string;input:Input;html:string;tree:unknown;controls:unknown;error:string|null}
const fixtures=JSON.parse(readFileSync('tests/fixtures/wearable-entry-original.json','utf8')) as {cases:Fixture[]};
function candidate(input:Input){
 if(input.scope==='tags')return renderWearableTagChips(input.kind);
 if(input.scope==='note')return renderWearableNoteField(input.noteId);
 if(input.scope==='picker')return renderWearableSourcePicker({label:()=>input.label,ids:['one','two'],current:'one',name:id=>input.names?.[id==='one'?0:1],automatic:()=>input.override});
 const detail=input.scope==='detail',kind=input.kind.startsWith('bp_')?'bp':input.kind;
 const mode=(detail?'detail-':'strip-')+kind as ManualLogInput['mode'];
 const noteId=detail?'wlad-note':'wl-'+kind+'-note';
 return renderWearableManualLog({mode,today:'2001-02-03',
   ...(kind==='weight'?{placeholder:()=>input.unit==='US'?'lb':'kg',label:()=>detail?(input.unit==='US'?'pounds':'kilograms'):(input.unit==='US'?'Weight in pounds':'Weight in kilograms')}:{tags:()=>projectWearableTagChips(kind==='bp'?'bp_systolic':'rhr')}),
   note:()=>projectWearableNoteField(noteId),
   form:()=>`data-wearable-form="detail-manual-add" data-wearable-metric="${input.kind}" data-wearable-kind="${kind}"`,
   save:()=>`data-wearable-action="manual-log-save" data-wearable-kind="${kind}"`,
   cancel:()=>`data-wearable-action="${detail?'close-detail-manual-add':'manual-log-cancel'}"`,
 });
}
function tree(html:string){const host=document.createElement('div');host.innerHTML=html;
 const row=(node:Node):unknown=>({type:node.nodeType,name:node.nodeName,namespace:node instanceof Element?node.namespaceURI:null,value:node.nodeValue,...(node instanceof Element?{attrs:Array.from(node.attributes,a=>[a.name,a.value])}:{}),children:Array.from(node.childNodes,row)});
 return Array.from(host.childNodes,row);
}
function handlers(source:string){const found:string[]=[];const visit=(value:unknown)=>{
 if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(visit);return;}
 const node=value as Record<string,unknown>;
 if(node.type==='OnDirective'||node.type==='EventHandler'||node.type==='Attribute'&&typeof node.name==='string'&&/^on[a-z]/i.test(node.name))found.push(String(node.name));
 Object.values(node).forEach(visit);
 };visit(parse(source,{modern:true}));return found;}
describe('Wearable original presentation and native defaults',()=>{
 it('requires actual complete original fixtures',()=>{expect(fixtures.cases).toHaveLength(24);expect(new Set(fixtures.cases.map(v=>v.name)).size).toBe(24);});
 it.each(fixtures.cases)('preserves full original native parser: $name',fixture=>{
  if(fixture.error){expect(()=>candidate(fixture.input)).toThrow('tags.map is not a function');return;}
  const html=candidate(fixture.input);
  const expected=expectedWearableEntryHTML(fixture.input,fixture.html);
  expect(html).toBe(expected);
  expect(tree(html)).toStrictEqual(tree(expected));
  expect(tree(fixture.html)).toStrictEqual(fixture.tree);
  const host=document.createElement('div'); host.innerHTML=html;
  expect(Array.from(host.querySelectorAll('input,select,textarea,button'),n=>({tag:n.tagName,type:'type'in n?String(n.type):null,value:'value'in n?String(n.value):null,defaultValue:'defaultValue'in n?String(n.defaultValue):null,required:'required'in n?n.required:null,form:n instanceof HTMLButtonElement?n.form?.className??null:null}))).toStrictEqual(fixture.controls);
 });
 it('keeps strip Weight two separate unit reads and all callback order',()=>{
  const reads:string[]=[];let units=0;
  const html=renderWearableManualLog({mode:'strip-weight',today:'2001-02-03',placeholder:()=>{reads.push('placeholder');return ++units===1?'lb':'kg';},label:()=>{reads.push('label');return ++units===2?'Weight in kilograms':'Weight in pounds';},note:()=>{reads.push('note');return projectWearableNoteField('wl-weight-note');},save:()=>{reads.push('save');return 'data-wearable-action="manual-log-save" data-wearable-kind="weight"';},cancel:()=>{reads.push('cancel');return 'data-wearable-action="manual-log-cancel"';}});
  expect(reads).toEqual(['placeholder','label','note','save','cancel']);const host=document.createElement('div');host.innerHTML=html;const value=host.querySelector('input')!;expect(value.placeholder).toBe('lb');expect(value.getAttribute('aria-label')).toBe('Weight in kilograms');
 });
 it('throws before later template callbacks without producing partial markup',()=>{
  const reads:string[]=[];expect(()=>renderWearableManualLog({mode:'strip-weight',today:'2001-02-03',placeholder:()=>{throw new Error('unit getter');},label:()=>{reads.push('label');return '';},note:()=>{reads.push('note');return projectWearableNoteField();},save:()=>'',cancel:()=>''})).toThrow('unit getter');expect(reads).toEqual([]);
 });
 it('keeps picker label then ordered source names then Auto override read',()=>{
  const reads:string[]=[];renderWearableSourcePicker({label:()=>{reads.push('label');return 'Weight';},ids:['one','two'],current:'two',name:id=>{reads.push(id);return id;},automatic:()=>{reads.push('override');return 'two';}});expect(reads).toEqual(['label','one','two','override']);
 });
 it('escaped values cannot collide with private source/check markers or create handlers',()=>{
  const id='<!---->getbased-wearable-private-check<!---->',html=renderWearableSourcePicker({label:()=>'<script>unsafe</script>',ids:[id,'two'],current:id,name:()=>'<button onclick="unsafe">',automatic:()=>null});const host=document.createElement('div');host.innerHTML=html;expect(host.querySelectorAll('button')).toHaveLength(3);expect(host.querySelector('script')).toBeNull();expect(host.querySelector('[onclick]')).toBeNull();expect(host.querySelector('[data-source]')?.getAttribute('data-source')).toBe(id);
 });
 it.each([
  ['WearableManualLog',0,[]],
  ['WearableSourcePicker',0,[]],
 ] as const)('genuine %s accepts no raw HTML child slots', (name,count,allowed)=>{
  const expressions:string[]=[];
  const visit=(value:unknown)=>{
   if(!value||typeof value!=='object')return;
   if(Array.isArray(value)){value.forEach(visit);return;}
   const node=value as Record<string,unknown>;
   if(node.type==='HtmlTag'){
    const expression=node.expression as {type:string;object?:{name?:string};property?:{name?:string}};
    expect(expression.type).toBe('MemberExpression');
    expressions.push(expression.object?.name+'.'+expression.property?.name);
   }
   Object.values(node).forEach(visit);
  };
  visit(parse(readFileSync('js/components/'+name+'.svelte','utf8'),{modern:true}));
  expect(expressions).toHaveLength(count);
  expect(expressions.every(expression=>(allowed as readonly string[]).includes(expression))).toBe(true);
 });
 it.each(['WearableManualLog','WearableSourcePicker'])('keeps authored %s free of event attributes',name=>{expect(handlers(readFileSync('js/components/'+name+'.svelte','utf8'))).toEqual([]);});
 it.each(['<button onclick="run()">x</button>','<button onclick={run}>x</button>','<button on:click|preventDefault={run}>x</button>','<button on:click>x</button>','<button {onclick}>x</button>'])('rejects actual event attribute syntax: %s',source=>{expect(handlers(source)).not.toEqual([]);});
 it('complete original parser comparator rejects text/attribute/default/form corruption',()=>{
  const fixture=fixtures.cases.find(v=>v.input.scope==='detail'&&v.input.kind==='weight')!,html=candidate(fixture.input);
  const expectedTree=tree(expectedWearableEntryHTML(fixture.input,fixture.html));
  expect(tree(html)).toEqual(expectedTree);
  for(const changed of [html.replace('Save','Save!'),html.replace('step="0.1"','step="1"'),html.replace('type="submit"','type="button"'),html.replace('<form','<div').replace('</form>','</div>')]){expect(tree(changed)).not.toEqual(fixture.tree);expect(tree(changed)).not.toEqual(expectedTree);}
 });
});


describe('Wearable source picker private opening-tag boundaries', () => {
  const sourceAttribute = 'data-source="getbased-wearable-private-source-id"';
  const tag = (selected: boolean) => `<button type="button" class="wearable-source-picker-item${selected ? ' selected' : ''}" ${sourceAttribute}>`;
  const cases = [true, false].flatMap(selected => [sourceAttribute, tag(true), tag(false), '<!---->getbased-wearable-private-check<!---->'].map(name => ({selected, name})));
  it.each(cases)('retains literal source-name text without private-coordinate collisions: $selected / $name', ({selected, name}) => {
    const trace: string[] = [];
    const html = renderWearableSourcePicker({
      label: () => { trace.push('label'); return 'Weight'; },
      ids: ['one', 'two'], current: selected ? 'one' : 'two',
      name: id => { trace.push(id); return id === 'one' ? name : 'Other'; },
      automatic: () => { trace.push('override'); return 'one'; },
    });
    const host = document.createElement('div'); host.innerHTML = html;
    expect(trace).toEqual(['label', 'one', 'two', 'override']);
    expect(host.querySelectorAll('button')).toHaveLength(3);
    const first = host.querySelector('button')!;
    expect(first.querySelector('span')?.textContent).toBe(name);
    expect(first.getAttribute('data-source')).toBe('one');
    expect(first.classList.contains('selected')).toBe(selected);
    expect(host.querySelector('[data-wearable-private-source-id]')).toBeNull();
    expect(host.querySelectorAll('.wearable-source-picker-check')).toHaveLength(1);
  });
  it.each(['missing', 'duplicate'] as const)('exact current graph comparator rejects %s owned source tag', kind => {
    const fixture=fixtures.cases.find(row=>row.name==='picker-weight-21')!;
    const expected=expectedWearableEntryHTML(fixture.input,fixture.html);
    expect(candidate(fixture.input)).toBe(expected);
    expect(tree(candidate(fixture.input))).toStrictEqual(tree(expected));
    const actual = pickerCompiler.renderHTML;
    const spy = vi.spyOn(pickerCompiler, 'renderHTML').mockImplementation(props => {
      const html = actual(props);
      const opening='<button type="button" class="wearable-source-picker-item selected" data-source="one">';
      expect(html.split(opening)).toHaveLength(2);
      return html.replace(opening, kind === 'missing' ? opening.replace('data-source=', 'data-foreign=') : opening + opening);
    });
    try {
      const changed=candidate(fixture.input);
      expect(changed).not.toBe(expected);
      expect(() => expect(changed).toBe(expected)).toThrow();
      expect(() => expect(tree(changed)).toStrictEqual(tree(expected))).toThrow();
    } finally { spy.mockRestore(); }
  });
});
