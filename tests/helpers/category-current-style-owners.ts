import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import postcss,{type Rule} from 'postcss';
import type {NativeRecipeCompileResult} from '../../scripts/native-recipe-styles.mjs';
import {completeFeatureStyleOwnership} from '../../scripts/complete-feature-style-ownership.mjs';
type Receiver=NativeRecipeCompileResult['receivers'][number];
const source=fs.readFileSync('tests/fixtures/complete-category-views-authored-original.css','utf8');
assert.equal(createHash('sha256').update(source).digest('hex'),'ec0bf4fe822b4d6ff913222f7b768cd7c304955e23c363179217483caad8ef1d');
const tree=postcss.parse(source),priorNames:string[]=[],priorRules=new Map<string,Rule>(),remaining:Rule[]=[];
for(const node of tree.nodes)if(node.type==='atrule'&&node.name==='utility')priorNames.push(node.params);
tree.walkAtRules('apply',node=>{assert.ok(node.params.startsWith('gb:'));assert.equal(node.parent?.type,'rule');priorRules.set(node.params.slice(3),node.parent as Rule);});
tree.walkRules(rule=>{if(rule.parent?.type==='atrule'&&(rule.parent.name==='utility'||rule.parent.name.endsWith('keyframes')))return;if(rule.nodes.some(n=>n.type==='decl'))remaining.push(rule);});
assert.equal(priorNames.length,289);assert.equal(priorRules.size,289);assert.equal(remaining.length,58);
assert.equal(remaining.reduce((n,r)=>n+r.nodes.filter(d=>d.type==='decl').length,0),197);
function media(rule:Rule):string|null {if(rule.parent?.type==='root')return null;assert.equal(rule.parent?.type,'atrule');assert.ok(rule.parent?.type==='atrule');assert.equal(rule.parent.name,'media');assert.equal(rule.parent.parent?.type,'root');return rule.parent.params;}
const added=completeFeatureStyleOwnership['category-views'].receivers;
assert.equal(added.length,58);assert.equal(completeFeatureStyleOwnership['category-views'].declarationCount,197);
assert.deepEqual(added.map(([,selector,condition])=>[selector,condition]),remaining.map(rule=>[rule.selector,media(rule)]));
/** Validate the complete current graph before exposing the unchanged289-owner subset. */
export function priorCategoryStyleReceivers(current:readonly Receiver[]):readonly Receiver[] {
 assert.equal(current.length,347);assert.equal(new Set(current.map(r=>r.utility)).size,347);
 assert.deepEqual(current.map(r=>r.utility),[...priorNames,...added.map(([name])=>name)]);
 for(const [index,name] of priorNames.entries()){const before=priorRules.get(name);assert.ok(before);assert.equal(current[index]!.selector,before.selector);assert.equal(current[index]!.condition,media(before));}
 for(const [index,rule] of remaining.entries()){
  const actual=current[289+index]!;assert.equal(actual.selector,rule.selector);assert.equal(actual.condition,media(rule));
  const start=rule.source!.start!.offset!+rule.selector.length+(rule.raws.between||'').length+1,end=rule.source!.end!.offset!-1;
  assert.equal(actual.body,source.slice(start,end),'Every added native body remains byte exact');
 }
 return current.slice(0,289);
}
