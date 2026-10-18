import assert from 'node:assert/strict';
import {scopedFrozenStyles,type FrozenStyleBlock} from './frozen-style-scope.js';

/** Complete only the original-side cascade omitted by the overview receipt.
 * The full native stylesheet placed the shared reading rule after disclosure
 * defaults. Both rules survive, with their original order and declarations. */
export function historicalBiologyNotesStyle(blocks: readonly FrozenStyleBlock[]): string {
  const disclosureSelector='.biology-score-methodology summary, .biology-score-ai-details summary, .biology-coherence-breakdown summary, .biology-context-review-details > summary';
  const notesSelector='.biology-reading-notes > summary';
  const disclosures=blocks.filter(block=>block.selector===disclosureSelector);
  const notes=blocks.filter(block=>block.selector===notesSelector);
  assert.equal(disclosures.length,1,'One exact historical Biology disclosure rule');
  assert.equal(notes.length,1,'One exact historical Biology reading summary rule');
  const disclosure=disclosures[0]!,note=notes[0]!;
  assert.equal(disclosure.media,null,'Historical disclosure rule is unconditional');
  assert.equal(note.media,null,'Historical reading summary rule is unconditional');
  assert.equal(disclosure.declarations,'cursor: pointer;font-weight: 500;font-size: 14px;padding: 8px 0','Exact historical disclosure declarations');
  assert.equal(note.declarations,'cursor: pointer;padding: 10px 0;color: var(--text-primary);font-weight: 500','Exact historical reading summary declarations');
  assert(blocks.indexOf(disclosure)<blocks.indexOf(note),'Historical reading summary follows disclosure defaults');
  return scopedFrozenStyles([note]);
}
