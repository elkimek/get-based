import {describe,it,expect} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import postcss from 'postcss';
import {compileDnaManualStyles,geneticsPresentationOwnership} from './helpers/remaining-feature-style-inverse.js';
import {geneticsSectionOwnership} from '../scripts/genetics-section-style-ownership.mjs';
import {restoreSectionBodies} from './fixtures/genetics-section-style-compatibility.js';
import {withoutDeadManualRules} from './fixtures/mtdna-dead-manual-styles.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),inputPath=path.join(root,'css/genetics.base.css');
function facts(css:string){const rows:unknown[]=[];postcss.parse(css).walkRules(rule=>{const media:string[]=[];for(let p=rule.parent;p&&p.type!=='root';p=p.parent)if(p.type==='atrule')media.unshift(p.name+':'+p.params);rows.push([rule.selector,media,rule.nodes.map(n=>n.type==='decl'?[n.prop,n.value,!!n.important]:[n.type,n.toString()])]);});return rows;}
describe('complete Genetics section ordered native recipes',()=>{
 it('owns125/412 and preserves full original CSS and all bytes outside the composed bodies',async()=>{
  const input=await fs.readFile(inputPath,'utf8'),original=withoutDeadManualRules(await fs.readFile(new URL('./fixtures/dna-manual-original.css',import.meta.url),'utf8'));
  const result=await compileDnaManualStyles(input,inputPath,root);
  const raw=process.env['GETBASED_GENETICS_SECTION_RAW'];if(raw){await fs.writeFile(path.join(raw,'styles-input.css'),input,{flag:'wx'});await fs.writeFile(path.join(raw,'styles-compiled.css'),result.css,{flag:'wx'});await fs.writeFile(path.join(raw,'styles-original.css'),original,{flag:'wx'});}
  expect(geneticsSectionOwnership.receivers).toHaveLength(125);expect(geneticsSectionOwnership.declarationCount).toBe(412);
  expect(geneticsPresentationOwnership.receivers).toHaveLength(173);expect(geneticsPresentationOwnership.declarationCount).toBe(568);
  expect(facts(result.css)).toEqual(facts(original));
  const restored=restoreSectionBodies(result.css,original);
  // Existing48 recipes format only their own bodies; compare the exact native baseline emitted before this migration.
  const baseline=await fs.readFile(new URL('./fixtures/genetics-section-before-output.css',import.meta.url),'utf8');
  expect(restored).toBe(baseline);
 });
 it('rejects missing, duplicate, foreign and moved native section receivers',async()=>{
  const input=await fs.readFile(inputPath,'utf8');for(const bad of [input.replace('@apply gb:genetics-section-empty-stub;',''),input+'\n.foreign { @apply gb:genetics-section-empty-stub; }',input+'\n.genetics-empty-stub { @apply gb:genetics-section-empty-stub; }',input.replace('@media (max-width: 600px)','@media (max-width: 599px)')])await expect(compileDnaManualStyles(bad,inputPath,root)).rejects.toThrow();
 });
 it('detects value, priority, declaration order and foreign byte changes',async()=>{
  const original=withoutDeadManualRules(await fs.readFile(new URL('./fixtures/dna-manual-original.css',import.meta.url),'utf8'));
  for(const bad of [original.replace('display: flex; align-items: flex-start','display: grid; align-items: flex-start'),original.replace('display: flex; align-items: flex-start','display: flex !important; align-items: flex-start'),original.replace('display: flex; align-items: flex-start','align-items: flex-start; display: flex')])expect(()=>restoreSectionBodies(bad,original)).toThrow();
  expect(facts(original.replace('.dna-preview-modal { width: min(90vw, 560px)','.dna-preview-modal { width: min(90vw, 561px)'))).not.toEqual(facts(original));
 });
});
