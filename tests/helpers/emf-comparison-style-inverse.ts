import {restoreEMFStyleBodies} from './emf-editor-style-inverse.js';
import postcss from 'postcss';
import owned from '../fixtures/emf-comparison-style-bodies.json' with {type:'json'};

/** Restore only exact reviewed EMF comparison declaration bodies for prior full CSS assertions. */
export function restoreEMFComparisonBodies(current:string,original:string):string {
 current=restoreEMFStyleBodies(current,original);
 const source=postcss.parse(current),target=postcss.parse(original);
 const edits:Array<{start:number;end:number;after:string}>=[];
 const photos = [
  {selector: '.emf-lightbox', media: null, declarations: [
   ['position','fixed'], ['inset','0'], ['z-index','10000'], ['background','rgba(0,0,0,0.85)'],
   ['display','flex'], ['align-items','center'], ['justify-content','center'], ['cursor','pointer'],
  ].map(([property,value]) => ({property,value,important:false}))},
  {selector: '.emf-lightbox img', media: null, declarations: [
   ['max-width','90vw'], ['max-height','90vh'], ['border-radius','8px'], ['cursor','default'],
  ].map(([property,value]) => ({property,value,important:false}))},
 ];
 for(const row of [...owned,...photos]){
  const matches=(tree:postcss.Root)=>{const found:postcss.Rule[]=[];tree.walkRules(rule=>{const media=rule.parent?.type==='atrule'?rule.parent.params:null;if(rule.selector===row.selector&&media===row.media)found.push(rule);});return found;};
  const live=matches(source),native=matches(target);if(live.length!==1||native.length!==1)throw new Error('Exact single EMF comparison receiver required');
  const signature=(rule:postcss.Rule)=>rule.nodes.map(node=>{if(node.type!=='decl')throw new Error('Only reviewed EMF comparison declarations');return{property:node.prop,value:node.value,important:!!node.important};});
  if(JSON.stringify(signature(live[0]!))!==JSON.stringify(row.declarations)||JSON.stringify(signature(native[0]!))!==JSON.stringify(row.declarations))throw new Error('Exact ordered EMF comparison declarations required');
  const body=(rule:postcss.Rule,text:string)=>{const start=rule.source?.start?.offset,end=rule.source?.end?.offset;if(typeof start!=='number'||typeof end!=='number'||text.slice(start,end)!==rule.toString())throw new Error('Exact EMF comparison source coordinates required');const open=start+rule.selector.length+(rule.raws.between||'').length;if(text[open]!=='{'||text[end-1]!=='}')throw new Error('Exact EMF comparison body framing required');return{start:open+1,end:end-1};};
  const at=body(live[0]!,current),from=body(native[0]!,original);edits.push({...at,after:original.slice(from.start,from.end)});
 }
 let result=current;for(const edit of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,edit.start)+edit.after+result.slice(edit.end);return result;
}
