import type {CategoryChartReceipt} from './category-pwa-receipt.js';
/** Exact static page tree. Only Chart.js-owned canvas width/height/style fields
 * are omitted here; the maintained real Chart/paint checks verify those owners.
 * All native canvas attributes, every other attribute, namespace, text and
 * comment remain ordered and exact. Full original raw DOM is retained separately. */
export function categoryPageChromeReceipt(root:Element){
 // Native branch markers alone are ignored; preserve every literal character
 // and ordered attribute, joining adjacent text split by those markers.
 const children=(parent:Node,read:(node:Node)=>unknown):unknown[]=>{
  const result:unknown[]=[];
  for(const child of parent.childNodes){
   if(child.nodeType===8){if(!/^(?:\[(?:-1|[0-9]+)?|\]|)$/.test(child.nodeValue??''))throw new Error('Unqualified Category HTML comment');continue;}
   const current=read(child) as {type?:number;text?:string|null},prior=result.at(-1) as {type?:number;text?:string|null}|undefined;
   if(current.type===3&&prior?.type===3)prior.text=(prior.text??'')+(current.text??'');else result.push(current);
  }
  return result;
 };

 const node=(value:Node):unknown=>{
  if(value.nodeType===1){const element=value as Element;return {type:value.nodeType,name:element.localName,namespace:element.namespaceURI,attributes:[...element.attributes].filter(attribute=>element.localName!=='canvas'||!['width','height','style'].includes(attribute.name)).map(attribute=>[attribute.namespaceURI,attribute.name,attribute.value]),children:children(element,node)};}
  return {type:value.nodeType,text:value.nodeValue};
 };
 return children(root,node);
}
export interface CategoryChromeNativeCase {key:string;clock:string;route:string;filter:string;view:string;operation:'show'|'switch';raw:string;assignments:{id:string;raw:string}[];tree:ReturnType<typeof categoryPageChromeReceipt>;charts:CategoryChartReceipt[];registry:Record<string,unknown>;}
export interface CategoryChromeNativeOracle {originalControllerSHA256:string;seed:Record<string,unknown>;profileKeys:string[];cases:Record<string,CategoryChromeNativeCase>;nativeCategories:Record<string,{markers:Record<string,unknown>}>;canvasStaticFieldsExcluded:string[];}
export const categoryChromeClock='2024-05-15T12:00:00.000Z';
export const categoryChromeOutsideClock='2026-10-12T12:00:00.000Z';
