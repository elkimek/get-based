import {contextProfileOwnership} from '../scripts/context-modal-style-ownership.mjs';
import {supplementImportProgressOwnership} from '../scripts/supplement-import-progress-style-ownership.mjs';
import {supplementImpactOwnership} from '../scripts/supplement-impact-style-ownership.mjs';
import {supplementEditorOwnership} from '../scripts/supplement-editor-style-ownership.mjs';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {expect,it} from 'vitest';
import postcss from 'postcss';
import {compileSupplementProfileStyles,supplementProfileOwnership} from '../scripts/supplement-form-style-ownership.mjs';
import {dashboardLabNotesOwnership} from '../scripts/dashboard-lab-notes-style-ownership.mjs';
import {supplementDashboardOwnership} from '../scripts/supplement-dashboard-style-ownership.mjs';
import {supplementFormOwnership} from '../scripts/supplement-form-style-ownership.mjs';
const root=path.resolve(__dirname,'..'),inputPath=path.join(root,'css/context-profile.base.css');
const input=readFileSync(inputPath,'utf8'),original=readFileSync(path.join(__dirname,'fixtures/supplement-form-original.css'),'utf8');
function primitives(css:string){const rows:unknown[]=[];postcss.parse(css).walk(n=>{const ancestry:unknown[]=[];for(let p:postcss.Node|undefined=n.parent;p;p=p.parent)if(p.type==='atrule'){const at=p as postcss.AtRule;ancestry.unshift([at.name,at.params]);}else if(p.type==='rule')ancestry.unshift(['rule',(p as postcss.Rule).selector]);if(n.type==='decl')rows.push(['decl',n.prop,n.value,!!n.important,ancestry]);else if(n.type==='comment')rows.push(['comment',n.text,ancestry]);});return rows;}
it('appends only eleven Notes receivers and preserves all 904 ordered native declaration/comment ancestry records',async()=>{
 expect(dashboardLabNotesOwnership.receivers).toHaveLength(11);expect(dashboardLabNotesOwnership.declarationCount).toBe(54);
 expect(supplementProfileOwnership.receivers).toEqual([...supplementDashboardOwnership.receivers,...supplementFormOwnership.receivers,...dashboardLabNotesOwnership.receivers,...supplementImportProgressOwnership.receivers,...supplementImpactOwnership.receivers,...supplementEditorOwnership.receivers,...contextProfileOwnership.receivers]);
 expect(supplementProfileOwnership.declarationCount).toBe(891);
 const result=await compileSupplementProfileStyles(input,inputPath,root);expect(result.receivers).toHaveLength(243);
 expect(primitives(original)).toHaveLength(904);expect(primitives(result.css)).toEqual(primitives(original));
});
const foreign='/* unrelated foreign owner remains exact */\n.foreign-notes {\n background:\n   linear-gradient(135deg, var(--accent), transparent),\n   var(--bg-card);\n}\n';
it('keeps foreign multiline values and excludes compile recipes from output',async()=>{const {css}=await compileSupplementProfileStyles(input+'\n'+foreign,inputPath,root);expect(css).toContain(foreign);expect(css).not.toContain('@utility');expect(css).not.toContain('@apply');});
const invalid:[string,(source:string)=>string][]=[
 ['unknown Notes receiver',s=>s.replace('@apply gb:dashboard-lab-notes-notes-section;','@apply gb:dashboard-lab-notes-unknown;')],
 ['duplicate Notes receiver',s=>s+'\n.notes-section { margin-bottom: 20px; }\n'],
 ['duplicate Notes recipe',s=>s+'\n@utility dashboard-lab-notes-notes-section { margin-bottom: 20px; }\n'],
 ['extra undeclared Notes declaration',s=>s.replace('@apply gb:dashboard-lab-notes-notes-section;','@apply gb:dashboard-lab-notes-notes-section; color: red;')],
 ['wrong Notes media ancestry',s=>s.replace('.notes-section { @apply gb:dashboard-lab-notes-notes-section; }','@media (max-width: 731px) {.notes-section { @apply gb:dashboard-lab-notes-notes-section; }}')],
];
it.each(invalid)('rejects %s without relaxing old ownership',async(_label,mutate)=>{const changed=mutate(input);expect(changed).not.toBe(input);await expect(compileSupplementProfileStyles(changed,inputPath,root)).rejects.toMatchObject({code:'ERR_ASSERTION'});});
