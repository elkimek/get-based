/** A genuine Svelte child adds only its native hydration branch comments.
 * Keep every ordered attribute and every text character; merge adjacent text
 * split by those markers. An unrelated HTML comment is a test failure. */
export function categoryNativeDOM(value:unknown):unknown {
 if(Array.isArray(value)){
  const out:unknown[]=[];
  for(const item of value){
   const node=categoryNativeDOM(item);
   if(node===undefined)continue;
   const current=node as {type?:number;text?:string|null};
   const previous=out.at(-1) as {type?:number;text?:string|null}|undefined;
   if(current?.type===3&&previous?.type===3)previous.text=(previous.text??'')+(current.text??'');
   else out.push(node);
  }
  return out;
 }
 if(!value||typeof value!=='object')return value;
 const node=value as Record<string,unknown>;
 if(node.type===8){
  if(typeof node.text!=='string'||!/^(?:\[(?:-1|[0-9]+)?|\]|)$/.test(node.text))throw new Error('Unqualified Category HTML comment: '+String(node.text));
  return undefined;
 }
 return Object.fromEntries(Object.entries(node).map(([key,item])=>[key,categoryNativeDOM(item)]));
}
export function categoryRawDOM(raw:string):unknown {
 const fixture=document.createElement('div');fixture.innerHTML=raw;
 const tree=(node:Node):unknown=>node.nodeType===Node.ELEMENT_NODE?{tag:(node as Element).tagName,attrs:[...(node as Element).attributes].map(a=>[a.name,a.value]),children:[...node.childNodes].map(tree)}:{type:node.nodeType,text:node.nodeValue};
 return categoryNativeDOM(tree(fixture));
}
