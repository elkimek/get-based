import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import postcss from 'postcss';
import {compileDashboardLabMarkerDataStyles,compileDashboardLabMarkerWidgetStyles} from '../scripts/dashboard-lab-markers-style-ownership.mjs';
import {compileDashboardInsightsStyles} from '../scripts/dashboard-insights-style-ownership.mjs';
import {compileDashboardAIWidgetStyles} from '../scripts/dashboard-ai-cta-style-ownership.mjs';
import {restoreReviewedBiometricCss} from './helpers/dashboard-biometric-style-inverse.js';
const root=path.resolve(import.meta.dirname,'..');
const fixtures=path.join(import.meta.dirname,'fixtures');
const lanes=[['dashboard-data.base.css',compileDashboardInsightsStyles,compileDashboardLabMarkerDataStyles],['dashboard-widgets.base.css',compileDashboardAIWidgetStyles,compileDashboardLabMarkerWidgetStyles]] as const;
const scope=JSON.parse(readFileSync(path.join(fixtures,'dashboard-lab-markers-style-scope.json'),'utf8')) as {rows:{file:string;selected:{selector:string;media:string|null}[]}[]};
function primitives(css:string){const rows:unknown[]=[];postcss.parse(css).walk(n=>{const ancestry:unknown[]=[];for(let p:postcss.Container|postcss.Document|undefined=n.parent;p;p=p.parent)if(p.type==='atrule')ancestry.unshift([(p as postcss.AtRule).name,(p as postcss.AtRule).params]);else if(p.type==='rule')ancestry.unshift(['rule',(p as postcss.Rule).selector]);if(n.type==='decl')rows.push(['decl',n.prop,n.value,!!n.important,ancestry]);else if(n.type==='comment')rows.push(['comment',n.text,ancestry]);});return rows;}
function rules(css:string){const result:{selector:string;media:string|null;start:number;end:number;text:string}[]=[];postcss.parse(css).walkRules(r=>{const start=r.source!.start!.offset+r.selector.length+(r.raws.between||'').length+1,end=r.source!.end!.offset-1;result.push({selector:r.selector,media:r.parent!.type==='atrule'?(r.parent as postcss.AtRule).params:null,start,end,text:css.slice(start,end)});});return result;}
it.each(lanes)('%s preserves every ordered CSS declaration and every foreign stylesheet byte through owned-only inverses',async(name,priorCompiler,nextCompiler)=>{
 const priorSource=readFileSync(path.join(fixtures,'dashboard-lab-markers-original-'+name),'utf8'),nextSource=readFileSync(path.join(root,'css',name),'utf8'),inputPath=path.join(root,'css',name);
 const prior=await priorCompiler(priorSource,inputPath,root),compiled=await nextCompiler(nextSource,inputPath,root),next={...compiled,css:name==='dashboard-data.base.css'?restoreReviewedBiometricCss(compiled.css):compiled.css};expect(primitives(next.css)).toEqual(primitives(prior.css));
 const selected=scope.rows.find(row=>row.file==='css/'+name)!.selected,a=rules(prior.css),z=rules(next.css);
 const edits=selected.map(row=>{const old=a.find(r=>r.selector===row.selector&&r.media===row.media)!,current=z.find(r=>r.selector===row.selector&&r.media===row.media)!;return{...current,after:old.text};});let restored=next.css;
 for(const e of edits.sort((a,b)=>b.start-a.start)){expect(restored.slice(e.start,e.end)).toBe(e.text);restored=restored.slice(0,e.start)+e.after+restored.slice(e.end);}expect(restored).toBe(prior.css);
});
it.each(lanes)('%s preserves a foreign multiline rule exactly',async(name,_prior,nextCompiler)=>{const input=readFileSync(path.join(root,'css',name),'utf8'),foreign='\n.foreign-owner {\n background:\n  linear-gradient(135deg, var(--accent), transparent),\n  var(--bg-card);\n}\n';const {css}=await nextCompiler(input+foreign,path.join(root,'css',name),root);expect(css).toContain(foreign);});
const invalid:[string,(s:string)=>string][]=[['unknown receiver',s=>s.replace('@apply gb:dashboard-lab-markers-db-spotlight;','@apply gb:dashboard-lab-markers-unknown;')],['duplicate receiver',s=>s+'\n.db-spotlight {display:flex;}\n'],['duplicate recipe',s=>s+'\n@utility dashboard-lab-markers-db-spotlight {display:flex;}\n'],['extra declaration',s=>s.replace('@apply gb:dashboard-lab-markers-db-spotlight;','@apply gb:dashboard-lab-markers-db-spotlight; color:red;')],['wrong media',s=>s.replace('.db-spotlight { @apply gb:dashboard-lab-markers-db-spotlight; }','@media(max-width:731px){.db-spotlight { @apply gb:dashboard-lab-markers-db-spotlight; }}')]];
it.each(invalid)('rejects %s without loosening exclusive ownership',async(_label,mutate)=>{const input=readFileSync(path.join(root,'css/dashboard-data.base.css'),'utf8'),changed=mutate(input);expect(changed).not.toBe(input);await expect(compileDashboardLabMarkerDataStyles(changed,path.join(root,'css/dashboard-data.base.css'),root)).rejects.toMatchObject({code:'ERR_ASSERTION'});});

const originalPins = {
  "dashboard-data.base.css": {
    "bytes": 55881,
    "sha256": "9ff37a74f6172a0c9a7b29bd224dd55a186b3cd8dc10345fc5ba9c5e7f1aa16d"
  },
  "dashboard-widgets.base.css": {
    "bytes": 12827,
    "sha256": "e362662d4e60d8151bbb665e156c610d92646a4f6419987edc6174e808c80686"
  }
} as const;
it.each(lanes)('%s keeps the complete immutable native stylesheet source fixture exact',(name)=>{const bytes=readFileSync(path.join(fixtures,'dashboard-lab-markers-original-'+name)),pin=originalPins[name];expect(bytes.length).toBe(pin.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(pin.sha256);});
