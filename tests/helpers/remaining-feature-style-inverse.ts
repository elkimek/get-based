import assert from 'node:assert/strict';
import postcss,{type Rule,type AtRule} from 'postcss';
import {compileNativeStyleBodies} from '../../scripts/native-recipe-styles.mjs';
import {compileDnaManualStyles as compileCurrentGenetics} from '../../scripts/dna-manual-style-ownership.mjs';
import {compileMarkerDetailCompleteStyles as compileCurrentMarker} from '../../scripts/marker-detail-complete-style-ownership.mjs';
import originals from '../fixtures/remaining-feature-style-original.json' with {type:'json'};
import {priorFeatureOwnership} from './remaining-feature-prior-roster.js';
export {dnaManualOwnership,mtDnaPreviewOwnership} from '../../scripts/dna-manual-style-ownership.mjs';
export {markerDetailCompleteOwnership} from '../../scripts/marker-detail-complete-style-ownership.mjs';
type Lane='genetics'|'marker';
function media(rule:Rule){const result:string[]=[];for(let p=rule.parent;p&&p.type!=='root';p=p.parent){assert.equal(p.type,'atrule');const group=p as AtRule;assert.equal(group.name,'media');result.unshift(group.params);}return result;}
export function restoreRemainingFeatureSource(input:string,lane:Lane){
 const record=originals[lane],tree=postcss.parse(input),rules:Rule[]=[],utilities:AtRule[]=[],edits:{start:number;end:number;after:string}[]=[];
 tree.walkRules(rule=>{rules.push(rule);});tree.walkAtRules('utility',node=>{if(node.params.startsWith('feature-native-'))utilities.push(node);});assert.equal(utilities.length,record.records.length);
 for(const receiver of record.records){
  const utility=utilities.filter(node=>node.params===receiver.utility);assert.equal(utility.length,1);assert.equal(utility[0]!.parent,tree);assert.equal(utility[0]!.toString(),'@utility '+receiver.utility+' {'+receiver.body+'}');
  const matches=rules.filter(rule=>rule.selector===receiver.selector&&JSON.stringify(media(rule))===JSON.stringify(receiver.condition?[receiver.condition]:[]));
  const occurrence='occurrence' in receiver.options?receiver.options.occurrence:0;if(!('occurrence' in receiver.options))assert.equal(matches.length,1);const rule=matches[occurrence];assert.ok(rule);assert.equal(rule.nodes.length,1);assert.equal(rule.nodes[0]!.type,'atrule');assert.equal(rule.nodes[0]!.toString(),'@apply gb:'+receiver.utility);
  const start=rule.source!.start!.offset!+rule.selector.length+(rule.raws.between||'').length+1,end=rule.source!.end!.offset!-1;assert.equal(input.slice(start,end),' @apply gb:'+receiver.utility+'; ');edits.push({start,end,after:receiver.body});
 }
 const start=utilities[0]!.source!.start!.offset!-1,end=utilities.at(-1)!.source!.end!.offset!;assert.equal(input.slice(start,end),'\n'+record.records.map(receiver=>'@utility '+receiver.utility+' {'+receiver.body+'}').join('\n'));edits.push({start,end,after:''});let restored=input;for(const edit of edits.sort((a,b)=>b.start-a.start))restored=restored.slice(0,edit.start)+edit.after+restored.slice(edit.end);return restored;
}
async function compilePrior(lane:Lane,input:string,file:string,root:string){
 const current=lane==='genetics'?await compileCurrentGenetics(input,file,root):await compileCurrentMarker(input,file,root);
 const prior=await compileNativeStyleBodies(restoreRemainingFeatureSource(input,lane),file,root,priorFeatureOwnership[lane]);assert.equal(current.css,prior.css,'Current full stylesheet byte equality before every retained original contract');return prior;
}
export const geneticsPresentationOwnership=priorFeatureOwnership.genetics;
export function compileDnaManualStyles(input:string,file:string,root:string){return compilePrior('genetics',input,file,root);}
export function compileMarkerDetailCompleteStyles(input:string,file:string,root:string){return compilePrior('marker',input,file,root);}
