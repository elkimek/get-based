import {expect} from 'vitest';
export interface OwnedNode {type:number;text?:string|null;name?:string;namespace?:string|null;attributes?:unknown[][];children?:OwnedNode[]}
const comment=(text:string):OwnedNode=>({type:8,text}),literal=(text:string):OwnedNode=>({type:3,text});
function classes(node:OwnedNode):string {return String(node.attributes?.find(a=>a[1]==='class')?.[2]??'');}
/** Exact authored owner annotations are ADDED to the native expected graph. Nothing is stripped from actual DOM. */
export function nativeWithOwnedAnnotations(value:unknown,kind:'notes'|'quick-markers'):OwnedNode {
 const root=structuredClone(value) as OwnedNode;
 if(kind==='quick-markers'&&!root.children?.length)return root;
 const element=root.children?.[0];expect(root.children).toHaveLength(1);expect(element?.type).toBe(1);
 const prefix=[comment('['),comment(''),literal('\n\n'),comment(kind==='notes'?'[0':'[-1'),comment(''),literal('\n\n')];
 if(kind==='notes'){
  expect(classes(element!)).toBe('notes-section dashboard-notes-widget');
  const children=element!.children!;const button=children[0]!;expect(classes(button)).toBe('add-note-btn');
  const rest=children.slice(1),empty=rest.length===1&&classes(rest[0]!)==='dashboard-widget-empty';
  element!.children=[button,comment(empty?'[!':'['),...rest,comment(']')];
  root.children=[...prefix,element!,comment(']'),comment(']')];
 }else{
  expect(classes(element!)).toBe('db-quick-marker-grid');
  for(const tile of element!.children!){
   expect(tile.name).toBe('button');expect(classes(tile)).toContain('db-quick-marker-tile');
   const valueDiv=tile.children!.find(n=>classes(n)==='db-stat-value')!;expect(valueDiv).toBeDefined();
   const small=valueDiv.children!.find(n=>n.name==='small');const text=valueDiv.children!.filter(n=>n.type===3);
   expect(valueDiv.children!.length).toBe(text.length+(small?1:0));
   valueDiv.children=[...text,comment(small?'[0':'[-1'),...(small?[small]:[]),comment(']')];
   const sparkIndex=tile.children!.findIndex(n=>classes(n).startsWith('db-spark '));expect(sparkIndex).toBeGreaterThan(0);
   const spark=tile.children![sparkIndex]!;expect(['span','svg']).toContain(spark.name);
   tile.children!.splice(sparkIndex,1,comment(spark.name==='span'?'[0':'[-1'),spark,comment(']'));
  }
  element!.children=[comment('['),...element!.children!,comment(']')];
  root.children=[...prefix,comment('[0'),element!,comment(']'),comment(']'),comment(']')];
 }
 return root;
}

/** Finite source-owned comments/literal whitespace only, added to immutable native expected trees. */
export function nativeWithLabMarkerAnnotations(value:unknown,kind:'single-marker'|'spotlight'|'priority'):OwnedNode {
 const root=structuredClone(value) as OwnedNode;if(!root.children?.length)return root;
 expect(root.children).toHaveLength(1);const button=root.children[0]!;expect(button.name).toBe('button');expect(button.namespace).toBe('http://www.w3.org/1999/xhtml');
 const required=kind==='single-marker'?'db-single-marker-widget':kind==='spotlight'?'db-spotlight':'labs-priority-banner';expect(classes(button).split(' ')).toContain(required);
 if(kind==='single-marker'){
  const valueDiv=button.children!.find(node=>classes(node)==='db-stat-value')!;expect(valueDiv).toBeDefined();const small=valueDiv.children!.find(node=>node.name==='small'),text=valueDiv.children!.filter(node=>node.type===3);expect(valueDiv.children!.length).toBe(text.length+(small?1:0));valueDiv.children=[...text,comment(small?'[0':'[-1'),...(small?[small]:[]),comment(']')];
 }
 const owner=kind==='priority'?button.children!.find(node=>classes(node)==='labs-priority-spark')!:button;expect(owner).toBeDefined();const index=owner.children!.findIndex(node=>classes(node).startsWith('db-spark '));expect(index).toBeGreaterThanOrEqual(0);const spark=owner.children![index]!;expect(['svg','span']).toContain(spark.name);if(spark.name==='svg')expect(spark.namespace).toBe('http://www.w3.org/2000/svg');owner.children!.splice(index,1,comment(spark.name==='span'?'[0':'[-1'),spark,comment(']'),comment(''));
 root.children=[comment('['),comment(''),literal('\n\n\n'),comment(kind==='single-marker'?'[0':kind==='spotlight'?'[1':'[-1'),button,literal('\n'),comment(']'),comment(']')];return root;
}
export function decodeNativeReceipt(value:unknown):unknown {
 const [tag,body]=value as [string,unknown];if(tag==='undefined')return undefined;if(tag==='null')return null;if(tag==='number')return body==='NaN'?NaN:body==='Infinity'?Infinity:body==='-Infinity'?-Infinity:body==='-0'?-0:body;if(tag==='array')return(body as unknown[]).map(decodeNativeReceipt);if(tag==='object')return Object.fromEntries((body as [string,unknown][]).map(([key,item])=>[key,decodeNativeReceipt(item)]));return body;
}

/** Exact new BioAge summary/dynamic-element boundaries; retain every native node. */
export function nativeWithBioAgeAnnotations(value:unknown):OwnedNode {
 const root=structuredClone(value) as OwnedNode;
 expect(root.children).toHaveLength(1);
 const element=root.children![0]!;
 expect(element.type).toBe(1);expect(classes(element)).toBe('db-hero-bio');
 element.children=[...element.children!,comment('')];
 root.children=[comment('['),comment('[0'),comment(''),element,comment(''),comment(']'),comment(']')];
 return root;
}
