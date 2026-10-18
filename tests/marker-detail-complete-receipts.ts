import fs from 'node:fs/promises';
import postcss from 'postcss';
import {isDeepStrictEqual} from 'node:util';
import inverse from './fixtures/marker-detail-complete-controller-inverse.json' with {type: 'json'};
import {markerDetailCompleteOwnership} from '../scripts/marker-detail-complete-style-ownership.mjs';

export function restoreCompleteController(candidate: string): string {
  if (!candidate.startsWith(inverse.header)) throw new Error('Changed complete modal import');
  candidate = candidate.slice(inverse.header.length);
  for (const edit of inverse.edits.slice().reverse()) {
    const delta = inverse.edits.filter(previous => previous.start < edit.start)
      .reduce((n, previous) => n + previous.after.length - previous.before.length, 0);
    const start = edit.start + delta;
    if (candidate.slice(start, start + edit.after.length) !== edit.after) throw new Error('Changed complete modal source replacement');
    candidate = candidate.slice(0, start) + edit.before + candidate.slice(start + edit.after.length);
  }
  return candidate;
}

// Exact newly owned receiver facts are checked before restoring their native source formatting.
// All foreign rules and repeated native cascade blocks remain subject to the whole-sheet byte check.
export async function restoreCompleteRecipeBodies(output: string): Promise<string> {
  const native = await fs.readFile(new URL('./fixtures/marker-detail-complete-styles-original.css', import.meta.url), 'utf8');
  const old = postcss.parse(native);
  const edits: {start: number; end: number; body: string}[] = [];
  let declarations = 0;
  const order: string[] = [];
  postcss.parse(output).walkRules(rule => {
    const media = rule.parent?.type === 'atrule' ? rule.parent.params : null;
    const owned = markerDetailCompleteOwnership.receivers.find(([, selector, condition]) => selector === rule.selector && condition === media);
    if (!owned) return;
    const matching: typeof rule[] = [];
    old.walkRules(original => {
      if (original.selector === rule.selector && (original.parent?.type === 'atrule' ? original.parent.params : null) === media) matching.push(original);
    });
    if (matching.length !== 1) throw new Error('Missing unique native complete-modal rule');
    const original = matching[0]!;
    const facts = (value: typeof rule) => value.nodes.map(node => node.type === 'decl'
      ? [node.prop, node.value, !!node.important] : [node.type, node.toString()]);
    if (!isDeepStrictEqual(facts(rule), facts(original))) throw new Error('Changed complete-modal native declarations');
    order.push(owned[0]); declarations += rule.nodes.filter(node => node.type === 'decl').length;
    const start = original.source!.start!.offset! + original.selector.length + (original.raws.between || '').length + 1;
    edits.push({start: rule.source!.start!.offset! + rule.selector.length + (rule.raws.between || '').length + 1,
      end: rule.source!.end!.offset! - 1, body: native.slice(start, original.source!.end!.offset! - 1)});
  });
  if (!isDeepStrictEqual(order, markerDetailCompleteOwnership.receivers.map(row => row[0])) || declarations !== 309) {
    throw new Error('Incomplete/reordered native complete-modal inventory');
  }
  for (const edit of edits.reverse()) output = output.slice(0, edit.start) + edit.body + output.slice(edit.end);
  return output;
}
