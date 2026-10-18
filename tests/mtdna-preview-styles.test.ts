import {restoreSectionBodies} from './fixtures/genetics-section-style-compatibility.js';
import {withoutDeadManualRules} from './fixtures/mtdna-dead-manual-styles.js';
import {dnaSnpPreviewOwnership} from '../scripts/dna-snp-preview-style-ownership.mjs';
import {describe,it,expect} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import postcss from 'postcss';
import {compileDnaManualStyles,mtDnaPreviewOwnership,geneticsPresentationOwnership} from './helpers/remaining-feature-style-inverse.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'), inputPath=path.join(root,'css/genetics.base.css');
function facts(source:string){const rows:unknown[]=[];postcss.parse(source).walkRules(rule=>{const media:string[]=[];for(let p=rule.parent;p&&p.type!=='root';p=p.parent)if(p.type==='atrule')media.unshift(p.name+':'+p.params);rows.push([rule.selector,media,rule.nodes.map(n=>n.type==='decl'?[n.prop,n.value,!!n.important]:[n.type,n.toString()])]);});return rows;}
function foreign(source:string){const edits:{start:number;end:number}[]=[];postcss.parse(source).walkRules(rule=>{if(![...mtDnaPreviewOwnership.receivers,...dnaSnpPreviewOwnership.receivers].some(([,selector])=>selector===rule.selector))return;edits.push({start:rule.source!.start!.offset!+rule.selector.length+(rule.raws.between||'').length+1,end:rule.source!.end!.offset!-1});});expect(edits).toHaveLength(29);let text=source;for(const x of edits.reverse())text=text.slice(0,x.start)+'OWNED'+text.slice(x.end);return text;}
describe('mtDNA exclusive bodies in one existing genetics recipe pass',()=>{
  it('preserves the full original ordered CSS and every foreign byte, including manual SNP/shared bodies',async()=>{
    const input=await fs.readFile(inputPath,'utf8'),old=withoutDeadManualRules(await fs.readFile(new URL('./fixtures/mtdna-preview-original.css',import.meta.url),'utf8')),result=await compileDnaManualStyles(input,inputPath,root);
    expect(facts(result.css)).toEqual(facts(old));expect(foreign(restoreSectionBodies(result.css,old))).toBe(foreign(old));
    expect(result.receivers.map(x=>x.utility)).toEqual(geneticsPresentationOwnership.receivers.map(x=>x[0]));
    expect(result.receivers.filter(x=>mtDnaPreviewOwnership.receivers.some(([u])=>u===x.utility)).map(x=>[x.selector,x.condition])).toEqual(mtDnaPreviewOwnership.receivers.map(x=>[x[1],x[2]]));
  });
  it('rejects missing/duplicate/moved/foreign receivers rather than broadening ownership',async()=>{
    const input=await fs.readFile(inputPath,'utf8');for(const bad of [input.replace('@apply gb:mtdna-preview-haplogroup;',''),input+'\n.mtdna-preview-haplogroup { @apply gb:mtdna-preview-haplogroup; }',input.replace('.mtdna-preview-haplogroup { @apply','@media (max-width: 800px) { .mtdna-preview-haplogroup { @apply').replace('@apply gb:mtdna-preview-haplogroup; }','@apply gb:mtdna-preview-haplogroup; } }'),input+'\n.foreign { @apply gb:mtdna-preview-haplogroup; }'])await expect(compileDnaManualStyles(bad,inputPath,root)).rejects.toThrow();
  });
  it('detects changed mtDNA declarations, cascade order and shared foreign bodies',async()=>{
    const old=withoutDeadManualRules(await fs.readFile(new URL('./fixtures/mtdna-preview-original.css',import.meta.url),'utf8'));expect(facts(old.replace('font-size: 28px; font-weight: 700','font-weight: 700; font-size: 28px'))).not.toEqual(facts(old));expect(facts(old.replace('.mtdna-hg-value { font-size: 28px','.mtdna-hg-value { font-size: 29px'))).not.toEqual(facts(old));expect(foreign(old.replace('.dna-preview-modal { width: min(90vw, 560px)','.dna-preview-modal { width: min(90vw, 561px)'))).not.toBe(foreign(old));
  });
  it('permits exactly the three original dead-rule deletions and rejects changed/missing dead bodies',async()=>{
    const old=await fs.readFile(new URL('./fixtures/mtdna-preview-original.css',import.meta.url),'utf8');
    const clean=withoutDeadManualRules(old);expect(clean).not.toContain('.dna-manual-grid');expect(clean).not.toContain('.dna-manual-genotype');
    for(const bad of [old.replace('grid-template-columns: 1fr;','grid-template-columns: 2fr;'),old.replace('.dna-manual-genotype {','.different-dead {')])expect(()=>withoutDeadManualRules(bad)).toThrow();
  });

});
