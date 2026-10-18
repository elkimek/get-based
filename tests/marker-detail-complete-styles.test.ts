import {restoreRemainingFeatureSource} from './helpers/remaining-feature-style-inverse.js';
import {describe, expect, it} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import postcss from 'postcss';
import {isDeepStrictEqual} from 'node:util';
import {compileMarkerDetailCompleteStyles, markerDetailCompleteOwnership} from './helpers/remaining-feature-style-inverse.js';
import {restoreCompleteRecipeBodies} from './marker-detail-complete-receipts.js';
import sourceInverse from './fixtures/marker-detail-complete-styles-source-inverse.json' with {type: 'json'};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = path.join(root, 'css/marker-detail-modal.base.css');
function facts(source: string): unknown[] {
  const output: unknown[] = [];
  postcss.parse(source).walkRules(rule => {
    const ancestry: string[] = [];
    for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent)
      if (parent.type === 'atrule') ancestry.unshift(parent.name + ':' + parent.params);
    output.push([rule.selector, ancestry, rule.nodes.map(node => node.type === 'decl'
      ? [node.prop, node.value, !!node.important] : [node.type, node.toString()])]);
  });
  return output;
}
describe('Marker Detail complete semantic Tailwind receiver ownership', () => {
  it('preserves entire native CSS/order/media/priority and every foreign byte', async () => {
    const input = await fs.readFile(inputPath, 'utf8');
    const native = await fs.readFile(new URL('./fixtures/marker-detail-complete-styles-original.css', import.meta.url), 'utf8');
    const result = await compileMarkerDetailCompleteStyles(input, inputPath, root);
    const raw = process.env['GETBASED_MARKER_DETAIL_COMPLETE_RAW'];
    if (raw) await fs.writeFile(path.join(raw, 'complete-compiled.css'), result.css, {flag: 'wx'});
    expect(markerDetailCompleteOwnership.receivers).toHaveLength(97);
    expect(markerDetailCompleteOwnership.declarationCount).toBe(309);
    expect(isDeepStrictEqual(facts(result.css), facts(native)), 'complete native CSS AST').toBe(true);
    expect(await restoreCompleteRecipeBodies(result.css) === native, 'all foreign source bytes exact after only owned formatting restoration').toBe(true);
    let source = restoreRemainingFeatureSource(input,'marker');
    const insertion = sourceInverse.metadataInsertion;
    expect(source.slice(insertion.position, insertion.position + insertion.text.length)).toBe(insertion.text);
    source = source.slice(0, insertion.position) + source.slice(insertion.position + insertion.text.length);
    for (const edit of sourceInverse.edits.slice().reverse()) {
      const delta = sourceInverse.edits.filter(previous => previous.start < edit.start)
        .reduce((n, previous) => n + previous.after.length - previous.before.length, 0);
      const start = edit.start + delta;
      expect(source.slice(start, start + edit.after.length)).toBe(edit.after);
      source = source.slice(0, start) + edit.before + source.slice(start + edit.after.length);
    }
    const before = await fs.readFile(new URL('./fixtures/marker-detail-complete-styles-source-original.css', import.meta.url), 'utf8');
    expect(source === before, 'whole original source inverse').toBe(true);
    expect(result.receivers).toHaveLength(204);
  });
  it.each([
    ['missing receiver', (css: string) => css.replace('@apply gb:marker-detail-dialog;', '')],
    ['duplicate receiver', (css: string) => css + '\n.marker-detail-modal { @apply gb:marker-detail-dialog; }'],
    ['foreign selector', (css: string) => css.replace('.marker-detail-modal {', '.foreign-marker-modal {')],
    ['wrong media', (css: string) => css.replace('@apply gb:marker-detail-dialog;', '') + '\n@media(max-width:799px) {.marker-detail-modal { @apply gb:marker-detail-dialog; }}'],
    ['extra declaration', (css: string) => css.replace('@apply gb:marker-detail-dialog;', '@apply gb:marker-detail-dialog; color:red;')],
    ['unknown utility', (css: string) => css.replace('@apply gb:marker-detail-dialog;', '@apply gb:foreign-marker-dialog;')],
  ])('rejects %s without changing ownership gates', async (_name, corrupt) => {
    const input = await fs.readFile(inputPath, 'utf8');
    await expect(compileMarkerDetailCompleteStyles(corrupt(input), inputPath, root)).rejects.toThrow();
  });
  it.each([
    ['changed value', (css: string) => css.replace(/max-width:\s*920px/, 'max-width:921px')],
    ['changed foreign gradient', (css: string) => css.replace('var(--red)', 'var(--foreign-red)')],
    ['extra rule', (css: string) => css + '\n.foreign {color:red}'],
  ])('keeps %s red in the exact full stylesheet oracle', async (_name, corrupt) => {
    const input = await fs.readFile(inputPath, 'utf8');
    const result = await compileMarkerDetailCompleteStyles(input, inputPath, root);
    const changed = corrupt(result.css);
    expect(changed === result.css).toBe(false);
    let restored: string | null = null;
    try {restored = await restoreCompleteRecipeBodies(changed);} catch { /* exact declaration rejection is the expected negative result */ }
    const native = await fs.readFile(new URL('./fixtures/marker-detail-complete-styles-original.css', import.meta.url), 'utf8');
    expect(restored === native).toBe(false);
  });
});
