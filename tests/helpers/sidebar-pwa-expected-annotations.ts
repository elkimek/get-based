import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {JSDOM} from 'jsdom';
import {expectedSidebarHTML} from './sidebar-owned-receipts.js';
import {standaloneLensEntries} from './sidebar-lens-entries.js';
import type {SidebarNativeOracle,SidebarReceipt} from './sidebar-pwa-receipt.js';

const oracleFile='tests/fixtures/sidebar-pwa-native.json';
const oracleSHA256='f9501cd92c3bb5254c73d54c2ec2318b3d38803f3ff93d573f5a1708ad462502';
export const sidebarPwaGrammarSources={
  'js/components/SidebarNavigation.svelte':'5271f17fd374c04b9fcaffc47cf8d79bce7cadd19971ab3fd82afccd8c25e422',
  'js/components/SidebarIcon.svelte':'681e0f5ad3ab638ba30fd67957b16b01cdd64c0ae3889a48ed069345bf43ca43',
  'js/components/ConditionalSidebarItem.svelte':'fe282d61dfc81246a862fb0e95a44f348114bbd82c216744e23102ba5787e6e1',
  'js/components/SidebarCategoryItem.svelte':'dcb89314d27fcf32ec4d8a9210d3eb6e3c4463686e6294af84983cfdc2175cb2',
  'tests/helpers/sidebar-owned-receipts.ts':'6a2fe08828b151b2e37e3ec87b631c73f719182f95ff869f3782a1ae4600de2c',
  'tests/fixtures/sidebar-presentation-branches.json':'4c87d540653365d87c1ac9b607e5fe39d17ea6dabd5508717e01ad2eeac6de32',
}as const;
const sha=(source:string)=>createHash('sha256').update(source).digest('hex');
const readSource=(file:string)=>readFileSync(file,'utf8');
/** Fixed original states and the existing independent, fully consumed native
 * grammar qualify expected coordinates. No browser receipt enters this path. */
export function qualifySidebarPwaGrammar(read=readSource):void {
  assert.equal(sha(read(oracleFile)),oracleSHA256,'Immutable original Sidebar oracle');
  for(const[file,digest]of Object.entries(sidebarPwaGrammarSources))assert.equal(sha(read(file)),digest,'Complete qualified Sidebar grammar: '+file);
  const lock=JSON.parse(read('package-lock.json'))as{packages:Record<string,{version?:string}>};
  assert.equal(lock.packages['node_modules/svelte']?.version,'5.57.1','Qualified Sidebar SDK compiler');
}
export interface SidebarExpectedNode {type:number;name?:string;namespace?:string|null;attributes?:string[][];children?:SidebarExpectedNode[];text?:string|null}
function node(value:Node):SidebarExpectedNode {
  if(value.nodeType!==1)return{type:value.nodeType,text:value.nodeValue};
  const element=value as Element;
  return{type:1,name:element.localName,namespace:element.namespaceURI,attributes:[...element.attributes].map(a=>[a.name,a.value]),children:[...element.childNodes].map(node)};
}
function annotate(native:readonly SidebarExpectedNode[],template:readonly SidebarExpectedNode[],qualifyAttributes:boolean):SidebarExpectedNode[] {
  let index=0;
  const result=template.map(expected=>{
    if(expected.type===8){assert.match(expected.text??'',/^(?:\[(?:-?\d+)?|\]|)$/,'Only exact SDK coordinates from the qualified expected grammar');return structuredClone(expected);}
    const original=native[index++];assert(original,'Every expected semantic node has an original receiver');
    assert.equal(original.type,expected.type);assert.equal(original.name,expected.name);assert.equal(original.namespace,expected.namespace);
    if(original.type!==1){assert.equal(original.text,expected.text);return structuredClone(original);}
    if(qualifyAttributes)assert.deepEqual(original.attributes,expected.attributes,'Expected grammar preserves all original ordered attrs');
    assert(original.children&&expected.children);
    return{...structuredClone(original),children:annotate(original.children,expected.children,qualifyAttributes)};
  });
  assert.equal(index,native.length,'No omitted, extra or reordered original nodes');return result;
}
/** Expected-only transport: preserve every byte-valued native state field,
 * including search/display styles, active routes, attributes and SVG namespaces.
 * The real browser receipt remains an exact, unmodified comparison operand. */
export function expectedSidebarPwaReceipt(input:SidebarReceipt,rawAssignment:string):SidebarReceipt {
  const source=readSource(oracleFile);assert.equal(sha(source),oracleSHA256,'Untouched independent native oracle');
  const oracle=JSON.parse(source)as SidebarNativeOracle;
  assert(Object.entries(oracle.receipts).some(([name,receipt])=>isDeepStrictEqual(receipt,input)&&oracle.rawAssignments[name]===rawAssignment),'Only one of the thirteen complete immutable native states');
  const dom=new JSDOM('');
  try{
    const original=dom.window.document.createElement('aside'),expected=dom.window.document.createElement('aside');
    original.innerHTML=rawAssignment;expected.innerHTML=expectedSidebarHTML(rawAssignment);
    const template=[...expected.childNodes].map(node);
    // First authenticate the entire independent template against the original
    // raw assignment, including all ordered attrs and literal whitespace.
    annotate([...original.childNodes].map(node),template,true);
    return{...structuredClone(input),children:annotate(input.children as SidebarExpectedNode[],template,false)};
  }finally{dom.window.close();}
}

/** The current navigation adds two explicit destinations, renames Body and
 * moves Genome below Light; all other immutable state remains exact. */
export function expectedCurrentSidebarPwaReceipt(input:SidebarReceipt,rawAssignment:string):SidebarReceipt {
  const result=expectedSidebarPwaReceipt(input,rawAssignment);
  const children=result.children as SidebarExpectedNode[];
  const category=(entry:SidebarExpectedNode)=>entry.attributes?.find(([name])=>name==='data-category')?.[1];
  const genomeIndex=children.findIndex(entry=>category(entry)==='genome');
  assert.ok(genomeIndex>=0);
  const genome=children.splice(genomeIndex,1)[0]!;
  const bodyIndex=children.findIndex(entry=>category(entry)==='body');
  const label=children[bodyIndex]!.children?.find(entry=>entry.attributes?.some(([name,value])=>name==='class'&&value==='nav-item-label'));
  assert.deepEqual(label?.children,[{type:3,text:'Body'}]);
  label!.children=[{type:3,text:'Biometrics'}];
  const dom=new JSDOM('');
  try{
    const host=dom.window.document.createElement('div');
    host.innerHTML=standaloneLensEntries().join('');
    children.splice(bodyIndex+1,0,...[...host.childNodes].map(node));
  }finally{dom.window.close();}
  const lightIndex=children.findIndex(entry=>category(entry)==='light');
  assert.deepEqual(children[lightIndex+1],{type:8,text:''});
  children.splice(lightIndex+2,0,genome);
  return result;
}
