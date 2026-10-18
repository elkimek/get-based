/** Compare authored UI exactly after removing only known inert Svelte anchors.
 * Ordered attributes, namespaces, every text character and unknown comments remain observable.
 */
const anchors=new Set(['','[',']','[!','[-1',...Array.from({length:21},(_,i)=>'['+i)]);
function record(node:Node):unknown {
 if(node instanceof Element)return {type:node.nodeType,name:node.localName,namespace:node.namespaceURI,attributes:[...node.attributes].map(a=>[a.namespaceURI,a.name,a.value]),children:[...node.childNodes].map(record)};
 return {type:node.nodeType,text:node.nodeValue};
}
export function normalizeWearableTree(value:unknown):unknown {
 if(!value||typeof value!=='object')return value;
 if('type'in value&&value.type===8&&'text'in value&&typeof value.text==='string'&&anchors.has(value.text))return null;
 if(!('children'in value)||!Array.isArray(value.children))return value;
 const children:unknown[]=[];
 for(const item of value.children){
  const child=normalizeWearableTree(item);if(child===null)continue;
  const previous=children.at(-1);
  if(child&&typeof child==='object'&&'type'in child&&child.type===3&&'text'in child&&typeof child.text==='string'
   &&previous&&typeof previous==='object'&&'type'in previous&&previous.type===3&&'text'in previous&&typeof previous.text==='string')previous.text+=child.text;
  else children.push(child);
 }
 return {...value,children};
}
export function wearableHTMLTree(html:string):unknown {const host=document.createElement('main');host.innerHTML=html;return normalizeWearableTree(record(host));}
/** Only UI serialization fields change coordinates. Domain, actions, focus, math, getter/error order and storage receipts remain exact. */
export function normalizeWearableReceipt(value:unknown):unknown {
 if(!value||typeof value!=='object')return value;
 return {...value,...('raw'in value&&typeof value.raw==='string'?{raw:wearableHTMLTree(value.raw)}:{}),
  ...('assignments'in value&&Array.isArray(value.assignments)?{assignments:value.assignments.map(v=>typeof v==='string'?wearableHTMLTree(v):v)}:{}),
  ...('dom'in value?{dom:normalizeWearableTree(value.dom)}:{})};
}
