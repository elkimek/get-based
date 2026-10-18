// Compiler/build modules execute in Node; only mounting uses explicit JSDOM.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {expect, it} from 'vitest';
import {JSDOM} from 'jsdom';
import {build} from 'rolldown';
import {buildSvelte} from '../scripts/build-svelte.mjs';
import {createSvelteFacadePlugin} from '../scripts/svelte-facade-plugin.mjs';
import type {HeaderRangeView} from '../js/header-date-range.js';
type Runtime={default:import('svelte').Component<{view:HeaderRangeView}>; mount:typeof import('svelte').mount; unmount:typeof import('svelte').unmount; flushSync:typeof import('svelte').flushSync};

it('retains native facade exports and actual mounted defaults/attributes/disposal with a shared client runtime',async()=>{
  const root=process.cwd(),directory=await fs.mkdtemp(path.join(os.tmpdir(),'getbased-shared-client-'));
  const dom=new JSDOM('<!doctype html><html><body></body></html>',{pretendToBeVisual:true,url:'https://getbased.test/'});
  const globals:Array<[string,unknown]>=[
    ['window',dom.window],['document',dom.window.document],['navigator',dom.window.navigator],
    ['Node',dom.window.Node],['Element',dom.window.Element],['HTMLElement',dom.window.HTMLElement],
    ['Text',dom.window.Text],['Comment',dom.window.Comment],['Event',dom.window.Event],
    ['CustomEvent',dom.window.CustomEvent],['MutationObserver',dom.window.MutationObserver],
    ['getComputedStyle',dom.window.getComputedStyle.bind(dom.window)],
    ['requestAnimationFrame',dom.window.requestAnimationFrame.bind(dom.window)],
    ['cancelAnimationFrame',dom.window.cancelAnimationFrame.bind(dom.window)],
  ];
  const previous=globals.map(([key])=>[key,Object.getOwnPropertyDescriptor(globalThis,key)] as const);
  try{
    for(const [key,value] of globals)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    const filename=path.join(root,'js/components/HeaderRangeButtons.svelte');
    await buildSvelte({component:filename,outputDirectory:path.join(directory,'original')});
    const original:Runtime=await import(pathToFileURL(path.join(directory,'original/HeaderRangeButtons.svelte.native.js')).href);
    const entry='getbased:client-test';
    await build({input:entry,platform:'browser',plugins:[{
      name:'controlled-client-test-entry',resolveId:id=>id===entry?id:null,
      load:id=>id===entry?`export {default,mount,unmount,flushSync} from ${JSON.stringify(filename+'.native.js')};`:null,
    },createSvelteFacadePlugin({root,client:'compile'})],output:{dir:path.join(directory,'shared'),entryFileNames:'client.mjs',format:'es',minify:true}});
    const current:Runtime=await import(pathToFileURL(path.join(directory,'shared/client.mjs')).href);
    expect(Object.keys(current).sort()).toEqual(Object.keys(original).sort());
    const view:HeaderRangeView={buttons:[{mode:'all',active:true,pressed:false,label:'All <&"'},{mode:'latest',active:false,pressed:true,label:'Latest'}]};
    async function native(runtime:Runtime){
      const target=document.createElement('div');document.body.append(target);
      const instance=runtime.mount(runtime.default,{target,props:{view}});runtime.flushSync();
      const buttons=[...target.querySelectorAll('button')].map(button=>({html:button.outerHTML,type:button.type,disabled:button.disabled,value:button.value,text:button.textContent,attributes:[...button.attributes].map(attr=>[attr.name,attr.value])}));
      expect(buttons).toHaveLength(2);expect(buttons.map(button=>button.type)).toEqual(['button','button']);
      await runtime.unmount(instance);runtime.flushSync();expect(target.childNodes).toHaveLength(0);target.remove();return buttons;
    }
    expect(await native(current)).toEqual(await native(original));
  }finally{
    for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
    dom.window.close();await fs.rm(directory,{recursive:true,force:true});
  }
},30_000);
