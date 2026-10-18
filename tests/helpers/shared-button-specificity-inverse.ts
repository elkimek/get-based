import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import postcss, {type Rule} from 'postcss';

const previous = readFileSync(path.join(import.meta.dirname, '../fixtures/shared-app-shell-original.css'), 'utf8');
assert.equal(createHash('sha256').update(previous).digest('hex'), '6825adaf4631c617d98d39fda39f73e16bd817c84db616b1c232bc7bc7b0edc8');
const selectors = ['.import-btn', '.import-btn-primary', '.import-btn-primary:hover', '.import-btn:disabled'] as const;
function body(source: string, rule: Rule): string {
  return source.slice(rule.source!.start!.offset! + rule.selector.length + (rule.raws.between || '').length + 1, rule.source!.end!.offset! - 1);
}
/** Keep immutable pre-fix fixtures exact after validating the four reviewed selector changes.
 * No declarations, positions, comments, other selectors or priorities are normalized. */
export function restorePreviousSharedButtonSelectors(lane: string, compiled: string): string {
  if (lane !== 'app-shell') return compiled;
  const oldTree = postcss.parse(previous), tree = postcss.parse(compiled);
  const edits: {start: number; end: number; before: string; after: string}[] = [];
  for (const selector of selectors) {
    const oldSelector = selector + ':not([data-chat-empty-view] *)';
    const newSelector = selector + ':not(:where([data-chat-empty-view] *))';
    const oldRules: Rule[] = [], newRules: Rule[] = [], unrevised: Rule[] = [];
    oldTree.walkRules(rule => { if (rule.selector === oldSelector) oldRules.push(rule); });
    tree.walkRules(rule => { if (rule.selector === newSelector) newRules.push(rule); if (rule.selector === oldSelector) unrevised.push(rule); });
    assert.equal(oldRules.length, 1); assert.equal(newRules.length, 1); assert.equal(unrevised.length, 0);
    const oldRule = oldRules[0]!, rule = newRules[0]!;
    assert.equal(rule.parent?.type, 'root'); assert.equal(oldRule.parent?.type, 'root');
    assert.equal(body(compiled, rule), body(previous, oldRule), 'Every reviewed button declaration remains byte-exact');
    const start = rule.source!.start!.offset!, end = start + newSelector.length;
    assert.equal(compiled.slice(start, end), newSelector);
    edits.push({start, end, before: newSelector, after: oldSelector});
  }
  // The mobile shell must stay fixed above theme chrome and its own backdrop.
  // Only this receiver changes; its complete native declarations remain exact.
  for (const oldSelector of ['.sidebar', '.sidebar.mobile-open']) {
    const newSelector = '#sidebar-nav' + oldSelector;
    const oldSidebar: Rule[] = [], newSidebar: Rule[] = [];
    oldTree.walkRules(rule => {if (rule.selector === oldSelector && rule.parent?.type === 'atrule' && rule.parent.params === '(max-width: 1024px)') oldSidebar.push(rule);});
    tree.walkRules(rule => {if (rule.selector === newSelector) newSidebar.push(rule);});
    assert.equal(oldSidebar.length, 1); assert.equal(newSidebar.length, 1);
    const oldRule = oldSidebar[0]!, rule = newSidebar[0]!;
    assert.equal(rule.parent?.type, 'atrule');
    assert.equal((rule.parent as import('postcss').AtRule).name, 'media');
    assert.equal((rule.parent as import('postcss').AtRule).params, '(max-width: 1024px)');
    assert.equal(body(compiled, rule), body(previous, oldRule));
    const start = rule.source!.start!.offset!;
    edits.push({start, end: start + rule.selector.length, before: rule.selector, after: oldSelector});
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    assert.equal(compiled.slice(edit.start, edit.end), edit.before);
    compiled = compiled.slice(0, edit.start) + edit.after + compiled.slice(edit.end);
  }
  return compiled;
}
