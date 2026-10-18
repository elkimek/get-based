// @vitest-environment node
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {expect,it} from 'vitest';
import postcss from 'postcss';
import {dashboardInsightsOwnership} from '../scripts/dashboard-insights-style-ownership.mjs';
import {compileCurrentDashboardInsightsStyles as compileDashboardInsightsStyles} from './helpers/dashboard-current-insights-styles.js';
const canonical=process.cwd(),inputPath=path.join(canonical,'css/dashboard-data.base.css');
const input=readFileSync(inputPath,'utf8'),prior=readFileSync(path.join(import.meta.dirname,'fixtures/dashboard-insights-styles-original.css'),'utf8');
type Edit={start:number;end:number;before:string;after:string};
const bodies=JSON.parse(readFileSync(path.join(import.meta.dirname,'fixtures/dashboard-insights-style-bodies.json'),'utf8')) as {edits:Edit[]};
function restore(css:string){let out=css;for(const e of [...bodies.edits].sort((a,b)=>b.start-a.start)){expect(out.slice(e.start,e.end)).toBe(e.before);out=out.slice(0,e.start)+e.after+out.slice(e.end);}return out;}
function primitives(css:string){const rows:unknown[]=[];postcss.parse(css).walk(n=>{const ancestry:unknown[]=[];for(let p:postcss.Node|undefined=n.parent;p;p=p.parent)if(p.type==='atrule')ancestry.unshift([(p as postcss.AtRule).name,(p as postcss.AtRule).params]);else if(p.type==='rule')ancestry.unshift(['rule',(p as postcss.Rule).selector]);if(n.type==='decl')rows.push(['decl',n.prop,n.value,!!n.important,ancestry]);else if(n.type==='comment')rows.push(['comment',n.text,ancestry]);});return rows;}
it('restores every prior Dashboard byte through nine exclusive body inverses',async()=>{const out=await compileDashboardInsightsStyles(input,inputPath,canonical);expect(out.receivers).toHaveLength(159);expect(dashboardInsightsOwnership.declarationCount).toBe(576);expect(restore(out.css)).toBe(prior);expect(primitives(out.css)).toEqual(primitives(prior));expect(primitives(prior)).toHaveLength(1169);});
it('retains the entire mixed Cyberterm group and every foreign multiline value without reserialization',async()=>{const themeStart=prior.indexOf('[data-theme="cyberterm"] .db-insight,');expect(themeStart).toBeGreaterThan(0);const end=prior.indexOf('}',themeStart)+1;const theme=prior.slice(themeStart,end);const foreign='/* unrelated owner remains exact */\n.foreign-insights {\n background:\n   linear-gradient(135deg, var(--accent), transparent),\n   var(--bg-card);\n}\n';const {css}=await compileDashboardInsightsStyles(input+'\n'+foreign,inputPath,canonical);expect(css).toContain(theme);expect(css).toContain(foreign);expect(css).not.toContain('@utility');expect(css).not.toContain('@apply');});
const invalid:[string,(source:string)=>string][]=[
 ['unknown receiver',s=>s.replace('@apply gb:dashboard-insights-db-insights-list;','@apply gb:dashboard-insights-unknown;')],
 ['duplicate receiver',s=>s+'\n.db-insights-list { display: grid; gap: 10px; }\n'],
 ['duplicate recipe',s=>s+'\n@utility dashboard-insights-db-insights-list { display: grid; gap: 10px; }\n'],
 ['extra declaration',s=>s.replace('@apply gb:dashboard-insights-db-insights-list;','@apply gb:dashboard-insights-db-insights-list; color: red;')],
 ['wrong media ancestry',s=>s.replace('.db-insights-list { @apply gb:dashboard-insights-db-insights-list; }','@media (max-width: 731px) {.db-insights-list { @apply gb:dashboard-insights-db-insights-list; }}')],
];
it.each(invalid)('rejects %s through unchanged ownership safety',async(_label,mutate)=>{const changed=mutate(input);expect(changed).not.toBe(input);await expect(compileDashboardInsightsStyles(changed,inputPath,canonical)).rejects.toMatchObject({code:'ERR_ASSERTION'});});
it('the exact inverse rejects a changed compiled owned body',async()=>{const {css}=await compileDashboardInsightsStyles(input,inputPath,canonical);const body=bodies.edits[0]!;expect(css.slice(body.start,body.end)).toBe(body.before);const altered=body.before.replace('gap: 10px;','gap: 11px;');expect(altered).not.toBe(body.before);const changed=css.slice(0,body.start)+altered+css.slice(body.end);expect(changed).not.toBe(css);expect(()=>restore(changed)).toThrow();});

import {restoreDashboardInsightsBodies} from './helpers/dashboard-insights-style-inverse.js';
it('named selector inverse preserves all prior bytes and rejects owned corruption',async()=>{const {css}=await compileDashboardInsightsStyles(input,inputPath,canonical);expect(restoreDashboardInsightsBodies(css)).toBe(prior);const owned=bodies.edits[0]!;expect(css.slice(owned.start,owned.end)).toBe(owned.before);const changed=owned.before.replace('gap: 10px;','gap: 11px;');expect(changed).not.toBe(owned.before);expect(()=>restoreDashboardInsightsBodies(css.slice(0,owned.start)+changed+css.slice(owned.end))).toThrow();});
