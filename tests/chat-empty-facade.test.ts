import path from 'node:path';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {createSvelteFacadePlugin} from '../scripts/svelte-facade-plugin.mjs';
import {hydrate} from '../js/components/ChatEmptyState.svelte.native.js';
it('retains the matching parent hydrate export through native and optimized compile facades',async()=>{
 expect(typeof hydrate).toBe('function');const root=process.cwd(),file=path.join(root,'js/components/ChatEmptyState.svelte.native.js');
 const wrapper=await createSvelteFacadePlugin({root,client:'compile'}).load(file);
 expect(wrapper).toBe('export {default} from '+JSON.stringify('getbased:svelte:client:'+path.join(root,'js/components/ChatEmptyState.svelte')+'.compiled.js')+"; export {mount, unmount, flushSync, hydrate} from 'svelte';");
});
it('keeps both new actual runtime URLs in the unchanged-budget offline roster',()=>{
 const assets=readFileSync('service-worker-assets.ts','utf8');
 for(const url of ['/js/chat-empty-catalog-component.js','/js/components/ChatEmptyState.svelte.native.js'])expect(assets.split("'"+url+"'")).toHaveLength(2);
});
