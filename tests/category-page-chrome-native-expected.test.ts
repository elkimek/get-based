import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {JSDOM} from 'jsdom';
import native from './fixtures/category-page-chrome-pwa-native.json' with {type:'json'};
import {categoryNativeExpectedReceipt} from './helpers/category-page-chrome-native-expected.js';
import {categoryPageChromeReceipt,type CategoryChromeNativeCase} from './helpers/category-page-chrome-pwa-receipt.js';
const cases=Object.values(native.cases) as CategoryChromeNativeCase[];
const characters=(tree:unknown[]):string=>tree.map(value=>{const node=value as {type:number;text?:string;children?:unknown[]};return node.type===3?node.text??'':node.children?characters(node.children):'';}).join('');
it('pins all13 immutable complete original raw/tree receipts without fixture changes',()=>{expect(createHash('sha256').update(readFileSync('tests/fixtures/category-page-chrome-pwa-native.json')).digest('hex')).toBe('4881756581af1f516aeb3ab9195a403df1b201427165a1d9cf69f19b04f2fe5b');expect(cases).toHaveLength(13);});
for(const original of cases)it('qualifies complete original raw/tree and preserves every text character through the existing observer: '+original.key,()=>{
 const snapshot=JSON.stringify(original),expected=categoryNativeExpectedReceipt(original),window=new JSDOM('').window;
 try{const root=window.document.createElement('div');root.innerHTML=original.raw;expect(expected).toEqual(categoryPageChromeReceipt(root));expect(characters(expected)).toBe(characters(original.tree));expect(JSON.stringify(original)).toBe(snapshot);}finally{window.close();}
});
it.each(['attribute','text','removed-comment']as const)('rejects an inconsistent original raw/tree pair: %s',kind=>{
 const original=cases.find(value=>value.raw.includes('<!--'))!,changed=structuredClone(original);
 if(kind==='attribute')changed.raw=changed.raw.replace('class="category-header"','class="foreign-header"');
 if(kind==='text')changed.raw=changed.raw.replace('Synthetic Category','Synthetic  Category');
 if(kind==='removed-comment')changed.raw=changed.raw.replace(/<!--[\s\S]*?-->/,'');
 expect(changed.raw).not.toBe(original.raw);expect(()=>categoryNativeExpectedReceipt(changed)).toThrow('Complete immutable Category native raw/tree pair');
});
it('retains the existing observer rejection of unknown comments even when the complete raw/tree pair agrees',()=>{
 const changed=structuredClone(cases[0]!);changed.raw+='<!--foreign-category-marker-->';changed.tree.push({type:8,text:'foreign-category-marker'});expect(()=>categoryNativeExpectedReceipt(changed)).toThrow('Unqualified Category HTML comment');
});
it.each(['attribute-value','extra-attribute','text-character','unknown-comment']as const)('detects actual current DOM corruption: %s',kind=>{
 const original=cases[0]!,expected=categoryNativeExpectedReceipt(original),window=new JSDOM('').window;
 try{const root=window.document.createElement('div');root.innerHTML=original.raw;
 if(kind==='attribute-value')root.querySelector('.category-header')!.setAttribute('class','foreign-header');
 if(kind==='extra-attribute')root.querySelector('.category-header')!.setAttribute('data-foreign','changed');
 if(kind==='text-character')root.querySelector('.category-title-text')!.firstChild!.nodeValue+=' ';
 if(kind==='unknown-comment'){root.append(window.document.createComment('foreign'));expect(()=>categoryPageChromeReceipt(root)).toThrow('Unqualified Category HTML comment');}
 else expect(categoryPageChromeReceipt(root)).not.toEqual(expected);
 }finally{window.close();}
});
