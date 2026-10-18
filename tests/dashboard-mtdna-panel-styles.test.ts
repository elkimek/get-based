import {restoreGenomeBodies,restoreLensBodies} from './fixtures/dashboard-genome-style-compatibility.js';
import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import {dashboardBiometricOwnership} from '../scripts/dashboard-biometric-style-ownership.mjs';
import {compileLegacyDashboardDataStyles as compileDashboardMtdnaPanelStyles} from './helpers/dashboard-insights-style-inverse.js';
import {restoreDashboardBiometricBodies} from './helpers/dashboard-biometric-style-inverse.js';
import {dashboardMtdnaPanelOwnership} from '../scripts/dashboard-mtdna-panel-style-ownership.mjs';
const root=process.cwd(),inputPath=path.join(root,'css/dashboard-data.base.css');
const input=fs.readFileSync(inputPath,'utf8'),original=fs.readFileSync(new URL('./fixtures/dashboard-mtdna-panel-original.css',import.meta.url),'utf8');
function signature(css:string){const tree=postcss.parse(css),rows:unknown[]=[];tree.walk(node=>{
 if(node.type==='rule')rows.push(['rule',node.selector]);else if(node.type==='decl')rows.push(['decl',node.prop,node.value,node.important===true]);else if(node.type==='atrule')rows.push(['at',node.name,node.params]);else if(node.type==='comment')rows.push(['comment',node.text]);
});return rows;}
function foreign(css:string){const tree=postcss.parse(css),edits:Array<{start:number;end:number}>=[];
 tree.walkRules(rule=>{const condition=rule.parent?.type==='atrule'?rule.parent.params:null;
  if(!dashboardMtdnaPanelOwnership.receivers.some(([,selector,media])=>selector===rule.selector&&media===condition))return;
  const start=rule.source?.start?.offset,end=rule.source?.end?.offset;if(typeof start!=='number'||typeof end!=='number')throw new Error('Native body coordinates required');
  const open=start+rule.selector.length+(rule.raws.between||'').length;expect(css.slice(start,end)).toBe(rule.toString());expect(css[open]).toBe('{');expect(css[end-1]).toBe('}');edits.push({start:open+1,end:end-1});
 });expect(edits).toHaveLength(dashboardMtdnaPanelOwnership.receivers.length);
 let result=css;for(const edit of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,edit.start)+'<owned-body>'+result.slice(edit.end);return result;
}
async function exact(source:string){const compiled=await compileDashboardMtdnaPanelStyles(source,inputPath,root);const output={...compiled,css:restoreDashboardBiometricBodies(compiled.css,original)};
 expect(signature(output.css)).toEqual(signature(original));expect(foreign(restoreLensBodies(restoreGenomeBodies(output.css,original),original))).toBe(foreign(original));expect(output.receivers).toHaveLength(dashboardBiometricOwnership.receivers.length);return output;}
describe('complete panel/loading and qualified study stylesheet',()=>{
 it('preserves full native AST, media, declaration priorities, order and foreign bytes',async()=>{await exact(input);});
 it('retains the mixed mobile contribution rule and shared correction link literally',async()=>{const out=await exact(input);expect(out.css).toContain('.db-mtdna-head,\n  .db-mtdna-coupling,\n  .db-genome-contribute { align-items: flex-start; flex-direction: column; }');const rules:unknown[]=[];postcss.parse(out.css).walkRules(rule=>{if(rule.selector==='.db-genome-contribute-link:hover')rules.push(rule.nodes.map(n=>n.type==='decl'?[n.prop,n.value,!!n.important]:[n.type,n.toString()]));});expect(rules).toEqual([[['border-color','var(--accent)',false]]]);});
 for(const [name,mutate]of [
  ['foreign body',(css:string)=>css.replace('padding: 8px 10px;','padding: 9px 10px;')],
  ['panel value',(css:string)=>css.replace('gap: 10px;','gap: 11px;')],
  ['missing receiver',(css:string)=>css.replace('@apply gb:dashboard-mtdna-panel;','display: block;')],
  ['missing utility',(css:string)=>css.replace('@utility dashboard-mtdna-panel','@utility foreign')],
  ['wrong media',(css:string)=>css.replace('@media (max-width: 680px)','@media (max-width: 681px)')],
  ['duplicate receiver',(css:string)=>css+'\n.db-mtdna-panel { @apply gb:dashboard-mtdna-panel; }'],
 ]as const)it('rejects '+name,async()=>{await expect(exact(mutate(input))).rejects.toThrow();});
});
