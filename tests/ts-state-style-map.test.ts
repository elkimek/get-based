// @vitest-environment node
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {expect,it} from 'vitest';
import {compileInlineStyleMap} from '../scripts/build-inline-style-maps.mjs';
import {tsStateStyleOwner} from '../scripts/ts-state-style-owner.mjs';
import {tsStateStyles} from '../js/ts-state-ui-inline-style-map.generated.js';
import original from './fixtures/ts-state-style-original.json' with {type:'json'};
it('all fixed state property values remain exactly equal to the independent native literals',async()=>{
 const root=process.cwd(),input=readFileSync(resolve(root,tsStateStyleOwner.input),'utf8');const built=await compileInlineStyleMap(input,resolve(root,tsStateStyleOwner.input),root,tsStateStyleOwner);
 expect(tsStateStyleOwner).toEqual(original.owner);expect(built.values).toEqual(original.values);expect(tsStateStyles).toEqual(original.values);expect(Object.isFrozen(tsStateStyles)).toBe(true);expect(Object.keys(tsStateStyles)).toHaveLength(8);expect(original.counts.reduce((sum,row)=>sum+row.count,0)).toBe(20);
 expect(readFileSync(tsStateStyleOwner.output,'utf8')).toBe(built.javascript);expect(readFileSync(tsStateStyleOwner.output.replace(/\.js$/,'.d.ts'),'utf8')).toBe(built.declaration);
});
