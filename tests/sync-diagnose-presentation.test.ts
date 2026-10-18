// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {isDeepStrictEqual} from 'node:util';
import type {GeneratedIdentityQR} from '../js/sync-diagnose-presentation.js';
import {renderSyncDiagnoseModal} from '../js/sync-diagnose-render.js';
import {renderSyncIdentityRotation} from '../js/sync-diagnose-presentation.js';
import {projectSyncDiagnose} from '../js/sync-diagnose-projector.js';
import {diagnosticCases,diagnosticFixture} from './helpers/sync-diagnose-fixtures.js';
interface NodeRow {type:number;name:string;value:string|null;attrs?:string[][];children?:NodeRow[]}
interface Anchor {path:number[];value:string;parent:number}
interface Join {path:number[];index:number;parts:string[];value:string;parent:number}
interface Receiver {path:number[];utility:string;before:string[][];after:string[][]}
interface EmptyChildren {path:number[];before:NodeRow}
interface Policy {anchors:Anchor[];joins:Join[];parents:unknown[];emptyChildren:EmptyChildren[];receivers?:Receiver[]}
interface NativeFixture extends Policy {name:string;input:Parameters<typeof renderSyncDiagnoseModal>[0];originalHTML:string;originalTree:NodeRow[];trace:string[]}
interface RotationFixture extends Policy {name:string;words:string[];qr:string;originalHTML:string;originalTree:NodeRow[];savedChecked:boolean;applyDisabled:boolean;developmentQRComment?:{path:number[];parent:number;productionValue:string;testValue:string}}
interface Fixture {compilerQualified:boolean;cases:NativeFixture[];rotations:RotationFixture[]}
const fixtures=JSON.parse(readFileSync('tests/fixtures/sync-diagnose-original.json','utf8')) as Fixture;
function identical(a:unknown,b:unknown,message:string){expect(isDeepStrictEqual(a,b),message).toBe(true);}
function parsed(html:string):NodeRow[] {
  const host=document.createElement('div');host.innerHTML=html;
  const tree=(node:Node):NodeRow=>({type:node.nodeType,name:node.nodeName,value:node.nodeValue,
    ...(node instanceof Element?{attrs:Array.from(node.attributes,a=>[a.name,a.value])}:{}),
    ...(node.childNodes.length?{children:Array.from(node.childNodes,tree)}:{})});
  return Array.from(host.childNodes,tree);
}
function qualified(tree:NodeRow[],policy:Policy):NodeRow[] {
  const clone=structuredClone(tree),found:Array<{path:number[];value:string|null}>=[];
  const descriptors=(nodes:NodeRow[])=>nodes.map(n=>({type:n.type,name:n.name,value:n.value,attrs:n.attrs??null}));
  const rowsAt=(path:number[])=>{let rows=clone;for(const i of path)rows=rows[i]!.children!;return rows;};
  const walk=(nodes:NodeRow[],base:number[])=>nodes.forEach((n,i)=>{const p=[...base,i];if(n.type===8)found.push({path:p,value:n.value});if(n.children)walk(n.children,p);});walk(clone,[]);
  identical(found,policy.anchors.map(a=>({path:a.path,value:a.value})),'Complete literal compiler comment inventory');
  for(const anchor of policy.anchors)identical(descriptors(rowsAt(anchor.path.slice(0,-1))),policy.parents[anchor.parent],'Exact comment adjacency');
  for(const anchor of [...policy.anchors].sort((a,b)=>b.path.length-a.path.length||JSON.stringify(b.path).localeCompare(JSON.stringify(a.path),undefined,{numeric:true})))rowsAt(anchor.path.slice(0,-1)).splice(anchor.path.at(-1)!,1);
  for(const empty of policy.emptyChildren){const node=rowsAt(empty.path.slice(0,-1))[empty.path.at(-1)!]!;identical(node,empty.before,'Exact known comment-only empty node');identical(node.children,[],'Only qualified comments exhausted this node');delete node.children;}
  for(const join of policy.joins){const rows=rowsAt(join.path);identical(descriptors(rows),policy.parents[join.parent],'Exact source-bound join adjacency');const parts=rows.slice(join.index,join.index+join.parts.length);expect(parts.every(n=>n.type===3)).toBe(true);identical(parts.map(n=>n.value),join.parts,'Exact literal join pieces');expect(join.parts.join('')).toBe(join.value);}
  for(const receiver of policy.receivers??[]){const node=rowsAt(receiver.path.slice(0,-1))[receiver.path.at(-1)!]!;identical(node.attrs,receiver.after,'Exact owned style-to-class receiver');node.attrs=receiver.before;}
  for(const join of [...policy.joins].sort((a,b)=>b.path.length-a.path.length||JSON.stringify(b.path).localeCompare(JSON.stringify(a.path),undefined,{numeric:true})||b.index-a.index))rowsAt(join.path).splice(join.index,join.parts.length,{type:3,name:'#text',value:join.value});
  return clone;
}
function rotationPolicy(row:RotationFixture):RotationFixture {
  const copy=structuredClone(row),comment=row.developmentQRComment;
  if(!comment)return copy;
  expect(process.env.NODE_ENV).toBe('test');
  const anchor=copy.anchors.find(a=>isDeepStrictEqual(a.path,comment.path));expect(anchor).toBeDefined();
  expect(anchor!.value).toBe(comment.productionValue);expect(anchor!.parent).toBe(comment.parent);
  const siblings=copy.parents[comment.parent] as Array<{type:number;value:string}>;
  expect(siblings[comment.path.at(-1)!]?.type).toBe(8);expect(siblings[comment.path.at(-1)!]?.value).toBe(comment.productionValue);
  anchor!.value=comment.testValue;siblings[comment.path.at(-1)!]!.value=comment.testValue;
  return copy;
}
function observed<T extends object>(value:T,trace:string[],base='input',cache=new WeakMap<object,object>()):T {
 const prior=cache.get(value);if(prior)return prior as T;
 const wrapped=new Proxy(value,{get(target,key,receiver){if(typeof key==='string')trace.push(base+'.'+key);const result=Reflect.get(target,key,receiver);return result!==null&&typeof result==='object'?observed(result,trace,base+'.'+String(key),cache):result;}});cache.set(value,wrapped);return wrapped;
}
describe('Sync Diagnose original presentation contracts',()=>{
 it('requires actual original fixtures and compiler-qualified exact marker paths',()=>{expect(fixtures.compilerQualified).toBe(true);expect(fixtures.cases).toHaveLength(19);expect(new Set(fixtures.cases.map(v=>v.name)).size).toBe(19);});
 it.each(diagnosticCases())('preserves native normal summary priority: $name',row=>{const host=document.createElement('div');host.innerHTML=renderSyncDiagnoseModal(row.input);expect(host.querySelector('.sync-diagnose-summary h4')?.textContent).toBe(row.summary);expect(host.querySelector('[data-probe]')).toBeNull();});
 it.each(fixtures.cases)('retains original getter/read chronology: $name',row=>{const trace:string[]=[];const input=diagnosticCases().find(v=>v.name===row.name)!.input;renderSyncDiagnoseModal(observed(input,trace));expect(trace).toEqual(row.trace);});
 it.each(fixtures.cases)('matches complete original fragment: $name',row=>{expect(parsed(row.originalHTML)).toEqual(row.originalTree);identical(qualified(parsed(renderSyncDiagnoseModal(diagnosticCases().find(v=>v.name===row.name)!.input)),row),row.originalTree,'Complete original parsed fragment');});
 it.each(['unknown comment','changed marker','missing marker','moved marker'] as const)('rejects compiler corruption: %s',kind=>{const row=fixtures.cases.find(v=>v.anchors.length>0)!;expect(row).toBeDefined();const html=renderSyncDiagnoseModal(row.input);const anchor=row.anchors[0]!;const literal='<!--'+anchor.value+'-->';expect(html).toContain(literal);const changed=kind==='unknown comment'?'<!--foreign-->'+html:kind==='changed marker'?html.replace(literal,'<!--foreign-->'):kind==='missing marker'?html.replace(literal,''):html.replace(literal,'')+literal;expect(changed).not.toBe(html);expect(()=>qualified(parsed(changed),row)).toThrow();});
 it('keeps sparse map holes empty while retaining the original row count',()=>{const row=diagnosticCases().find(v=>v.name==='sparse-rows')!;const view=projectSyncDiagnose(row.input);expect(view.rows.rows).toEqual([]);expect(view.rowCount).toBe('3');});
 it('throws before rendering when an original early row getter throws',()=>{const input=diagnosticFixture();const base={profileId:'row',profileIdSource:'column',format:'plain',isDeleted:false,syncedAt:0,syncedAtMs:0,sun:0,dev:0,bytes:0};Object.defineProperty(base,'profileId',{get(){throw new Error('original row getter');}});input.diagnostics.rows=[base];expect(()=>renderSyncDiagnoseModal(input)).toThrow('original row getter');});
 it('keeps rotation Apply disabled and escaped word text without nodes',()=>{const html=renderSyncIdentityRotation(['<img data-probe="word">'], '');const host=document.createElement('div');host.innerHTML=html;expect(host.querySelector('[data-probe]')).toBeNull();expect(host.querySelector('#rotate-words')?.textContent).toBe('1.<img data-probe="word">');expect((host.querySelector('#rotate-apply-btn') as HTMLButtonElement).disabled).toBe(true);expect((host.querySelector('#rotate-saved-check') as HTMLInputElement).checked).toBe(false);expect(host.querySelector('svg')).toBeNull();});
 it.each(fixtures.rotations)('retains complete original rotation fragment: $name',row=>{
   // This fixture SVG is the captured synthetic QR producer output, never a product branding API.
   const html=renderSyncIdentityRotation(row.words,row.qr as GeneratedIdentityQR|'');
   identical(parsed(row.originalHTML),row.originalTree,'Independent original rotation native parser');
   identical(qualified(parsed(html),rotationPolicy(row)),row.originalTree,'Full rotation tree/attrs/text/defaults after exact source-owned representation');
   const host=document.createElement('div');host.innerHTML=html;
   expect((host.querySelector('#rotate-saved-check') as HTMLInputElement).checked).toBe(row.savedChecked);
   expect((host.querySelector('#rotate-apply-btn') as HTMLButtonElement).disabled).toBe(row.applyDisabled);
 });
 it('rejects changed source-owned raw QR compiler hash',()=>{
   const row=fixtures.rotations.find(r=>r.name==='qr-present')!,policy=rotationPolicy(row),comment=row.developmentQRComment!;
   const html=renderSyncIdentityRotation(row.words,row.qr as GeneratedIdentityQR),literal='<!--'+comment.testValue+'-->';
   expect(html).toContain(literal);const changed=html.replace(literal,'<!--foreign-qr-hash-->');
   expect(()=>qualified(parsed(changed),policy)).toThrow();
 });
 it.each(['missing join','wrong whitespace','unknown adjacent text'] as const)('rejects finite text boundary corruption: %s',kind=>{
   const row=fixtures.cases.find(v=>v.joins.length>0)!;const policy=structuredClone(row),tree=parsed(renderSyncDiagnoseModal(diagnosticCases().find(v=>v.name===row.name)!.input));
   if(kind==='missing join')policy.joins.pop();else if(kind==='wrong whitespace')policy.joins[0]!.parts[0]+=' ';else tree.unshift({type:3,name:'#text',value:' '});
   expect(()=>identical(qualified(tree,policy),row.originalTree,'Exact fixed literal text policy')).toThrow();
 });
 it('escapes formerly raw numeric row substitution without additional native elements',()=>{
   const input=diagnosticCases().find(v=>v.name==='row-formats')!.input;input.diagnostics.rows=input.diagnostics.rows.slice(0,1);
   Object.defineProperty(input.diagnostics.rows[0]!,'sun',{value:'<img data-probe="numeric">'});
   const host=document.createElement('div');host.innerHTML=renderSyncDiagnoseModal(input);
   expect(host.querySelector('[data-probe]')).toBeNull();expect(host.querySelectorAll('tbody td')[3]?.textContent).toBe('<img data-probe="numeric">');
 });
 it('keeps handlers outside both authored views',()=>{for(const name of ['SyncDiagnoseModal','SyncIdentityRotation']){const source=readFileSync('js/components/'+name+'.svelte','utf8');expect(source).not.toMatch(/\son[a-z]+\s*=|\bon:[a-z]+|\{on[a-z]+\}/);}});
});


