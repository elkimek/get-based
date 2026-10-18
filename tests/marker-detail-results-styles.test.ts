import {originalPlacementStyleBytes} from './marker-detail-result-style-receipts.js';
import {describe, expect, it} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import postcss from 'postcss';
import {isDeepStrictEqual} from 'node:util';
import {compileMarkerDetailCompleteStyles} from '../scripts/marker-detail-complete-style-ownership.mjs';
import {markerDetailResultsOwnership} from '../scripts/marker-detail-results-style-ownership.mjs';
import {restoreCompleteRecipeBodies} from './marker-detail-complete-receipts.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = path.join(root, 'css/marker-detail-modal.base.css');
function facts(source: string): unknown[] {
  const result: unknown[] = [];
  postcss.parse(source).walkRules(rule => {
    const ancestry: string[] = [];
    for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent)
      if (parent.type === 'atrule') ancestry.unshift(parent.name + ':' + parent.params);
    result.push([rule.selector, ancestry, rule.nodes.map(node => node.type === 'decl'
      ? [node.prop, node.value, !!node.important] : [node.type, node.toString()])]);
  });
  return result;
}
function foreign(source: string): string {
  const edits: {start: number; end: number}[] = [];
  postcss.parse(source).walkRules(rule => {
    const media = rule.parent?.type === 'atrule' ? rule.parent.params : null;
    if (!markerDetailResultsOwnership.receivers.some(([, selector, condition]) => selector === rule.selector && condition === media)) return;
    const start = rule.source!.start!.offset! + rule.selector.length + (rule.raws.between || '').length + 1;
    edits.push({start, end: rule.source!.end!.offset! - 1});
  });
  expect(edits).toHaveLength(72);
  for (const edit of edits.reverse()) source = source.slice(0, edit.start) + source.slice(edit.end);
  return source;
}
describe('Marker Detail semantic in-place Tailwind recipes', () => {
  it('preserves complete original selector/media/declaration/priority order and all foreign bytes', async () => {
    const input = await fs.readFile(inputPath, 'utf8');
    const old = await fs.readFile(new URL('./fixtures/marker-detail-results-original.css', import.meta.url), 'utf8');
    const compiled = await compileMarkerDetailCompleteStyles(input, inputPath, root);
    const result = {...compiled, css: await restoreCompleteRecipeBodies(compiled.css)};
    const raw = process.env['GETBASED_MARKER_DETAIL_RAW'];
    if (raw) await fs.writeFile(path.join(raw, 'styles-compiled.css'), result.css, {flag: 'wx'});
    expect(markerDetailResultsOwnership.receivers).toHaveLength(72);
    expect(markerDetailResultsOwnership.declarationCount).toBe(251);
    expect(isDeepStrictEqual(facts(result.css), facts(old)), 'entire original ordered CSS AST').toBe(true);
    // All previously authored form recipes stay source-qualified separately.
    const newBodiesOnly = markerDetailResultsOwnership.receivers;
    const prior = postcss.parse(old), changes: {start: number; end: number; body: string}[] = [];
    postcss.parse(result.css).walkRules(rule => {
      const media = rule.parent?.type === 'atrule' ? rule.parent.params : null;
      if (!newBodiesOnly.some(([, selector, condition]) => selector === rule.selector && condition === media)) return;
      const matching: typeof rule[] = [];
      prior.walkRules(candidate => {if (candidate.selector === rule.selector && (candidate.parent?.type === 'atrule' ? candidate.parent.params : null) === media) matching.push(candidate);});
      expect(matching).toHaveLength(1);
      const original = matching[0]!;
      const start = original.source!.start!.offset! + original.selector.length + (original.raws.between || '').length + 1;
      changes.push({start: rule.source!.start!.offset! + rule.selector.length + (rule.raws.between || '').length + 1,
        end: rule.source!.end!.offset! - 1, body: old.slice(start, original.source!.end!.offset! - 1)});
    });
    let restored = result.css;
    for (const change of changes.reverse()) restored = restored.slice(0, change.start) + change.body + restored.slice(change.end);
    expect(restored === old, 'whole original emitted stylesheet byte identity outside new recipe formatting').toBe(true);
    expect(foreign(result.css)).toBe(foreign(old));
  });
  it('rejects unknown/missing/changed accepted Custom suffix before old Placement correspondence', async () => {
    const input=await fs.readFile(inputPath,'utf8');const result=await compileMarkerDetailCompleteStyles(input,inputPath,root);
    await expect(originalPlacementStyleBytes(result.css+'\n.foreign {color:red}')).rejects.toThrow(/Custom/);
    await expect(originalPlacementStyleBytes(result.css.replace('.marker-form-modal #cm-new-cat-icon','.foreign-icon'))).rejects.toThrow(/Custom/);
    await expect(originalPlacementStyleBytes(result.css.replace('/* Fixed Custom Marker presentation;','/* Foreign Custom presentation;'))).rejects.toThrow(/Custom/);
  });
  it.each([
    ['missing receiver', (css: string) => css.replace('@apply gb:marker-detail-history-grid;', '')],
    ['duplicate receiver', (css: string) => css + '\n.marker-detail-modal .modal-values-grid { @apply gb:marker-detail-history-grid; }'],
    ['foreign selector', (css: string) => css.replace('.marker-detail-modal .modal-values-grid {', '.foreign-result-grid {')],
    ['unknown utility', (css: string) => css.replace('@apply gb:marker-detail-history-grid;', '@apply gb:foreign-result-grid;')],
  ])('rejects %s while retaining full compile gates', async (_name, change) => {
    const input = await fs.readFile(inputPath, 'utf8');
    await expect(compileMarkerDetailCompleteStyles(change(input), inputPath, root)).rejects.toThrow();
  });
});
