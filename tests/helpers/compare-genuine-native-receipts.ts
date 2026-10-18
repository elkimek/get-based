import {categoryNativeDOM,categoryRawDOM} from './category-genuine-native-dom.js';
/** The original immutable native receipts remain the oracle. Only HTML spelling
 * and known Svelte branch markers normalize; ordered attributes, every literal
 * character, defaults, actions, traces, faults and state remain exact. */
export function compareGenuineReceipt(value:unknown,key=''):unknown {
 if(typeof value==='string'&&['html','options','chips'].includes(key))return categoryRawDOM(value);
 if(Array.isArray(value))return categoryNativeDOM(value.map(item=>compareGenuineReceipt(item)));
 if(!value||typeof value!=='object')return value;
 return categoryNativeDOM(Object.fromEntries(Object.entries(value).map(([name,item])=>[name,compareGenuineReceipt(item,name)])));
}
