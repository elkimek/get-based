import assert from 'node:assert/strict';
import originals from '../fixtures/wearable-strip-original.json' with {type:'json'};
const native=(originals as {name:string;original:{raw?:unknown;dom?:unknown}}[]).find(row=>row.name==='stub no summary')!.original;
assert.equal(typeof native.raw,'string');
export const originalWearableStubHTML=native.raw as string;
/** Apply only two root comments to immutable native Stub markup; other strip branches stay exact. */
export function expectedWearableStubHTML(original:string):string {assert.equal(original,originalWearableStubHTML,'Whole immutable native discovery markup');return '<!--[-->'+original+'<!--]-->';}
type NodeRecord={type:number;name?:string;namespace?:string;attributes?:unknown[][];children?:NodeRecord[];text?:string};
function stub(node:NodeRecord):boolean {return node.type===1&&node.name==='section'&&node.namespace==='http://www.w3.org/1999/xhtml'&&node.attributes?.some(row=>row[1]==='class'&&row[2]==='wearable-strip wearable-strip-stub')===true;}
/** Original tree only; preserve every element/attribute/text/namespace/default and foreign node. */
export function expectedWearableStubDOM(original:unknown):unknown {
 const value=structuredClone(original)as NodeRecord;
 assert.ok(value.children);const indices=value.children.flatMap((child,index)=>stub(child)?[index]:[]);assert.ok(indices.length<=1);
 if(indices.length){assert.ok(value.name==='main'||value.name==='body');const index=indices[0]!;
  const canonical=(native.dom as NodeRecord).children!.find(stub)!;assert.deepEqual(value.children[index],canonical,'Whole immutable original Stub tree');
  value.children.splice(index,1,{type:8,text:'['},value.children[index]!,{type:8,text:']'});
 }
 return value;
}
/** Expected-only complete public/raw/action/data receipt transport; candidate is untouched. */
export function expectedWearableStubReceipt(original:Record<string,unknown>):Record<string,unknown> {
 const expected=structuredClone(original);
 if(typeof original['raw']==='string'&&original['raw']===originalWearableStubHTML){expected['raw']=expectedWearableStubHTML(original['raw']);expected['assignments']=(original['assignments']as string[]).map(raw=>expectedWearableStubHTML(raw));}
 if(original['dom'])expected['dom']=expectedWearableStubDOM(original['dom']);return expected;
}

export function historicalWearableStripControllerSource(source:string):string {
 const currentImport="import {projectWearableStripStubActions,renderWearableStripStubPresentation} from './wearable-strip-stub-presentation.js';\n";const after="  const connect = `${wearableActionAttrs('open-settings-wearables')}`;\n  const dismiss = `${wearableActionAttrs('dismiss-stub')}`;\n  return renderWearableStripStubPresentation(projectWearableStripStubActions(connect,dismiss));";const before="  return renderWearableStripPresentation(\"WearableStripStub\", \"stub\", {\n      connectActionAttributes: () => (wearableActionAttrs('open-settings-wearables')),\n      dismissActionAttributes: () => (wearableActionAttrs('dismiss-stub'))\n    });";
 assert.equal(source.split(currentImport).length,2);assert.equal(source.split(after).length,2);return source.replace(currentImport,'').replace(after,before);
}
