import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import {dashboardAIDataOwnership} from '../scripts/dashboard-ai-cta-style-ownership.mjs';
import {compileLegacyDashboardDataStyles as compileDashboardMtdnaPanelStyles} from './helpers/dashboard-insights-style-inverse.js';
import {restoreDashboardBiometricBodies} from './helpers/dashboard-biometric-style-inverse.js';
import {dashboardGenomePresentationOwnership} from '../scripts/dashboard-mtdna-panel-style-ownership.mjs';
import {dashboardGenomeRowsOwnership} from '../scripts/dashboard-genome-rows-style-ownership.mjs';
import {restoreGenomeBodies} from './fixtures/dashboard-genome-style-compatibility.js';
const root=process.cwd(),inputPath=path.join(root,'css/dashboard-data.base.css');
function facts(css:string){const result:unknown[]=[];postcss.parse(css).walk(n=>{if(n.type==='rule')result.push(['rule',n.selector]);else if(n.type==='decl')result.push(['decl',n.prop,n.value,!!n.important]);else if(n.type==='atrule')result.push(['at',n.name,n.params]);else if(n.type==='comment')result.push(['comment',n.text]);});return result;}
describe('remaining Dashboard Genome ordered native recipes',()=>{
 it('owns83/295 and preserves whole native AST and foreign source bytes including Panel/Study/mixed rules',async()=>{
  const input=fs.readFileSync(inputPath,'utf8'),old=fs.readFileSync(new URL('./fixtures/dashboard-mtdna-panel-original.css',import.meta.url),'utf8'),compiled=await compileDashboardMtdnaPanelStyles(input,inputPath,root),result={...compiled,css:restoreDashboardBiometricBodies(compiled.css,old)};
  const raw=process.env['GETBASED_DASHBOARD_GENOME_RAW'];if(raw)for(const [name,css]of [['input',input],['compiled',result.css],['original',old]])fs.writeFileSync(path.join(raw,'styles-'+name+'.css'),css!,{flag:'wx'});
  expect(dashboardGenomeRowsOwnership.receivers).toHaveLength(83);expect(dashboardGenomeRowsOwnership.declarationCount).toBe(295);expect(dashboardGenomePresentationOwnership.receivers).toHaveLength(121);expect(dashboardGenomePresentationOwnership.declarationCount).toBe(421);expect(dashboardAIDataOwnership.receivers).toHaveLength(130);expect(dashboardAIDataOwnership.declarationCount).toBe(460);
  expect(facts(result.css)).toEqual(facts(old));expect(restoreGenomeBodies(result.css,old)).toBe(fs.readFileSync(new URL('./fixtures/dashboard-genome-before-output.css',import.meta.url),'utf8'));
 });
 for(const [name,mutate]of [
  ['missing',(css:string)=>css.replace('@apply gb:dashboard-genome-list;','')],
  ['duplicate',(css:string)=>css+'\n.db-genome-list { @apply gb:dashboard-genome-list; }'],
  ['foreign',(css:string)=>css+'\n.foreign { @apply gb:dashboard-genome-list; }'],
  ['selector',(css:string)=>css.replace('.db-genome-list {','.db-genome-list.changed {')],
 ]as const)it('rejects '+name+' recipe receiver',async()=>{const input=fs.readFileSync(inputPath,'utf8');await expect(compileDashboardMtdnaPanelStyles(mutate(input),inputPath,root)).rejects.toThrow();});
 it('rejects declaration values, priority and ordering changes instead of masking them',()=>{
  const old=fs.readFileSync(new URL('./fixtures/dashboard-mtdna-panel-original.css',import.meta.url),'utf8');
  for(const bad of [old.replace('display: grid; gap: 7px;','display: flex; gap: 7px;'),old.replace('display: grid; gap: 7px;','display: grid !important; gap: 7px;'),old.replace('display: grid; gap: 7px;','gap: 7px; display: grid;')])expect(()=>restoreGenomeBodies(bad,old)).toThrow();
 });
});
