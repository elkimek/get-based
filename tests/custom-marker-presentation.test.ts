import {normalizeManualFormDOM} from './helpers/manual-forms-dom.js';
// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest';
import original from './fixtures/custom-marker-original.json' with {type:'json'};
import {renderCustomMarkerForm, renderCustomMarkerOptions} from '../js/custom-marker-presentation.js';
const fixture = vi.hoisted(() => ({alter: (_owner:string, raw:string) => raw}));
vi.mock('../js/components/CustomMarkerForm.svelte.html.js', async importActual => {
  const actual = await importActual<typeof import('../js/components/CustomMarkerForm.svelte.html.js')>();
  return {renderHTML: (props: Parameters<typeof actual.renderHTML>[0]) => fixture.alter('form',actual.renderHTML(props))};
});
vi.mock('../js/components/CustomMarkerOptions.svelte.html.js', async importActual => {
  const actual = await importActual<typeof import('../js/components/CustomMarkerOptions.svelte.html.js')>();
  return {renderHTML: (props: Parameters<typeof actual.renderHTML>[0]) => fixture.alter('options',actual.renderHTML(props))};
});
afterEach(() => {fixture.alter = (_owner,raw) => raw;});
function tree(node:Node):unknown {
  const element = node instanceof Element ? node : null;
  const defaults = element instanceof HTMLInputElement ? {type:element.type,value:element.value,defaultValue:element.defaultValue,disabled:element.disabled,required:element.required,autofocus:element.autofocus}
    : element instanceof HTMLSelectElement ? {type:element.type,value:element.value,selectedIndex:element.selectedIndex,disabled:element.disabled,multiple:element.multiple,required:element.required}
    : element instanceof HTMLOptionElement ? {value:element.value,selected:element.selected,defaultSelected:element.defaultSelected,disabled:element.disabled}
    : element instanceof HTMLButtonElement ? {type:element.type,value:element.value,disabled:element.disabled} : null;
  return {type:node.nodeType,name:node.nodeName,text:node.nodeValue,namespace:element?.namespaceURI??null,
    attrs:element ? Array.from(element.attributes,a=>[a.namespaceURI,a.name,a.value]) : [], defaults,
    children:Array.from(node.childNodes,tree)};
}
function box(html:string):HTMLDivElement {const result=document.createElement('div');result.className='modal gb-form-modal marker-form-modal';result.innerHTML=html;return result;}
// Only these seven fixed presentation attributes moved to scoped CSS. Preserve
// ordered attributes, every Text/comment node and native control defaults.
function restoreFixedStyles(root:HTMLElement):void {
  const row=root.querySelector('#cm-new-cat-row');expect(row?.getAttribute('style')).toBe('display:none');row?.setAttribute('style','display:none;margin-top:6px;gap:8px;align-items:center');
  const icon=root.querySelector('#cm-new-cat-icon');expect(icon).not.toBeNull();expect(icon?.hasAttribute('style')).toBe(false);
  if (!icon) throw new Error('Missing category icon');
  const attrs=Array.from(icon.attributes,a=>[a.name,a.value] as const);expect(attrs.slice(0,2)).toEqual([['id','cm-new-cat-icon'],['title','Pick icon']]);
  for(const attr of attrs)icon.removeAttribute(attr[0]);
  attrs.forEach((attr,index)=>{if(index===2)icon.setAttribute('style','cursor:pointer;font-size:20px;min-width:28px;text-align:center');icon.setAttribute(attr[0],attr[1]);});
  const name=root.querySelector('#cm-new-cat');expect(name ? Array.from(name.attributes,a=>[a.name,a.value]):null).toEqual([['type','text'],['id','cm-new-cat'],['placeholder','Category name']]);name?.setAttribute('style','flex:1');
  const ranges=root.querySelectorAll('.cm-range-row');expect(ranges).toHaveLength(2);
  for(const range of ranges){expect(range.tagName).toBe('DIV');expect(Array.from(range.attributes,a=>[a.name,a.value])).toEqual([['class','cm-range-row']]);range.removeAttribute('class');range.setAttribute('style','display:flex;gap:8px');}
  const dividers=root.querySelectorAll('.cm-range-divider');expect(dividers).toHaveLength(2);
  for(const divider of dividers){expect(divider.tagName).toBe('SPAN');expect(Array.from(divider.attributes,a=>[a.name,a.value])).toEqual([['class','cm-range-divider']]);expect(divider.textContent).toBe('–');divider.removeAttribute('class');divider.setAttribute('style','line-height:36px');}
}
describe('authored custom marker presentation',()=>{
  it.each(original.map((record,index)=>({record,index})).filter(({index})=>index!==4))('retains whole native tree and defaults for original case $index',({record})=>{
    const current=box(renderCustomMarkerForm(record.categories));restoreFixedStyles(current);
    const before=box(record.originalHTML);normalizeManualFormDOM(current);normalizeManualFormDOM(before);expect(tree(current)).toEqual(tree(before));
  });
  it('reads category values first, then labels in entry order, and preserves coercion failure',()=>{
    const calls:string[]=[];
    const categories={
      get a(){calls.push('a');return {get label(){calls.push('label-a');return {toString(){calls.push('coerce-a');return 'A';}};}};},
      get b(){calls.push('b');return {get label(){calls.push('label-b');throw new Error('native label');}};}
    };
    expect(()=>renderCustomMarkerForm(categories)).toThrow('native label');
    expect(calls).toEqual(['a','b','label-a','coerce-a','label-b']);
  });
  it('preserves every category key literally without turning a quote into a second attribute',()=>{
    const key='gb-custom-marker-option-0-value" data-fixture="raw';
    const label='gb-custom-marker-option-0-label <!----> $& <>';
    const options=box('<select>'+renderCustomMarkerOptions({[key]:{label}})+'</select>');
    const option=options.querySelector('option');expect(option?.value).toBe(key);expect(option?.textContent).toBe(label);
    expect(option?.hasAttribute('data-fixture')).toBe(false);
    const record=original[4]!;const form=box(renderCustomMarkerForm(record.categories));
    expect(form.querySelector('option')?.value).toBe(Object.keys(record.categories)[0]);
    expect(form.querySelector('option')?.hasAttribute('data-fixture')).toBe(false);
  });
  it.each([
    ['wrong action',(raw:string)=>raw.replace('data-marker-detail-action="save-custom-marker"','data-marker-detail-action="foreign"')],
    ['changed label',(raw:string)=>raw.replace('Create New Biomarker','Changed form')],
    ['injected element',(raw:string)=>raw.replace('</div>','<img src=x></div>')],
    ['extra unknown comment',(raw:string)=>raw+'<!--[99-->'],
    ['changed numeric default',(raw:string)=>raw.replace('id="cm-ref-min"','id="cm-ref-min" value="4"')],
    ['changed button default',(raw:string)=>raw.replace('type="button" class="import-btn import-btn-primary"','type="submit" class="import-btn import-btn-primary"')],
  ] as const)('keeps actual serializer/DOM corruption observable: %s',(_name,alter)=>{
    const baseline=box(renderCustomMarkerForm({a:{label:'A'}}));normalizeManualFormDOM(baseline);
    fixture.alter=(owner,raw)=>owner==='form'?alter(raw):raw;
    const current=box(renderCustomMarkerForm({a:{label:'A'}}));normalizeManualFormDOM(current);
    expect(tree(current)).not.toEqual(tree(baseline));
  });
  it.each(['style="display:none;position:fixed"','class="unexpected"'])('rejects unqualified fixed attribute mutation: %s',replacement=>{
    const current=box(renderCustomMarkerForm({}));current.querySelector('#cm-new-cat-row')?.setAttribute(replacement.startsWith('style')?'style':'class',replacement.startsWith('style')?'display:none;position:fixed':'unexpected');
    expect(()=>{restoreFixedStyles(current);expect(tree(current)).toEqual(tree(box(original[0]!.originalHTML)));}).toThrow();
  });
});
