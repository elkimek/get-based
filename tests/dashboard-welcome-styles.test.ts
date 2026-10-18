import fs from 'node:fs';
import path from 'node:path';
import {expect,it} from 'vitest';
import postcss from 'postcss';
import {compileDashboardWelcomeStyles,welcomeOwnership,greetingOwnership} from './helpers/dashboard-native-style-inverse.js';
import originals from './fixtures/dashboard-welcome-styles-original.json' with {type:'json'};
const root=path.resolve(process.cwd());
function structure(css:string):unknown{
 const tree=postcss.parse(css);const rows:unknown[]=[];
 tree.walkRules(rule=>{
   const groups:string[]=[];let parent=rule.parent;
   while(parent&&parent.type!=='root'){if(parent.type==='atrule')groups.unshift('@'+parent.name+' '+parent.params);parent=parent.parent;}
   rows.push([rule.selector,groups,rule.nodes.filter(n=>n.type==='decl').map(n=>n.type==='decl'?[n.prop,n.value,n.important===true]:null)]);
 });return rows;
}
for(const lane of ['welcome','greeting'] as const){
 it('keeps every original '+lane+' selector/media/declaration/value/priority/order and foreign byte',async()=>{
   const file=new URL('../css/dashboard-'+(lane==='welcome'?'welcome':'core')+'.base.css',import.meta.url);const input=fs.readFileSync(file,'utf8');
   const result=await compileDashboardWelcomeStyles(lane,input,file.pathname,root);expect(structure(result.css)).toEqual(structure(originals[lane]));
   let restored=result.css;
   for(const receiver of [...result.receivers].reverse()){
     const native=postcss.parse(originals[lane]);const selected:postcss.Rule[]=[];native.walkRules(rule=>{if(rule.selector===receiver.selector)selected.push(rule);});
     const owned=(lane==='welcome'?welcomeOwnership:greetingOwnership).receivers.find(row=>row[0]===receiver.utility)!;
     const rule=selected.find(rule=>{const p=rule.parent;return owned[2]===null?p?.type==='root':p?.type==='atrule'&&p.params===owned[2];})!;
     const start=rule.source!.start!.offset!+rule.selector.length+(rule.raws.between||'').length+1,end=rule.source!.end!.offset!-1;
     const current=postcss.parse(restored);let match:postcss.Rule|undefined;
     current.walkRules(r=>{const p=r.parent;if(r.selector===receiver.selector&&(owned[2]===null?p?.type==='root':p?.type==='atrule'&&p.params===owned[2]))match=r;});
     const n=match!;const s=n.source!.start!.offset!+n.selector.length+(n.raws.between||'').length+1,e=n.source!.end!.offset!-1;
     restored=restored.slice(0,s)+originals[lane].slice(start,end)+restored.slice(e);
   }
   expect(restored).toBe(originals[lane]);expect(result.receivers).toHaveLength(lane==='welcome'?78:4);
 });
 it('rejects a missing owned '+lane+' receiver',async()=>{
  const file=new URL('../css/dashboard-'+(lane==='welcome'?'welcome':'core')+'.base.css',import.meta.url);const input=fs.readFileSync(file,'utf8');
  await expect(compileDashboardWelcomeStyles(lane,input.replace('@apply gb:dashboard-'+lane+'-01;','color: red;'),file.pathname,root)).rejects.toThrow();
 });
}

for(const [name,from,to]of [
 ['wrong selector','.welcome-hero {','.foreign-welcome {'],
 ['wrong media','@media (max-width: 600px)','@media (max-width: 599px)'],
 ['unknown utility','@utility dashboard-welcome-01','@utility unknown-dashboard-owner'],
 ['missing declaration','  padding: 28px 0 18px;',''],
 ['wrong compiler import','prefix(gb)','prefix(other)'],
] as const){
 it('rejects '+name+' in the owned style source',async()=>{
  const file=new URL('../css/dashboard-welcome.base.css',import.meta.url);
  const original=fs.readFileSync(file,'utf8');expect(original).toContain(from);
  await expect(compileDashboardWelcomeStyles('welcome',original.replace(from,to),file.pathname,root)).rejects.toThrow();
 });
}
