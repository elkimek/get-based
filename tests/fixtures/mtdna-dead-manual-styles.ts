import postcss from 'postcss';
import assert from 'node:assert/strict';
const rules=[
  ['.dna-manual-grid',null,'display: grid; grid-template-columns: minmax(0, 1fr) 104px; gap: 10px;'],
  ['.dna-manual-genotype',null,'text-transform: uppercase; font-family: var(--font-mono); letter-spacing: 0.08em;'],
  ['.dna-manual-grid','(max-width: 560px)','grid-template-columns: 1fr;'],
] as const;
/** The original fixture stays unchanged. Only the independently proved dead rules may be deleted. */
export function withoutDeadManualRules(source:string):string {
  const tree=postcss.parse(source),edits:{start:number;end:number}[]=[];
  for(const [selector,media,body] of rules){
    const found:postcss.Rule[]=[];tree.walkRules(rule=>{if(rule.selector===selector && (media?rule.parent?.type==='atrule'&&rule.parent.name==='media'&&rule.parent.params===media:rule.parent===tree))found.push(rule);});
    assert.equal(found.length,1,'One exact old dead selector/media');const rule=found[0]!;
    assert.equal(rule.toString(),selector+' { '+body+' }','Old dead declarations/order unchanged');
    const start=rule.source!.start!.offset!,end=rule.source!.end!.offset!,line=source.lastIndexOf('\n',start)+1;
    assert.equal(source.slice(line,start),media?'  ':'');assert.equal(source[end],'\n');edits.push({start:line,end:end+1});
  }
  assert.equal(edits.length,3);let result=source;
  for(const x of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,x.start)+result.slice(x.end);
  assert.ok(!result.includes('.dna-manual-grid')&&!result.includes('.dna-manual-genotype'));return result;
}
