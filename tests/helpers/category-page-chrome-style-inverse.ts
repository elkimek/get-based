import assert from 'node:assert/strict';
import postcss,{type Rule} from 'postcss';
import inverse from '../fixtures/category-page-chrome-style-inverse.json' with {type:'json'};
export const categoryPageChromeStyleOwners = inverse.owners;
/** Restore only ten qualified Category chrome bodies and their eleven metadata LFs.
 * All declarations and raw compiled bodies qualify before restoration; every
 * foreign selector, value, comment, media position and historical fixture survives. */
export function restoreCategoryPageChromeStyleBodies(compiled:string):string {
 assert.equal(inverse.owners.length,10);assert.equal(inverse.ownedBodies.length,10);
 assert.ok(compiled.startsWith(inverse.metadata.afterPrefix),'Exact Category chrome metadata prefix');
 assert.ok(compiled.slice(inverse.metadata.afterPrefix.length).startsWith('/* Category routes:'),'Exact first native comment boundary');
 const m=inverse.metadata.inverseEdit;assert.equal(compiled.slice(m.start,m.end),m.before);
 compiled=compiled.slice(0,m.start)+m.after+compiled.slice(m.end);
 assert.ok(compiled.startsWith(inverse.metadata.beforePrefix),'Original Category metadata prefix');
 const tree=postcss.parse(compiled),edits:{start:number;end:number;value:string}[]=[];
 for(const row of inverse.ownedBodies){
  const matches:Rule[]=[];tree.walkRules(rule=>{if(rule.selector===row.selector&&(rule.parent?.type==='atrule'?rule.parent.params:null)===row.condition)matches.push(rule);});
  assert.equal(matches.length,1);const rule=matches[0]!;
  assert.deepEqual(rule.nodes.map(n=>{assert.equal(n.type,'decl');assert.ok(n.type==='decl');return{property:n.prop,value:n.value,important:!!n.important};}),row.declarations);
  const start=rule.source!.start!.offset!+rule.selector.length+(rule.raws.between||'').length+1,end=rule.source!.end!.offset!-1;
  assert.equal(compiled.slice(start,end),row.compiled);edits.push({start,end,value:row.native});
 }
 let cursor=0,out='';for(const e of edits.sort((a,b)=>a.start-b.start)){assert.ok(e.start>=cursor);out+=compiled.slice(cursor,e.start)+e.value;cursor=e.end;}
 return out+compiled.slice(cursor);
}
