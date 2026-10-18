import {expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {compileCategoryViewsNativeStyles} from '../scripts/category-views-native-styles.mjs';
import {priorCategoryStyleReceivers} from './helpers/category-current-style-owners.js';
async function current(){const file=path.resolve('css/category-views.tailwind.css');return compileCategoryViewsNativeStyles(fs.readFileSync(file,'utf8'),file,process.cwd());}
it('qualifies all347 current Category owners and58 exact new native bodies before preserving the original289-owner contracts',async()=>{
 const value=await current();expect(priorCategoryStyleReceivers(value.receivers)).toHaveLength(289);
});
it.each(['prior member','new selector','new media','new body','duplicate member','extra member'] as const)('rejects current %s corruption before any prior subset is returned',async(kind)=>{
 const value=await current();priorCategoryStyleReceivers(value.receivers);const rows=value.receivers.map(row=>({...row,path:[...row.path]}));
 if(kind==='prior member')rows[0]!.utility='foreign-prior-owner';
 if(kind==='new selector')rows[289]!.selector='.foreign-new-owner';
 if(kind==='new media')rows[289]!.condition='(max-width:1px)';
 if(kind==='new body')rows[289]!.body+='color:red;';
 if(kind==='duplicate member')rows[289]!.utility=rows[0]!.utility;
 if(kind==='extra member')rows.push({...rows[0]!,path:[...rows[0]!.path]});
 expect(()=>priorCategoryStyleReceivers(rows)).toThrow();
});
