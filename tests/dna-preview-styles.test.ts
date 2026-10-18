import {describe,expect,it} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import postcss from 'postcss';
import {compileDnaManualStyles,geneticsPresentationOwnership} from './helpers/remaining-feature-style-inverse.js';
import {dnaSnpPreviewOwnership} from '../scripts/dna-snp-preview-style-ownership.mjs';
import {withoutDeadManualRules} from './fixtures/mtdna-dead-manual-styles.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'), inputPath=path.join(root,'css/genetics.base.css');
function facts(source:string){const rows:unknown[]=[];postcss.parse(source).walkRules(rule=>{const parents:string[]=[];for(let p=rule.parent;p&&p.type!=='root';p=p.parent)if(p.type==='atrule')parents.unshift(p.name+':'+p.params);rows.push([rule.selector,parents,rule.nodes.map(n=>n.type==='decl'?[n.prop,n.value,!!n.important]:[n.type,n.toString()])]);});return rows;}
describe('autosomal preview exclusive exact native recipes',()=>{
 it('owns16/49 only and preserves complete original CSS including manual/mtDNA/shared order',async()=>{
  const input=await fs.readFile(inputPath,'utf8'),original=withoutDeadManualRules(await fs.readFile(new URL('./fixtures/dna-manual-original.css',import.meta.url),'utf8')),result=await compileDnaManualStyles(input,inputPath,root);
  expect(dnaSnpPreviewOwnership.receivers).toHaveLength(16);expect(dnaSnpPreviewOwnership.declarationCount).toBe(49);expect(geneticsPresentationOwnership.receivers).toHaveLength(173);expect(geneticsPresentationOwnership.declarationCount).toBe(568);
  expect(result.receivers.filter(r=>dnaSnpPreviewOwnership.receivers.some(([u])=>u===r.utility)).map(r=>[r.selector,r.condition])).toEqual(dnaSnpPreviewOwnership.receivers.map(([,s,m])=>[s,m]));expect(facts(result.css)).toEqual(facts(original));
 });
 it('rejects an extra/missing/renamed receiver without permitting selector or utility aliases',async()=>{
  const input=await fs.readFile(inputPath,'utf8');for(const broken of [input+'\n.foreign { @apply gb:dna-snp-preview-apoe; }',input.replace('@apply gb:dna-snp-preview-apoe;',''),input.replace('.dna-preview-apoe {','.dna-preview-apoe.changed {')])await expect(compileDnaManualStyles(broken,inputPath,root)).rejects.toThrow();
 });
 it('keeps exact native declaration values/order and foreign shared CSS as substantive oracles',async()=>{
  const original=withoutDeadManualRules(await fs.readFile(new URL('./fixtures/dna-manual-original.css',import.meta.url),'utf8'));
  expect(original).toContain('.dna-preview-variant { font-weight: 400;');
  expect(facts(original.replace('.dna-preview-variant { font-weight: 400;','.dna-preview-variant { font-weight: 401;'))).not.toEqual(facts(original));
  expect(original).toContain('.dna-preview-modal { width: min(90vw, 560px)');
  expect(facts(original.replace('.dna-preview-modal { width: min(90vw, 560px)','.dna-preview-modal { width: min(90vw, 561px)'))).not.toEqual(facts(original));
 });
});