describe('Sync storage ARIA literal serialization', () => {
  function quotaInput() {
    const input = diagnosticFixture();
    input.quota = { bytes: 1, cap: 2, pct: 25, level: 'green' };
    return input;
  }
  it.each([NaN, Infinity, -Infinity, 125, -5, 0])('retains the literal attribute and independent clamp for %s', pct => {
    const input = quotaInput();
    input.quota!.pct = pct;
    const host = document.createElement('div');
    host.innerHTML = renderSyncDiagnoseModal(input);
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe(`${pct}`);
    expect(host.querySelector('[role="progressbar"] span')?.getAttribute('style')).toBe(`width:${Math.min(100, Math.max(0, pct))}%;background:var(--green)`);
  });
  it('keeps separate summary/string/clamp reads and original primitive hints', () => {
    const input = quotaInput(), trace: string[] = [];
    let reads = 0;
    Object.defineProperty(input.quota, 'pct', { get() {
      const read = ++reads; trace.push(`read:${read}`);
      return { [Symbol.toPrimitive](hint: string) { trace.push(`hint:${read}:${hint}`); return hint === 'string' ? `pct${read}` : 25; } };
    }});
    const host = document.createElement('div');
    host.innerHTML = renderSyncDiagnoseModal(input);
    expect(trace).toEqual(['read:1', 'hint:1:string', 'read:2', 'hint:2:string', 'read:3', 'hint:3:number']);
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('pct2');
    expect(host.textContent).toContain('Storage pct1%');
  });
  it('escapes hostile attribute text and full opening-tag lookalikes without new throws or nodes', () => {
    const input = quotaInput();
    const hostile = '<div class="sync-diagnose-storage-track" role="progressbar" aria-label="Relay storage used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">" data-probe="pct&';
    Object.defineProperty(input.quota, 'pct', { get() { return { [Symbol.toPrimitive](hint: string) { return hint === 'string' ? hostile : 25; } }; }});
    const host = document.createElement('div'); host.innerHTML = renderSyncDiagnoseModal(input);
    expect(host.querySelectorAll('[role="progressbar"]')).toHaveLength(1);
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe(hostile);
    expect(host.querySelector('[data-probe]')).toBeNull();
  });
  it.each([1, 2, 3])('preserves an atomic original pct coercion throw on read %s', failingRead => {
    const input = quotaInput(), trace: string[] = []; let reads = 0;
    Object.defineProperty(input.quota, 'pct', { get() { const read = ++reads; trace.push(`read:${read}`); return { [Symbol.toPrimitive](hint: string) { trace.push(`hint:${read}:${hint}`); if (read === failingRead) throw new Error('pct coercion'); return 25; } }; }});
    expect(() => renderSyncDiagnoseModal(input)).toThrow('pct coercion');
    expect(reads).toBe(failingRead);
    expect(trace.at(-1)).toBe(`hint:${failingRead}:${failingRead === 3 ? 'number' : 'string'}`);
  });
  it('retains original Symbol template conversion rejection', () => {
    const input = quotaInput(); Object.defineProperty(input.quota, 'pct', { value: Symbol('pct') });
    expect(() => renderSyncDiagnoseModal(input)).toThrow(TypeError);
  });
});
