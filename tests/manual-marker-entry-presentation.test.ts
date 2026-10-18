import {describe, expect, it} from 'vitest';
import {JSDOM} from 'jsdom';
import {renderManualEntryUnits, renderManualMarkerEntry, projectManualEntryUnits,
  type ManualEntryInput} from '../js/manual-marker-entry-presentation.js';
import {parse as parseSvelte} from 'svelte/compiler';
import fs from 'node:fs';

const input = (overrides: Partial<ManualEntryInput> = {}): ManualEntryInput => ({
  category: () => 'Biochemistry', closeAction: () => ({action:'show-detail-modal',id:'bio_glucose'}),
  name: () => 'Glucose', unit: () => 'mmol/L', reference: ' · Reference: 4 – 6 mmol/L',
  date: '2026-10-11', today: '2026-10-11', unitPicker: projectManualEntryUnits(['mmol/L', 'mg/dL'], () => 'unused'),
  placeholder: 'e.g. 5.00', sampleTime: '08:15', fasting: 'fasting',
  saveAction: () => ({action:'save-manual-entry',id:'bio_glucose'}),
  addAction: () => ({action:'save-and-add-manual-entry',id:'bio_glucose'}),
  cancelAction: () => ({action:'show-detail-modal',id:'bio_glucose'}), ...overrides,
});
function native(html: string) {
  const d = new JSDOM('').window.document, t = d.createElement('template');
  t.innerHTML = html; return t.content;
}
function authoredFacts(value: unknown, events: string[] = [], raw: string[] = []) {
  if (!value || typeof value !== 'object') return {events, raw};
  const node = value as {type?: string; name?: string; expression?: {type?: string; object?: {name?: string}; property?: {name?: string}}};
  if ((node.type === 'Attribute' && /^on/i.test(node.name || '')) || node.type === 'OnDirective' || node.type === 'EventHandler') events.push(node.name || node.type);
  if (node.type === 'HtmlTag') {
    const e = node.expression;
    raw.push(e?.type === 'MemberExpression' ? `${e.object?.name}.${e.property?.name}` : 'UNQUALIFIED');
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach(item => authoredFacts(item, events, raw));
    else authoredFacts(child, events, raw);
  }
  return {events, raw};
}
describe('manual marker entry owned presentation', () => {
  it('retains all native form IDs, numeric/date/time defaults and actions', () => {
    const root = native(renderManualMarkerEntry(input()));
    const date = root.querySelector<HTMLInputElement>('#me-date')!;
    const value = root.querySelector<HTMLInputElement>('#me-value')!;
    expect([date.type, date.value, date.defaultValue, date.max]).toEqual(['date','2026-10-11','2026-10-11','2026-10-11']);
    expect([value.type, value.step, value.value, value.defaultValue, value.autofocus, value.required]).toEqual(['number','any','','',true,false]);
    expect(root.querySelector<HTMLInputElement>('#me-sample-time')!.value).toBe('08:15');
    expect(root.querySelector<HTMLTextAreaElement>('#me-note')!.rows).toBe(2);
    expect([...root.querySelectorAll<HTMLButtonElement>('button')].map(b => [b.type,b.dataset.markerDetailAction,b.dataset.markerDetailId])).toEqual([
      ['submit','show-detail-modal','bio_glucose'],['submit','save-manual-entry','bio_glucose'],
      ['submit','save-and-add-manual-entry','bio_glucose'],['submit','show-detail-modal','bio_glucose'],
    ]);
  });
  it('retains first input-unit selection and every independent option default', () => {
    const root = native(renderManualEntryUnits(['mmol/L','mg/dL','mg/L'], () => {throw new Error('unused');}));
    const select = root.querySelector<HTMLSelectElement>('#me-unit')!;
    expect([select.value,select.selectedIndex,...[...select.options].map(o => o.defaultSelected)]).toEqual(['mmol/L',0,true,false,false]);
  });
  it('retains fallback unit for both zero and one available unit', () => {
    for (const options of [[], ['ignored']]) {
      const root = native(renderManualEntryUnits(options, () => 'mmol/L'));
      expect(root.querySelector('select')).toBeNull(); expect(root.textContent).toBe('(mmol/L)');
    }
  });
  it('preserves two ordered option coercions and fallback getter isolation', () => {
    const trace: string[] = []; let n = 0;
    const unit = {toString() {trace.push('unit'); return String(++n);}};
    expect(projectManualEntryUnits([unit, 'x'], () => {trace.push('fallback'); return ''}).rows[0]).toEqual({value:'1',label:'2',selected:true});
    expect(trace).toEqual(['unit','unit']);
  });
  it('keeps all three fasting selections and native defaultSelected values', () => {
    for (const fasting of ['unknown','fasting','not-fasting']) {
      const select = native(renderManualMarkerEntry(input({fasting}))).querySelector<HTMLSelectElement>('#me-fasting')!;
      expect(select.value).toBe(fasting);
      expect([...select.options].filter(o => o.defaultSelected).map(o => o.value)).toEqual([fasting]);
    }
  });
  it('escapes supplied labels, units and control attributes without event or element injection', () => {
    const attack = `<img src=x onerror=alert(1)>"&'雪`;
    const root = native(renderManualMarkerEntry(input({category:()=>attack,name:()=>attack,unit:()=>attack,placeholder:attack,sampleTime:attack,
      unitPicker:projectManualEntryUnits([attack,'second'],()=>attack)})));
    expect(root.querySelector('.gb-modal-kicker')!.textContent).toBe(attack);
    expect(root.querySelector('strong')!.textContent).toBe(attack);
    expect(root.querySelector<HTMLInputElement>('#me-value')!.placeholder).toBe(attack);
    expect(root.querySelectorAll('img,script,[onerror]')).toHaveLength(0);
    expect(root.querySelector<HTMLOptionElement>('option')!.value).toBe(attack);
  });
  it('retains category/action/name/unit and tail-action chronology and atomic throws', () => {
    const trace: string[] = [];
    const data = input({category:()=>{trace.push('category');return 'C'},closeAction:()=>{trace.push('close');return ({action:'show-detail-modal',id:'x_y'})},
      name:()=>{trace.push('name');return 'N'},unit:()=>{trace.push('unit');return 'U'},saveAction:()=>{trace.push('save');return ({action:'save-manual-entry',id:'x_y'})},
      addAction:()=>{trace.push('add');return ({action:'save-and-add-manual-entry',id:'x_y'})},cancelAction:()=>{trace.push('cancel');return ({action:'show-detail-modal',id:'x_y'})}});
    renderManualMarkerEntry(data); expect(trace).toEqual(['category','close','name','unit','save','add','cancel']);
    trace.length=0;
    expect(()=>renderManualMarkerEntry({...data,name:()=>{throw new Error('name failed')}})).toThrow('name failed');
    expect(trace).toEqual(['category','close']);
  });
  it('never rescans inserted reference text or escaped metadata resembling private sentinels', () => {
    const reference='<!--literal-child-comment-->getbased-manual-entry-private-units';
    const root=native(renderManualMarkerEntry(input({reference,category:()=> 'getbased-manual-entry-private-reference'})));
    expect(root.querySelector('.gb-modal-kicker')!.textContent).toBe('getbased-manual-entry-private-reference');
    expect(root.querySelector('.modal-unit')!.textContent).toContain(reference);
    expect(root.querySelector('.modal-unit')!.innerHTML).not.toContain('<!--literal-child-comment-->');
    expect(root.querySelector('.modal-unit')!.textContent).toContain('getbased-manual-entry-private-units');
  });
  it('retains arbitrary escaped metadata matching every private action marker', () => {
    const markers = Array.from({length: 4}, (_, i) => `data-manual-entry-private-action="getbased-manual-entry-action-${i}"`);
    const hostile = markers.join(' ') + ' getbased-manual-entry-private-reference getbased-manual-entry-private-units';
    const root = native(renderManualMarkerEntry(input({category:()=>hostile,name:()=>hostile,unit:()=>hostile,
      unitPicker:projectManualEntryUnits([hostile,'second'],()=>hostile)})));
    expect(root.querySelector('.gb-modal-kicker')!.textContent).toBe(hostile);
    expect(root.querySelector('strong')!.textContent).toBe(hostile);
    expect(root.querySelector('.modal-unit')!.textContent).toContain(hostile);
    expect(root.querySelector<HTMLOptionElement>('#me-unit option')!.value).toBe(hostile);
    expect([...root.querySelectorAll('[data-marker-detail-action]')].map(e=>e.getAttribute('data-marker-detail-action')))
      .toEqual(['show-detail-modal','save-manual-entry','save-and-add-manual-entry','show-detail-modal']);
    expect(root.querySelector('[data-manual-entry-private-action]')).toBeNull();
  });
  it('rejects malformed delegated fragments before exposing any generated HTML', () => {
    expect(()=>renderManualMarkerEntry(input({saveAction:()=> ({action:'save-manual-entry',id:''})}))).toThrow('delegated action');
  });
  it('enumerates every authored raw slot and rejects added handlers/unknown raw input', () => {
    const form=fs.readFileSync(new URL('../js/components/ManualMarkerEntry.svelte',import.meta.url),'utf8');
    const units=fs.readFileSync(new URL('../js/components/ManualMarkerEntryUnits.svelte',import.meta.url),'utf8');
    expect(authoredFacts(parseSvelte(form,{modern:true}))).toEqual({events:[],raw:[]});
    expect(authoredFacts(parseSvelte(units,{modern:true}))).toEqual({events:[],raw:[]});
    for (const authored of ['<button onclick="bad"></button>','<button onclick={bad}></button>','<button on:click|preventDefault={bad}></button>','<button on:click></button>'])
      expect(authoredFacts(parseSvelte(authored,{modern:true})).events).toHaveLength(1);
    expect(authoredFacts(parseSvelte(form+'{@html view.name}',{modern:true})).raw).toEqual(['view.name']);
  });
});
