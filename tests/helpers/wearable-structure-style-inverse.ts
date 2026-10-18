import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';

interface StructureReceiver {
  utility:string;
  selector:string;
  condition:string|null;
  before:string;
  after:string;
}
const fixture=JSON.parse(readFileSync(new URL('../fixtures/wearable-structure-style-bodies.json',import.meta.url),'utf8')) as {receivers:StructureReceiver[]};

/** Preserve old independent oracles only after checking every new actual rule. */
export function restoreWearableStructureStyles(css:string):string {
  assert.equal(fixture.receivers.length,102);
  const tree=postcss.parse(css),edits:Array<{start:number;end:number;after:string}>=[];
  for(const receiver of fixture.receivers){
    const matches:postcss.Rule[]=[];
    tree.walkRules(rule=>{
      if(rule.selector!==receiver.selector)return;
      const condition=rule.parent?.type==='atrule'?rule.parent.params:null;
      if(condition===receiver.condition)matches.push(rule);
    });
    assert.equal(matches.length,1,'Exactly one current structural selector/media owner');
    const rule=matches[0]!;
    assert.equal(rule.parent?.type,receiver.condition===null?'root':'atrule');
    if(rule.parent?.type==='atrule'){
      assert.equal(rule.parent.name,'media');assert.equal(rule.parent.parent?.type,'root');
    }
    assert.equal(rule.toString(),receiver.after,'Exact current whole rule, including ordered values, priorities and notes');
    const start=rule.source!.start!.offset!,end=rule.source!.end!.offset!;
    assert.equal(css.slice(start,end),receiver.after);
    edits.push({start,end,after:receiver.before});
  }
  let restored=css;
  for(const edit of edits.sort((a,b)=>b.start-a.start))restored=restored.slice(0,edit.start)+edit.after+restored.slice(edit.end);
  return restored;
}
