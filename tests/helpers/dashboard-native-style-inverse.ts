import assert from 'node:assert/strict';
import postcss, {type Rule, type AtRule} from 'postcss';
import {compileNativeStyleBodies} from '../../scripts/native-recipe-styles.mjs';
import {compileDashboardLabMarkerDataStyles,compileDashboardLabMarkerWidgetStyles} from '../../scripts/dashboard-lab-markers-style-ownership.mjs';
import {compileDashboardWelcomeStyles as compileCurrentWelcome} from '../../scripts/dashboard-welcome-style-ownership.mjs';
import originals from '../fixtures/dashboard-native-style-original.json' with {type:'json'};
import {priorDashboardOwnership} from './dashboard-prior-style-roster.js';
import {restoreReviewedBiometricSource, restoreReviewedBiometricCss} from './dashboard-biometric-style-inverse.js';
type Lane=keyof typeof originals;
function groups(rule:Rule){const result:{name:string;params:string}[]=[];for(let p=rule.parent;p&&p.type!=='root';p=p.parent){assert.equal(p.type,'atrule');const group=p as AtRule;result.unshift({name:group.name,params:group.params});}return result;}
/** Each new recipe is first compiled by the actual complete owner. This inverse
 * preserves the original test input/roster contracts without changing assertions. */
function restoreRemainingSource(input:string,lane:Lane){
 const record=originals[lane],tree=postcss.parse(input),edits:{start:number;end:number;after:string}[]=[],rules:Rule[]=[],utilities:AtRule[]=[];
 tree.walkRules(rule=>{rules.push(rule);});tree.walkAtRules('utility',node=>{if(node.params.startsWith('dashboard-native-'))utilities.push(node);});
 assert.equal(utilities.length,record.records.length);
 for(const receiver of record.records){
  const utility=utilities.filter(node=>node.params===receiver.utility);assert.equal(utility.length,1);assert.equal(utility[0]!.parent,tree);
  assert.equal(utility[0]!.toString(),'@utility '+receiver.utility+' {'+receiver.body+'}','Exact independently captured recipe bytes');
  const ancestry='groups' in receiver.options?receiver.options.groups:receiver.condition?[{name:'media',params:receiver.condition}]:[];
  const matches=rules.filter(rule=>rule.selector===receiver.selector&&JSON.stringify(groups(rule))===JSON.stringify(ancestry));
  const occurrence='occurrence' in receiver.options?receiver.options.occurrence:0;
  if(!('occurrence' in receiver.options))assert.equal(matches.length,1);
  const rule=matches[occurrence];assert.ok(rule);assert.equal(rule.nodes.length,1);assert.equal(rule.nodes[0]!.type,'atrule');assert.equal(rule.nodes[0]!.toString(),'@apply gb:'+receiver.utility);
  const start=rule.source!.start!.offset!+rule.selector.length+(rule.raws.between||'').length+1,end=rule.source!.end!.offset!-1;
  assert.equal(input.slice(start,end),' @apply gb:'+receiver.utility+'; ');edits.push({start,end,after:receiver.body});
 }
 const first=utilities[0]!,last=utilities.at(-1)!,start=first.source!.start!.offset!-1,end=last.source!.end!.offset!;
 assert.equal(input.slice(start,end),'\n'+record.records.map(receiver=>'@utility '+receiver.utility+' {'+receiver.body+'}').join('\n'),'Only exact contiguous new metadata is removed');
 edits.push({start,end,after:''});let restored=input;for(const edit of edits.sort((a,b)=>b.start-a.start))restored=restored.slice(0,edit.start)+edit.after+restored.slice(edit.end);
 return restored;
}
async function compilePrior(lane:Lane,input:string,file:string,root:string){
 const current=lane==='data'?await compileDashboardLabMarkerDataStyles(input,file,root):lane==='widgets'?await compileDashboardLabMarkerWidgetStyles(input,file,root):await compileCurrentWelcome(lane==='core'?'greeting':'welcome',input,file,root);
 const legacyInput=lane==='data'?restoreReviewedBiometricSource(input):input;
 const restored=restoreRemainingSource(legacyInput,lane);
 const prior=await compileNativeStyleBodies(restored,file,root,priorDashboardOwnership[lane]);
 const legacyCss=lane==='data'?restoreReviewedBiometricCss(current.css):current.css;
 assert.equal(legacyCss,prior.css,'Whole current CSS remains exact after only the qualified readable CTA foreground and manual-empty remove placement corrections');return prior;
}
export const dashboardLabMarkerDataOwnership=priorDashboardOwnership.data;
export const dashboardLabMarkerWidgetOwnership=priorDashboardOwnership.widgets;
export function compilePriorDashboardDataStyles(input:string,file:string,root:string){return compilePrior('data',input,file,root);}
export const welcomeOwnership=priorDashboardOwnership.welcome;
export const greetingOwnership=priorDashboardOwnership.core;
export function compileDashboardWelcomeStyles(lane:'welcome'|'greeting',input:string,file:string,root:string){return compilePrior(lane==='welcome'?'welcome':'core',input,file,root);}
