import assert from 'node:assert/strict';
import postcss,{type Rule} from 'postcss';
import ownership from '../fixtures/category-presentation-style-ownership.json' with {type:'json'};
import metadata from '../fixtures/category-presentation-metadata-whitespace.json' with {type:'json'};
/** Invert only the reviewed status tint; every other stylesheet byte survives. */
export function restoreReadableCategoryStatusCss(compiled:string):string {
 const selector='.chart-card-status.status-high',matches:Rule[]=[];
 postcss.parse(compiled).walkRules(rule=>{if(rule.selector===selector)matches.push(rule);});
 assert.equal(matches.length,1,'Exactly one chart high-status receiver');
 const rule=matches[0]!;assert.equal(rule.parent?.type,'root','Unchanged chart status scope');
 const old=selector+' {\n  color: var(--red);\n}';
 const current=selector+' {\n  color: var(--red);\n  background: color-mix(in srgb, var(--red-bg) 25%, transparent);\n}';
 assert.equal(rule.toString(),current,'Exact reviewed high-status foreground, tint, priority and formatting');
 const start=rule.source!.start!.offset!,end=rule.source!.end!.offset!;
 assert.equal(compiled.slice(start,end),current);
 return compiled.slice(0,start)+old+compiled.slice(end);
}
/** Source-backed formatting inverse for exactly the authorized 129 receiver bodies.
 * Declaration names, values, priority and order are checked before any restoration.
 * Selectors, media, comments and every byte outside these bodies remain untouched,
 * except the separately pinned 130 metadata newlines from the 129 owned recipes. */
export function restoreCategoryPresentationStyleBodies(compiled:string,original:string):string {
 compiled=restoreReadableCategoryStatusCss(compiled);
 assert.ok(compiled.startsWith(metadata.after.text), 'Exact actual owned metadata prefix before inverse');
 assert.equal(compiled.slice(metadata.inverseEdit.start,metadata.inverseEdit.end),metadata.inverseEdit.before);
 compiled=compiled.slice(0,metadata.inverseEdit.start)+metadata.inverseEdit.after+compiled.slice(metadata.inverseEdit.end);
 assert.ok(compiled.startsWith(metadata.before.text), 'All original prefix/comment bytes retained');
 const current=postcss.parse(compiled),before=postcss.parse(original);
 const select=(root:ReturnType<typeof postcss.parse>,selector:string,condition:string|null)=>{const matches:Rule[]=[];root.walkRules(rule=>{const media=rule.parent?.type==='atrule'?rule.parent.params:null;if(rule.selector===selector&&media===condition)matches.push(rule);});assert.equal(matches.length,1);return matches[0]!;};
 const declarations=(rule:Rule)=>rule.nodes.map(node=>{assert.equal(node.type,'decl');assert.ok(node.type==='decl');return [node.prop,node.value,node.important===true];});
 const span=(rule:Rule,source:string)=>{const start=rule.source!.start!.offset!,end=rule.source!.end!.offset!;const open=start+rule.selector.length+(rule.raws.between||'').length;assert.equal(source[open],'{');assert.equal(source[end-1],'}');return [open+1,end-1] as const;};
 assert.equal(ownership.length,129);const edits=ownership.map(([_utility,selector,condition])=>{assert.ok(typeof selector==='string');assert.ok(condition===null||typeof condition==='string');const actual=select(current,selector,condition),old=select(before,selector,condition);assert.deepEqual(declarations(actual),declarations(old));const [start,end]=span(actual,compiled),[oldStart,oldEnd]=span(old,original);return {start,end,value:original.slice(oldStart,oldEnd)};}).sort((a,b)=>a.start-b.start);
 let cursor=0,result='';for(const e of edits){assert.ok(e.start>=cursor);result+=compiled.slice(cursor,e.start)+e.value;cursor=e.end;}return result+compiled.slice(cursor);
}
