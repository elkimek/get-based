import assert from 'node:assert/strict';
import inverse from '../fixtures/wearable-strip-controller-inverse.json' with {type:'json'};
const number='(?:[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:e[+-]?[0-9]+)?|NaN|[+-]?Infinity)';
const point=new RegExp(`^${number},${number}$`);
/** Independent immutable native SVG grammar; unsupported foreign raw points never normalize actual data. */
const svg=/<svg class="wearable-sparkline (spark-neutral|spark-bad|spark-good)" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">\n    <line x1="0" y1="([^"]*)" x2="100" y2="([^"]*)" class="spark-baseline"\/>\n    <polyline points="([^"]*)" class="spark-line"\/>\n    <circle cx="([^"]*)" cy="([^"]*)" r="2" class="spark-last"\/>\n  <\/svg>/g;
export function expectedWearableSparklineHTML(original:string):string {
 let count=0;const result=original.replace(svg,(whole:string,_tone:string,start:string,end:string,rawPoints:string,lastX:string,lastY:string)=>{
  for(const scalar of[start,end,lastX,lastY])assert.match(scalar,new RegExp(`^${number}$`));for(const slot of rawPoints.split(' '))if(slot!=='')assert.match(slot,point,'Complete native numeric/nonfinite SVG nonempty slot grammar');count++;
  const changed=whole.replace('class="spark-baseline"/>','class="spark-baseline"></line>').replace('class="spark-line"/>','class="spark-line"></polyline>').replace('class="spark-last"/>','class="spark-last"></circle>');
  return '<!--[-->'+changed+'<!--]-->';
 });assert.equal(count,(original.match(/<svg class="wearable-sparkline /g)||[]).length,'Complete counted immutable native Sparkline grammar');return result;
}
type NodeRecord={type:number;name?:string;namespace?:string;attributes?:unknown[][];children?:NodeRecord[];text?:string};
function isSparkline(node:NodeRecord):boolean{return node.type===1&&node.name==='svg'&&node.namespace==='http://www.w3.org/2000/svg'&&node.attributes?.some(row=>row[1]==='class'&&/^wearable-sparkline spark-(?:neutral|bad|good)$/.test(String(row[2])))===true;}
export function expectedWearableSparklineDOM(original:unknown):unknown {
 const root=structuredClone(original)as NodeRecord;
 function visit(node:NodeRecord):void{if(!node.children)return;const result:NodeRecord[]=[];for(const child of node.children){if(isSparkline(child)){assert.ok(child.children);const elements=child.children.filter(item=>item.type===1);assert.deepEqual(elements.map(item=>[item.name,item.namespace]),[['line','http://www.w3.org/2000/svg'],['polyline','http://www.w3.org/2000/svg'],['circle','http://www.w3.org/2000/svg']]);assert.ok(elements.every(item=>item.children?.length===0));result.push({type:8,text:'['},child,{type:8,text:']'});}else{visit(child);result.push(child);}}node.children=result;}visit(root);return root;
}
export function expectedWearableSparklineReceipt(original:Record<string,unknown>):Record<string,unknown>{const result=structuredClone(original);if(typeof original['raw']==='string'){result['raw']=expectedWearableSparklineHTML(original['raw']);result['assignments']=(original['assignments']as string[]).map(expectedWearableSparklineHTML);}if(original['dom'])result['dom']=expectedWearableSparklineDOM(original['dom']);return result;}
/** Finite import/return inverse only; all old expressions remain the original existing fixture. */
export function historicalWearableSparklineControllerSource(source:string):string {
 const expressions=inverse.edits.filter(edit=>edit.component==='WearableSparkline'&&edit.kind==='sparkline');assert.equal(expressions.length,1);
 const currentImport="import {renderWearableSparklinePresentation} from './wearable-strip-sparkline-presentation.js';\n";
 const currentReturn="  return renderWearableSparklinePresentation({\n    toneClass: `${toneClass}`, width: `${VW}`, height: `${VH}`,\n    baselineStartY: `${baselineY}`, baselineWidth: `${VW}`, baselineEndY: `${baselineY}`,\n    points: `${pts}`, lastX: `${lastX}`, lastY: `${lastY}`,\n  });";
 assert.equal(source.split(currentImport).length,2);assert.equal(source.split(currentReturn).length,2);return source.replace(currentImport,'').replace(currentReturn,'  return '+expressions[0]!.after+';');
}
