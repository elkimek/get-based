import {restoreSectionBodies} from './fixtures/genetics-section-style-compatibility.js';
import {withoutDeadManualRules} from './fixtures/mtdna-dead-manual-styles.js';
import {describe, expect, it} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import postcss, {type Rule} from 'postcss';
import {compileDnaManualStyles, dnaManualOwnership, mtDnaPreviewOwnership} from './helpers/remaining-feature-style-inverse.js';
import {dnaSnpPreviewOwnership} from '../scripts/dna-snp-preview-style-ownership.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = path.join(root, 'css/genetics.base.css');
function ancestry(rule: Rule) {
  const groups: string[] = [];
  for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent)
    if (parent.type === 'atrule') groups.unshift(parent.name + ':' + parent.params);
  return groups;
}
function facts(source: string) {
  const result: unknown[] = [];
  postcss.parse(source).walkRules(rule => {
    result.push([rule.selector, ancestry(rule), rule.nodes.map(n => n.type === 'decl' ? [n.prop,n.value,!!n.important] : [n.type,n.toString()])]);
  });
  return result;
}
function foreign(source: string) {
  const edits: {start: number; end: number}[] = [];
  postcss.parse(source).walkRules(rule => {
    const condition = ancestry(rule).map(c => c.slice('media:'.length));
    if (![...dnaManualOwnership.receivers,...mtDnaPreviewOwnership.receivers,...dnaSnpPreviewOwnership.receivers].some(([,selector,media]) => selector === rule.selector && JSON.stringify(condition) === JSON.stringify(media ? [media] : []))) return;
    const start = rule.source!.start!.offset! + rule.selector.length + (rule.raws.between || '').length + 1;
    const end = rule.source!.end!.offset! - 1;
    edits.push({start,end});
  });
  expect(edits).toHaveLength(48);
  let result = source;
  for (const {start,end} of edits.reverse()) result = result.slice(0,start) + 'OWNED-BODY' + result.slice(end);
  return result;
}
describe('manual SNP Tailwind styles at the unchanged lazy genetics URL', () => {
  it('preserves every original selector/media/declaration and all foreign source bytes', async () => {
    const input = await fs.readFile(inputPath,'utf8');
    const original = withoutDeadManualRules(await fs.readFile(new URL('./fixtures/dna-manual-original.css', import.meta.url),'utf8'));
    const result = await compileDnaManualStyles(input,inputPath,root);
    expect(result.receivers).toHaveLength(173);
    expect(result.receivers.filter(row => dnaManualOwnership.receivers.some(([utility]) => utility === row.utility))).toHaveLength(19);
    expect(dnaManualOwnership.declarationCount).toBe(62);
    expect(facts(result.css)).toEqual(facts(original));
    expect(foreign(restoreSectionBodies(result.css,original))).toBe(foreign(original));
    expect(result.css).not.toContain('.dna-manual-grid'); expect(result.css).not.toContain('.dna-manual-genotype');
    expect(result.css).toContain('.dna-preview-modal'); expect(result.css).toContain('.mtdna');
  });
  it('rejects an extra receiver, a missing apply, a changed selector and changed media', async () => {
    const input = await fs.readFile(inputPath,'utf8');
    for (const corrupt of [
      input + '\n.foreign { @apply gb:dna-manual-dialog; }',
      input.replace('@apply gb:dna-manual-dialog;', ''),
      input.replace('.dna-manual-modal {', '.dna-manual-modal.changed {'),
      input.replace('@media (max-width: 560px)', '@media (max-width: 559px)'),
    ]) await expect(compileDnaManualStyles(corrupt,inputPath,root)).rejects.toThrow();
  });
  it('detects meaningful value/order and foreign-rule corruptions in the full original oracle', async () => {
    const original = withoutDeadManualRules(await fs.readFile(new URL('./fixtures/dna-manual-original.css', import.meta.url),'utf8'));
    for (const corrupt of [original.replace('width: min(92vw, 640px)', 'width: min(92vw, 641px)'),
      original.replace('font-size: 13px; font-weight: 700', 'font-weight: 700; font-size: 13px')])
      expect(facts(corrupt)).not.toEqual(facts(original));
    expect(foreign(original.replace('.dna-preview-body { flex: 1', '.dna-preview-body { flex: 2'))).not.toBe(foreign(original));
  });
});
