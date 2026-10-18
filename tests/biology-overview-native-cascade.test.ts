import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
import {historicalBiologyNotesStyle} from './helpers/biology-overview-native-cascade.js';
import type {FrozenStyleBlock} from './helpers/frozen-style-scope.js';
const original=JSON.parse(fs.readFileSync('tests/fixtures/biology-reading-original.json','utf8')) as {styleBlocks:FrozenStyleBlock[]};
const copy=()=>structuredClone(original.styleBlocks);
const notes=(blocks:FrozenStyleBlock[])=>blocks.find(block=>block.selector==='.biology-reading-notes > summary')!;
describe('historical Biology nested reading cascade',()=>{
 it('composes only the exact later original reading-summary rule',()=>{
  expect(historicalBiologyNotesStyle(original.styleBlocks)).toBe('[data-original] .biology-reading-notes > summary {cursor: pointer;padding: 10px 0;color: var(--text-primary);font-weight: 500}');
 });
 it('rejects a reordered reading rule that no longer overrides disclosure defaults',()=>{
  const blocks=copy(),note=notes(blocks);blocks.splice(blocks.indexOf(note),1);blocks.unshift(note);
  expect(()=>historicalBiologyNotesStyle(blocks)).toThrow('follows disclosure defaults');
 });
 it('rejects changed padding instead of normalizing the candidate',()=>{
  const blocks=copy();notes(blocks).declarations=notes(blocks).declarations.replace('10px','8px');
  expect(()=>historicalBiologyNotesStyle(blocks)).toThrow('Exact historical reading summary declarations');
 });
 it('rejects duplicate, missing or redirected reference selectors',()=>{
  const duplicate=copy();duplicate.push({...notes(duplicate)});
  expect(()=>historicalBiologyNotesStyle(duplicate)).toThrow('One exact historical Biology reading summary rule');
  const redirected=copy();notes(redirected).selector+=' , [data-current] summary';
  expect(()=>historicalBiologyNotesStyle(redirected)).toThrow('One exact historical Biology reading summary rule');
 });
 it('rejects a conditional rule or changed disclosure baseline',()=>{
  const conditional=copy();notes(conditional).media='(max-width: 650px)';
  expect(()=>historicalBiologyNotesStyle(conditional)).toThrow('unconditional');
  const changed=copy(),disclosure=changed.find(block=>block.selector.includes('.biology-coherence-breakdown summary'))!;
  disclosure.declarations=disclosure.declarations.replace('8px','10px');
  expect(()=>historicalBiologyNotesStyle(changed)).toThrow('Exact historical disclosure declarations');
 });
});
