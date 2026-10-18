import postcss from 'postcss';
import assert from 'node:assert/strict';
import {geneticsSectionOwnership} from '../../scripts/genetics-section-style-ownership.mjs';

// Reconstruct only new section recipe bodies after exact ordered declaration checks.
// Older import-specific foreign-byte oracles keep their original ownership boundary.
export function restoreSectionBodies(source: string, original: string) {
  const old = postcss.parse(original), edits: {start:number;end:number;body:string}[]=[];
  postcss.parse(source).walkRules(rule => {
    const media:string[]=[]; for(let p=rule.parent;p&&p.type!=='root';p=p.parent)
      if(p.type==='atrule') media.unshift(p.name+':'+p.params);
    if(!geneticsSectionOwnership.receivers.some(([,selector,condition])=>selector===rule.selector&&JSON.stringify(media)===JSON.stringify(condition?['media:'+condition]:[]))) return;
    const matches:typeof rule[]=[]; old.walkRules(candidate=>{
      const parents:string[]=[];for(let p=candidate.parent;p&&p.type!=='root';p=p.parent)if(p.type==='atrule')parents.unshift(p.name+':'+p.params);
      if(candidate.selector===rule.selector&&JSON.stringify(parents)===JSON.stringify(media))matches.push(candidate);
    });
    assert.equal(matches.length,1);const native=matches[0]!;
    const declarations=(node:typeof rule)=>node.nodes.map(n=>n.type==='decl'?[n.prop,n.value,!!n.important]:[n.type,n.toString()]);
    assert.deepEqual(declarations(rule),declarations(native));
    const start=rule.source!.start!.offset!+rule.selector.length+(rule.raws.between||'').length+1;
    const end=rule.source!.end!.offset!-1;
    const nativeStart=native.source!.start!.offset!+native.selector.length+(native.raws.between||'').length+1;
    edits.push({start,end,body:original.slice(nativeStart,native.source!.end!.offset!-1)});
  });
  assert.equal(edits.length,125);let result=source;
  for(const e of edits.reverse()) result=result.slice(0,e.start)+e.body+result.slice(e.end);
  return result;
}
