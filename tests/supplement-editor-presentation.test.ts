import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import { escapeHTML } from '../js/utils.js';
import { renderSupplementEditor } from '../js/supplement-editor-presentation.js';
import { renderSupplementImpactView } from '../js/supplement-impact-presentation.js';
import { projectSupplementFormView } from '../js/supplement-form-ui.js';
import { renderSupplementForm } from '../js/supplement-form-presentation.js';
import type { FormSupplementReader } from '../js/supplement-form-ui.js';

const fixture: { source: string; sha256: string } = JSON.parse(fs.readFileSync(new URL('./fixtures/supplement-editor-original.json', import.meta.url), 'utf8'));
expect(createHash('sha256').update(fixture.source).digest('hex')).toBe('a6f7b8d1e67df03eacd0eb6af41008c296a9d30bd8cf0406351d34f118e95b8a');
const currentSource = fs.readFileSync(new URL('../js/supplements.js', import.meta.url), 'utf8');
const currentProcedure = currentSource.slice(currentSource.indexOf('function supplementEditorText('), currentSource.indexOf('export function showAddSuppForm(')).replace(/^export /gm, '');
const originalProcedure = stripTypeScriptTypes(fixture.source).replace(/^export /gm, '');
function tree(node: Node): unknown {
  if (node.nodeType === 8) return ['', '[', ']', '[0', '[1', '[-1', '[!'].includes(node.nodeValue ?? '') ? undefined : { comment: node.nodeValue };
  if (node.nodeType === 3) return node.textContent || undefined;
  const el = node as Element, children: unknown[] = [];
  for (const child of node.childNodes) {
    const next = tree(child); if (next === undefined) continue; const last = children.at(-1);
    if (typeof last === 'string' && typeof next === 'string') children[children.length - 1] = last + next; else children.push(next);
  }
  return { tag: el.tagName, attrs: [...el.attributes].map(a => [a.name, a.value]),
    defaults: ['BUTTON','INPUT','SELECT','OPTION','TEXTAREA'].includes(el.tagName) ? {
      type: (el as HTMLInputElement).type, value: (el as HTMLInputElement).value,
      checked: (el as HTMLInputElement).checked, defaultValue: (el as HTMLInputElement).defaultValue,
      defaultChecked: (el as HTMLInputElement).defaultChecked, disabled: (el as HTMLInputElement).disabled,
      selected: (el as HTMLOptionElement).selected, defaultSelected: (el as HTMLOptionElement).defaultSelected,
    } : null, children };
}
interface Case { records: Array<Record<string, unknown>>; edit?: number; quality?: boolean; missing?: boolean }
function run(source: string, input: Case, failAt = Infinity) {
  const trace: string[] = []; const read = (label: string) => { trace.push(label); if (trace.length === failAt) throw new Error('fault:' + label); };
  const records = input.records.map((record, index) => new Proxy(structuredClone(record), {
    get(target, key, receiver) { read(`row${index}:${String(key)}`); return Reflect.get(target, key, receiver); },
  }));
  let html = 'previous'; const dataset: Record<string, string> = {};
  const modal = { dataset, set innerHTML(value: string) { read('modal-html'); html = value; } };
  const overlay = {}, timers: Array<()=>unknown> = [];
  const impact = (record: unknown, index: number) => { read(`impact:${index}`); expect(record).toBe(records[index]); return { kind: 'hint' as const, hint: 'Native impact child' }; };
  const form = (index: number, record: FormSupplementReader) => { read(`form:${index}`); return projectSupplementFormView(index, record); };
  let error: string | null = null;
  try { vm.runInNewContext(source + '\nopenSupplementsEditor(editIndex);', {
    state: { importedData: { supplements: records } }, editIndex: input.edit, escapeHTML,
    renderSupplementEditor, projectSupplementImpact: impact, projectSupplementFormView: form,
    renderSupplementImpact: (record: unknown, index: number) => renderSupplementImpactView(impact(record,index)),
    suppFormHtml: (index: number, record: FormSupplementReader) => renderSupplementForm(form(index,record)),
    clearPendingSupplementImport() { read('clear-import'); },
    suppActionAttrs(action: string, extra = '') { read('action:' + action); return `data-supp-action="${action}"${extra ? ' ' + extra : ''}`; },
    getSupplementStatus(record: Record<string, unknown>) { read('status'); return record.status || 'active'; },
    aggregateSupplementContaminants(current: unknown[]) { read('aggregate:' + current.length); return input.quality ? [{entries:[{product:'<Product>&',test:'ND'}],exactMcgPerDay:0,upperMcgPerDay:1,summableCount:1,reportedCount:2,analyte:'lead'}] : []; },
    formatSupplementQualityResult(value: unknown) { read('quality-result'); return value; },
    formatContaminantMass(value: number) { read('mass'); return `${value} mcg/day`; },
    getSupplementPeriods(record: Record<string, unknown>) { read('periods'); return record.periods || [{start:'2024-01-01',end:null}]; },
    sourceUrlParts(value: unknown) { read('source-url'); return value ? {url:String(value),host:'example.test'} : null; },
    localDateKey() { read('today'); return '2024-02-01'; },
    supplementDoseText(value: unknown) { read('dose'); return value ? String(value) : ''; },
    isSupplementQualityIncludedInAI() { read('quality-ai'); return true; },
    ingredientDailyTotal(ingredient: Record<string, unknown>) { read('daily-total'); return ingredient.amount ? {value:10,unit:'mg'} : null; },
    effectiveTimesPerDay() { read('frequency'); return 2; },
    formatSupplementTotal() { read('total'); return '10 mg/day'; },
    rememberSupplementForm() { read('remember'); },
    getConfiguredArrayItemId(_kind: string, record: Record<string, unknown>) { read('record-id'); return record.id || ''; },
    openModalOverlay(value: unknown) { read('open'); expect(value).toBe(overlay); },
    setTimeout(callback: ()=>unknown, delay: number) { read('timeout:' + delay); timers.push(callback); },
    document: { getElementById(id: string) { read('find:' + id); return input.missing ? null : id==='detail-modal' ? modal : overlay; },
      querySelector() { read('scroll-target'); return { scrollIntoView() { read('scroll'); } }; } },
  }); for (const timer of timers) timer(); } catch (failure) { error = String(failure); }
  const dom = new JSDOM(html); const nodes = [...dom.window.document.body.childNodes].map(tree).filter(x=>x!==undefined); dom.window.close();
  return { trace, error, nodes, dataset };
}
const cases: Case[] = [
  {records:[]}, {records:[],missing:true},
  {records:[{id:'a',name:'A',type:'supplement',ingredients:[],note:'Note'}]},
  {records:[{id:'a',name:'<Name>&',type:'medication',dosage:'with food',sourceUrl:'https://example.test/a?b=1&c=2',ingredients:[{name:'<Ingredient>',amount:'5 mg'}],qualityTests:[{category:'contaminant',analyte:'Lead',resultText:'ND'}],note:'<Note>'}],quality:true},
  {records:[{id:'a',name:'A',type:'supplement',ingredients:[{name:'C',amount:'5 mg'}],periods:[{start:'2024-01-01',end:null,dose:'Recorded 10 mg'}]}]},
  {records:[{id:'a',name:'A',status:'paused'},{id:'b',name:'B',status:'active'},{id:'c',name:'C',status:'ended'},{id:'d',name:'D',status:'scheduled'},{id:'e',name:'E',status:'planned'}]},
  {records:[{id:'a',name:'A',type:'supplement',ingredients:[{name:'C',amount:'5 mg'}],periods:[{start:'2024-01-01',end:null}]}],edit:0},
  {records:[{id:'a',name:'A',type:'medication',periods:[{start:'invalid',end:'invalid'},{start:'2024-01-01',end:'2024-01-31'}]}],edit:0},
];
it.each(cases)('preserves native whole editor DOM, field defaults, data reads, timers and modal lifetime %#', input => {
  expect(run(currentProcedure,input)).toEqual(run(originalProcedure,input));
});
it('retains every interrupted source-read boundary without opening or overwriting the modal', () => {
  const input = cases[3]!; const successful = run(originalProcedure,input);
  for (let point=1;point<=successful.trace.length+1;point++)expect(run(currentProcedure,input,point)).toEqual(run(originalProcedure,input,point));
});
