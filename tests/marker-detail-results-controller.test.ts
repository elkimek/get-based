import {restoreReviewedMigrationSource} from './helpers/migration-review-exact-source-inverse.js';
// @vitest-environment jsdom
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import inverse from './fixtures/marker-detail-controller-inverses.json' with {type:'json'};
import * as ts from 'typescript/unstable/ast';
import {withParsedSource} from '../scripts/native-typescript-ast.js';
import {escapeHTML, escapeAttr} from '../js/utils.js';
import {renderMarkerDetailHistory, renderMarkerDetailEditor} from '../js/marker-detail-results-presentation.js';
import {captureMarkerDetailText, projectMarkerDetailAction} from '../js/marker-detail-projection.js';
import {markerDetailActionAttrs} from '../js/marker-detail-actions.js';
import type {HistoryCollection, HistorySource} from '../js/marker-detail-view.js';

// Genuine emitted original/candidate functions run with explicit service ports.
// Only their ESM syntax is removed by the maintained AST parser; production is never rewritten.
function script(source: string): string {
  return withParsedSource(source, 'marker-controller.js', file => {
    const edits: {start: number; end: number}[] = [];
    for (const node of file.statements) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) edits.push({start: node.getStart(file), end: node.end});
      else if (ts.isFunctionDeclaration(node)) for (const modifier of node.modifiers || [])
        if (modifier.kind === ts.SyntaxKind.ExportKeyword) edits.push({start: modifier.getStart(file), end: modifier.end});
    }
    for (const edit of edits.sort((a,b) => b.start-a.start)) source = source.slice(0,edit.start) + source.slice(edit.end);
    return source;
  });
}
function source(owner: 'history' | 'editing', original: boolean): string {
  return fs.readFileSync(new URL(original ? './fixtures/marker-detail-original-marker-detail-'+owner+'.js.txt'
    : '../js/marker-detail-'+owner+'.js', import.meta.url), 'utf8');
}
function reviewedFragment(html: string, branch: number): string {
  const host = document.createElement('div'); host.innerHTML = html;
  const nodes = [...host.childNodes], positions = [0, 1, nodes.length - 2, nodes.length - 1];
  expect(new Set(positions).size).toBe(4);
  const anchors = positions.map(index => nodes[index]!);
  expect(anchors.map(node => [node.nodeType, node.nodeValue])).toEqual([[8, '['], [8, '[' + branch], [8, ']'], [8, ']']]);
  const comments: Node[] = [];
  const collect = (node: Node) => {for (const child of node.childNodes) {if (child.nodeType === 8) comments.push(child); collect(child);}};
  collect(host); expect(comments).toEqual(anchors);
  for (const anchor of anchors) anchor.parentNode!.removeChild(anchor);
  return host.innerHTML;
}
function metadata(original: boolean, entry: unknown, provenance: unknown, date: unknown) {
  const context = vm.createContext({escapeHTML, captureMarkerDetailText, entry, provenance, date});
  const result: unknown = new vm.Script(script(source('history',original)) + '\nbuildMarkerHistoryMetadata(entry, provenance, date)').runInContext(context);
  if (original) return result as {collectionContextHtml: string; sourceHtml: string};
  const current = result as {collection: HistoryCollection | null; sources: readonly HistorySource[]};
  const branches = {'source-file': 13, 'source-edited': 14, 'source-report': 15, 'source-manual': 16} as const;
  return {collectionContextHtml: current.collection ? reviewedFragment(renderMarkerDetailHistory(current.collection), 12) : '',
    sourceHtml: current.sources.map(view => reviewedFragment(renderMarkerDetailHistory(view), branches[view.kind])).join('')};
}
function observe<T extends object>(value: T, trace: string[], path = 'entry', failAt = -1): T {
  return new Proxy(value, {get(target, key, receiver) {
    if (typeof key === 'symbol') return Reflect.get(target,key,receiver);
    trace.push(path+'.'+key); if (trace.length === failAt) throw new Error('controlled getter '+trace.length);
    const result: unknown = Reflect.get(target,key,receiver);
    return result && typeof result === 'object' ? observe(result,trace,path+'.'+key,failAt) : result;
  }});
}
const cases = [
  [null, null, null],
  [{context:{sampleTime:'08:30',fasting:true,cyclePhase:'late-luteal',cycleDay:'12'},sourceFile:'lab.csv'}, null, '2001-02-01'],
  [{context:{sampleTime:'<script>literal</script>',fasting:false,cyclePhase:'foreign',cycleDay:3}}, {file:'long controlled laboratory filename.csv',manuallyEdited:true}, '2001-02-01'],
  [{context:{cyclePhase:'luteal',cyclePhaseDetail:'mid luteal',cycleDay:0}}, {snapshotId:'synthetic',manuallyEdited:true}, '2001-02-01'],
  [{context:{cycleDay:2.5}}, {file:null}, '2001-02-01'],
  [{context:{cycleDay:4}}, {file:''}, ''],
] as const;
describe('Marker Detail unchanged metadata and reference editor services', () => {
  it('rejects any additional, moved, missing or changed current reference compiler anchor', () => {
    const attrs = projectMarkerDetailAction('save-ref-range', {id: 'controlled', type: 'ref'});
    const html = renderMarkerDetailEditor({kind: 'reference', label: 'Reference', minimum: '4', maximum: '8',
      clearMinimum: projectMarkerDetailAction('clear-ref-edit-field', {field: 'min'}),
      clearMaximum: projectMarkerDetailAction('clear-ref-edit-field', {field: 'max'}), saveActions: attrs});
    expect(reviewedFragment(html, 0)).toContain('data-marker-detail-type="ref"');
    for (const changed of [html + '<!--foreign-->', html.replace('<!--[0-->', ''), html.replace('<!--[0-->', '<!--[9-->'),
      html.replace('<span class="ref-edit-field">', '<span class="ref-edit-field"><!--foreign-->')]) {
      expect(changed).not.toBe(html); expect(() => reviewedFragment(changed, 0)).toThrow();
    }
  });
  it('rejects altered domain/controller bytes and the absence of the repaired reference-save delegate', () => {
    for (const file of ['marker-detail-editing.ts', 'marker-detail-history.ts', 'marker-detail-modal-impl.ts']) {
      const current = fs.readFileSync(new URL('../js/' + file, import.meta.url), 'utf8');
      expect(() => restoreReviewedMigrationSource('js/' + file, current + '\n// foreign')).toThrow();
    }
    const current = fs.readFileSync(path.join(process.cwd(), 'js/marker-detail-modal-impl.ts'), 'utf8');
    expect(() => restoreReviewedMigrationSource('js/marker-detail-modal-impl.ts', current.replace('    editRefRange,\n    saveRefRange,', '    editRefRange,'))).toThrow();
  });
  it('preserves every original calculation, domain/service/lifecycle statement outside the finite presentation replacement', () => {
    for (const receipt of inverse) {
      let candidate=fs.readFileSync(new URL('../js/'+receipt.file,import.meta.url),'utf8');
      candidate = restoreReviewedMigrationSource('js/' + receipt.file, candidate);
      expect(candidate.startsWith(receipt.header)).toBe(true);candidate=candidate.slice(receipt.header.length);
      for (const edit of receipt.edits.slice().reverse()) {
        const beforeOffset=receipt.edits.filter(prior=>prior.start<edit.start).reduce((n,prior)=>n+prior.after.length-prior.before.length,0);
        const start=edit.start+beforeOffset;expect(candidate.slice(start,start+edit.after.length)).toBe(edit.after);
        candidate=candidate.slice(0,start)+edit.before+candidate.slice(start+edit.after.length);
      }
      expect(candidate).toBe(fs.readFileSync(new URL('./fixtures/marker-detail-original-'+receipt.file+'.txt',import.meta.url),'utf8'));
    }
  });
  cases.forEach(([entry, provenance, date], index) => it('preserves complete collection/provenance '+index, () => {
    const old = metadata(true,entry,provenance,date), current = metadata(false,entry,provenance,date);
    expect(current.collectionContextHtml).toBe(old.collectionContextHtml); expect(current.sourceHtml).toBe(old.sourceHtml);
  }));
  it('preserves every getter read and fail-fast exception before formatting each metadata branch', () => {
    for (const [entry, provenance, date] of cases.slice(1)) {
      const trace: string[] = []; metadata(true,observe(entry!,trace),provenance ? observe(provenance,trace,'source') : provenance,date);
      for (let fault = -1; fault <= trace.length; fault++) {
        const receipts = [true,false].map(original => {
          const calls: string[] = []; let error: unknown = null; let html: string[] | null = null;
          try {const result = metadata(original,observe(entry!,calls,'entry',fault),provenance ? observe(provenance,calls,'source',fault) : provenance,date);html=[result.collectionContextHtml,result.sourceHtml];}
          catch (caught) {error=(caught as Error).message;}
          return {calls,error,html};
        });
        expect(receipts[1]).toEqual(receipts[0]);
      }
    }
  });
  it.each(['Reference','Optimal'])('keeps %s native focus/defaults and exact Enter conversion/save/refresh order', async label => {
    async function run(original: boolean) {
      document.body.innerHTML='<span class="ref-editable"><b id="entry">edit</b></span><button class="nav-item active" data-category="biochemistry"></button>';
      const calls: unknown[] = [];
      const attributes = (action: string, fields: Record<string, unknown>) => {calls.push(['attributes', action, Object.entries(fields)]); return markerDetailActionAttrs(action, fields);};
      const context = vm.createContext({document,Element,escapeHTML,escapeAttr,renderMarkerDetailEditor,captureMarkerDetailText,
        projectMarkerDetailAction: (...args: Parameters<typeof projectMarkerDetailAction>) => {attributes(args[0], Object.fromEntries(Object.entries(args[1] || {}))); return projectMarkerDetailAction(...args);},
        state:{markerRegistry:{controlled:{refMin:4,refMax:8,optimalMin:5,optimalMax:7}}},
        getMarkerStorageDotKey: () => 'biochemistry.glucose', markerDetailActionAttrs: attributes,navigateMarkerDetailRuntime: (category: string) => calls.push(['navigate',category]),buildMarkerDetailSidebarRuntime: () => {},
        convertDisplayToSI: (key: string,value: number) => {calls.push(['convert',key,value]);return value*2;},
        saveRefRangeOverride: async (key: string,type: string,range: {min:number|null;max:number|null}) => {calls.push(['save',key,type,range.min,range.max]);return true;},
        showNotification: (text: string,type: string) => calls.push(['notification',text,type]),
      });
      const API = new vm.Script(script(source('editing',original))+'\n({configureMarkerDetailEditing,editRefRange,saveRefRange})').runInContext(context) as {
        configureMarkerDetailEditing(deps: object): void; editRefRange(id:string,type:string,event: {target:Element}):void;saveRefRange(id:string,type:string):Promise<void>;
      };
      API.configureMarkerDetailEditing({showDetailModal: (id:string) => calls.push(['modal',id])});
      const type=label==='Optimal'?'optimal':'ref';API.editRefRange('controlled',type,{target:document.getElementById('entry')!});
      const form = document.querySelector('.ref-edit-form')!;
      const html = original ? form.outerHTML : '<span class="ref-edit-form">' + reviewedFragment(form.innerHTML, 0) + '</span>';
      const minimum=document.getElementById('ref-edit-min') as HTMLInputElement,maximum=document.getElementById('ref-edit-max') as HTMLInputElement;
      expect(document.activeElement).toBe(minimum); expect(minimum.defaultValue).toBe(label==='Optimal'?'5':'4');expect(maximum.defaultValue).toBe(label==='Optimal'?'7':'8');
      minimum.value=' 6 ';maximum.value='not a number';
      const enter=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});minimum.dispatchEvent(enter);
      // The real asynchronous save continuation drains naturally before its downstream assertions.
      await new Promise<void>(resolve => setImmediate(resolve)); expect(enter.defaultPrevented).toBe(true);
      const escape=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});maximum.dispatchEvent(escape);
      expect(calls.slice(-5)).toEqual([['save','biochemistry.glucose',type,12,null],['navigate','biochemistry'],['modal','controlled'],['notification','Range updated','info'],['modal','controlled']]);
      return {html,calls};
    }
    expect(await run(false)).toEqual(await run(true));
  });
});
