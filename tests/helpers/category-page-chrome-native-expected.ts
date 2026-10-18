import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {categoryPageChromeReceipt,type CategoryChromeNativeCase} from './category-page-chrome-pwa-receipt.js';

/** Reconstruct the complete original receipt before using the maintained observer.
 * The immutable raw/tree pair must agree on every node, ordered attribute,
 * namespace, character and native comment. Canvas geometry alone belongs to
 * the existing real-chart checks, as declared by the original fixture. */
export function categoryNativeExpectedReceipt(native:CategoryChromeNativeCase){
 const window=new JSDOM('').window;
 try{
  const root=window.document.createElement('div');root.innerHTML=native.raw;
  const original=(node:Node):unknown=>{
   if(node.nodeType!==1)return{type:node.nodeType,text:node.nodeValue};
   const element=node as Element;
   return{type:node.nodeType,name:element.localName,namespace:element.namespaceURI,attributes:[...element.attributes].filter(attribute=>element.localName!=='canvas'||!['width','height','style'].includes(attribute.name)).map(attribute=>[attribute.namespaceURI,attribute.name,attribute.value]),children:[...element.childNodes].map(original)};
  };
  assert.deepEqual([...root.childNodes].map(original),native.tree,'Complete immutable Category native raw/tree pair: '+native.key);
  return categoryPageChromeReceipt(root);
 }finally{window.close();}
}
