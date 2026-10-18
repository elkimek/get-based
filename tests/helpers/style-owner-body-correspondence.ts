import assert from 'node:assert/strict';
import postcss from 'postcss';
export interface StyleReceiver {selector:string;media:string|null}
/** Restore finite native body whitespace only after exact ordered semantic proof. */
export function restoreReviewedStyleBodies(current:string,original:string,receivers:readonly StyleReceiver[]):string {
 const live=postcss.parse(current),native=postcss.parse(original),edits:Array<{start:number;end:number;after:string}>=[];
 const ancestry=(rule:postcss.Rule)=>{const result:string[]=[];for(let p:postcss.Rule['parent']|postcss.Document=rule.parent;p;p=p.parent){if(p.type==='atrule'){assert.equal(p.name,'media');result.unshift(p.params);}else assert.equal(p.type,'root','Only root/media ancestry is reviewed');}return result;};
 const find=(tree:postcss.Root,row:StyleReceiver)=>{const found:postcss.Rule[]=[];tree.walkRules(rule=>{if(rule.selector===row.selector&&JSON.stringify(ancestry(rule))===JSON.stringify(row.media?[row.media]:[]))found.push(rule);});assert.equal(found.length,1,'One exact reviewed selector/media receiver');return found[0]!;};
 const declarations=(rule:postcss.Rule)=>rule.nodes.map(node=>{assert.equal(node.type,'decl','No foreign body children');if(node.type!=='decl')throw new Error('Only declarations');return [node.prop,node.value,node.important===true];});
 const body=(source:string,rule:postcss.Rule)=>{const start=rule.source!.start!.offset+rule.selector.length+(rule.raws.between||'').length+1,end=rule.source!.end!.offset-1;assert.equal(source[start-1],'{');assert.equal(source[end],'}');assert.equal(source.slice(rule.source!.start!.offset,rule.source!.end!.offset),rule.toString());return {start,end};};
 assert.equal(new Set(receivers.map(row=>JSON.stringify(row))).size,receivers.length);
 for(const row of receivers){const a=find(live,row),z=find(native,row);assert.deepEqual(declarations(a),declarations(z),'Exact original ordered property/value/priority required BEFORE body correspondence');const from=body(original,z);edits.push({...body(current,a),after:original.slice(from.start,from.end)});}
 let result=current;for(const edit of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,edit.start)+edit.after+result.slice(edit.end);return result;
}
