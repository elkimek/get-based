import {readFileSync} from 'node:fs';
import path from 'node:path';
import postcss,{type Rule} from 'postcss';
import {expect} from 'vitest';
interface BodyInverse {selector:string;condition:string|null;before:string;after:string}
const fixture=JSON.parse(readFileSync(path.join(import.meta.dirname,'../fixtures/sidebar-styles-original.json'),'utf8')) as {lanes:{lane:string;inverse:BodyInverse[]}[]};
function conditions(rule:Rule):string[]{const out:string[]=[];for(let p:Rule['parent']|postcss.Document=rule.parent;p;p=p.parent){if(p.type==='atrule'){expect(p.name).toBe('media');out.unshift(p.params);}else expect(p.type).toBe('root');}return out;}
/** Restore only exact qualified Sidebar-owned body lexemes; foreign bytes and all values stay checked. */
export function restoreSidebarStyleBodies(lane:string,compiled:string):string {
 const rows=fixture.lanes.find(x=>x.lane===lane)?.inverse;if(!rows)return compiled;
 const rules:Rule[]=[];postcss.parse(compiled).walkRules(r=>{rules.push(r);});const edits:{start:number;end:number;before:string;after:string}[]=[];
 for(const row of rows){const matches=rules.filter(r=>r.selector===row.selector&&JSON.stringify(conditions(r))===JSON.stringify(row.condition?[row.condition]:[]));expect(matches).toHaveLength(1);const rule=matches[0]!;const start=rule.source!.start!.offset!+rule.selector.length+(rule.raws.between||'').length+1,end=rule.source!.end!.offset!-1;expect(compiled.slice(start,end)).toBe(row.before);edits.push({start,end,before:row.before,after:row.after});}
 let result=compiled;for(const e of edits.sort((a,b)=>b.start-a.start)){expect(result.slice(e.start,e.end)).toBe(e.before);result=result.slice(0,e.start)+e.after+result.slice(e.end);}return result;
}
