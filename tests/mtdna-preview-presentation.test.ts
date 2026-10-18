import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {parse} from 'svelte/compiler';
import {escapeHTML} from './fixtures/mtdna-preview-escape.js';
import {dnaActionAttrs} from '../js/dna-actions.js';
import {expectedMtDnaPreviewHTML,mtDnaPreviewTree} from './helpers/mtdna-preview-owned-receipts.js';
import {projectMtDnaImportPreview,renderMtDnaImportPreview} from '../js/mtdna-preview-presentation.js';
import type {PendingMtDnaImport, detectMtDNAMismatch} from '../js/dna-mtdna.js';

const ports=vi.hoisted(()=>({change:(html:string)=>html,css:vi.fn<()=>Promise<boolean>>(),ensure:vi.fn<()=>HTMLElement>(),open:vi.fn(),pending:vi.fn(),notification:vi.fn()}));
vi.mock('../js/components/MtDnaImportPreview.svelte.html.js',async importOriginal=>{
  const original=await importOriginal<typeof import('../js/components/MtDnaImportPreview.svelte.html.js')>();
  return {renderHTML:(props:Parameters<typeof original.renderHTML>[0])=>ports.change(original.renderHTML(props))};
});
vi.mock('../js/utils.js',()=>({escapeHTML,escapeAttr:escapeHTML,showNotification:ports.notification}));
vi.mock('../js/dna-runtime.js',()=>({
  loadGeneticsStylesheetForAction:ports.css, captureDnaImportOrigin:()=>({current:()=>true}),
  setPendingMtDnaImport:ports.pending, ensureDnaModalOverlay:ports.ensure, getDnaProfileLatitudeBand:()=>null,
  cacheDnaHaplogroupTable:vi.fn(),clearPendingMtDnaImport:vi.fn(),isPendingDnaImportCurrent:vi.fn(),
  getPendingMtDnaImport:vi.fn(),logDnaDebugError:vi.fn(),refreshDnaShell:vi.fn(),
}));
vi.mock('../js/modal-lifecycle.js',()=>({openModalOverlay:ports.open,closeModalOverlay:vi.fn()}));
vi.mock('../js/data.js',()=>({saveImportedData:vi.fn(),saveImportedDataForProfile:vi.fn(),notifyProfileDataContextChanged:vi.fn()}));
vi.mock('../js/profile-data-writes.js',()=>({profileDataBaseline:vi.fn()}));
vi.mock('../js/genetics-import-events.js',()=>({publishGeneticsImport:vi.fn()}));
vi.mock('../js/state.js',()=>({state:{importedData:{genetics:null}}}));
type Resolved=PendingMtDnaImport['resolved'];type Coupling=PendingMtDnaImport['coupling'];type Mismatch=ReturnType<typeof detectMtDNAMismatch>;
const resolved:Resolved={haplogroup:'J',confidence:1,matchedMutations:3,totalDiagnostic:3};
const coupling:NonNullable<Coupling>={level:'loose',label:'Loose',shortLabel:'L',climate:'Cold',description:'desc',implications:'imp',matchedLatBands:[3,4]};
const mutations=[{position:263,allele:'G',raw:'263G'}];
const source=fs.readFileSync(new URL('./fixtures/mtdna-preview-original-renderer.txt',import.meta.url),'utf8');
function original(r:Resolved,c:Coupling,m:Mismatch,fileName='file.txt'){
  let html='';const overlay={set innerHTML(value:string){html=value;}};
  const render=vm.runInNewContext('('+source+')',{escapeHTML,dnaActionAttrs,detectMtDNAMismatch:()=>m,ensureDnaModalOverlay:()=>overlay,openModalOverlay:()=>{}}) as (r:Resolved,c:Coupling,markers:typeof mutations,file:string)=>void;
  render(r,c,mutations,fileName);return html;
}
function candidate(r:Resolved,c:Coupling,m:Mismatch,fileName='file.txt'){
  // Same retained original controller prefix; no private controller state injection.
  const mismatch=c?(()=>{void r.haplogroup;return m;})():null;
  return renderMtDnaImportPreview(r,c,mutations,fileName,mismatch);
}
function native(html:string){const doc=new JSDOM('').window.document;const t=doc.createElement('template');t.innerHTML=html;return t.content;}
beforeEach(()=>{ports.change=html=>html;});afterEach(()=>{vi.unstubAllGlobals();});

describe('complete mtDNA preview original-derived public presentation',()=>{
  for(const c of [null,coupling])for(const m of [null,{mismatch:false,message:'aligned'},
    {mismatch:true,severity:'moderate',message:'mismatch',implications:''},
    {mismatch:true,severity:'significant',message:'mismatch',implications:'imp'}] satisfies Mismatch[]){
    it('preserves complete original HTML/defaults for '+JSON.stringify([!!c,m]),()=>{
      const old=original(resolved,c,m),now=candidate(resolved,c,m);expect(now).toBe(expectedMtDnaPreviewHTML(old));expect(mtDnaPreviewTree(now)).toEqual(mtDnaPreviewTree(old,true));
      const root=native(now);expect(root.querySelectorAll('.modal')).toHaveLength(1);
      expect([...root.querySelectorAll<HTMLButtonElement>('button')].map(b=>[b.type,b.disabled,b.dataset.dnaAction,b.textContent]))
        .toEqual([['submit',false,'close-mtdna-preview','Cancel'],['submit',false,'confirm-mtdna-import','Import Haplogroup J']]);
      expect(root.querySelector('[onclick],[onkeydown],script,form')).toBeNull();
    });
  }
  it('preserves hostile markup/entity/private-slot text without rescanning inserted values',()=>{
    const hostile='<img src=x onerror=bad()> & " \' <!--[0--> gb-mtdna-file-name data-dna-action="close-mtdna-preview"';
    const r={...resolved,haplogroup:hostile};const c={...coupling,label:hostile,climate:hostile,description:hostile};
    const m={mismatch:true,severity:'moderate',message:hostile,implications:hostile};
    const html=candidate(r,c,m,hostile);const old=original(r,c,m,hostile);expect(html).toBe(expectedMtDnaPreviewHTML(old));expect(mtDnaPreviewTree(html)).toEqual(mtDnaPreviewTree(old,true));
    expect(native(html).querySelector('img,[onerror]')).toBeNull();expect(native(html).querySelector('.mtdna-hg-value')!.textContent).toBe(hostile);
  });
  it('preserves each original getter/read/coercion and repeated haplogroup/implications reads',()=>{
    function inputs(trace:string[]){
      const r=new Proxy(resolved,{get(t,k,receiver){trace.push('r:'+String(k));return Reflect.get(t,k,receiver);}});
      const c=new Proxy(coupling,{get(t,k,receiver){trace.push('c:'+String(k));return Reflect.get(t,k,receiver);}});
      const m=new Proxy({mismatch:true,severity:'moderate',message:'m',implications:'i'},{get(t,k,receiver){trace.push('m:'+String(k));return Reflect.get(t,k,receiver);}});
      return {r,c,m};
    }
    const a:string[]=[],b:string[]=[];const old=inputs(a),now=inputs(b);
    expect(candidate(now.r,now.c,now.m)).toBe(expectedMtDnaPreviewHTML(original(old.r,old.c,old.m)));expect(b).toEqual(a);
  });
  it('preserves raw direct count interpolation and escaped null/false/zero coercion',()=>{
    for(const count of [0,NaN,Infinity]){const r={...resolved,matchedMutations:count};expect(candidate(r,coupling,null)).toBe(expectedMtDnaPreviewHTML(original(r,coupling,null)));}
    for(const name of [null,false,0] as unknown as string[])expect(candidate(resolved,coupling,null,name)).toBe(expectedMtDnaPreviewHTML(original(resolved,coupling,null,name)));
  });
  it('throws on the same coercion before completing any output',()=>{
    const error=new Error('read failed');const r={...resolved,get matchedMutations():number{throw error;}};
    expect(()=>original(r,null,null)).toThrow(error);expect(()=>candidate(r,null,null)).toThrow(error);
    const bad={...resolved,haplogroup:{toString(){throw error;}}} as unknown as Resolved;
    expect(()=>original(bad,null,null)).toThrow(error);expect(()=>candidate(bad,null,null)).toThrow(error);
  });
  it('independently rejects changed/missing/duplicate/unknown current SSR against the original grammar',()=>{
    for(const change of [
      (h:string)=>h.replace('<!--[-->',''),(h:string)=>h.replace('<!--[0-->','<!--[9-->'),
      (h:string)=>h+'<!--unknown-->',(h:string)=>h.replace('file.txt','file.txt file.txt'),
      (h:string)=>h.replace('file.txt','missing'),
      (h:string)=>h.replace('desc</div>\n    </div><!--]-->','desc</div><!--]-->\n    </div>'),
    ]){ports.change=change;expect(()=>expect(candidate(resolved,coupling,null)).toBe(expectedMtDnaPreviewHTML(original(resolved,coupling,null)))).toThrow();}
  });
  it('keeps malformed severity/class and all user values literal without attribute injection',()=>{
    const value='moderate" data-injected="yes <img src=x onerror=bad()> & <!--[0-->';
    const mismatch={mismatch:true,severity:value,message:value,implications:value};
    const view=projectMtDnaImportPreview(resolved,coupling,mutations,value,mismatch);
    expect(view.mismatch?.kind).toBe('mismatch');
    const root=native(renderMtDnaImportPreview(resolved,coupling,mutations,value,mismatch));
    expect(root.querySelector('img,script,[data-injected],[onerror]')).toBeNull();
    expect(root.querySelector('.mtdna-preview-mismatch')!.getAttribute('class')).toBe('mtdna-preview-mismatch mtdna-mismatch-'+value);
    expect(root.querySelector('.dna-preview-stats')!.textContent).toContain(value);
  });
  it('keeps public renderer/projector arity and removes all private frame/slot expansion',()=>{
    expect(renderMtDnaImportPreview.length).toBe(5);expect(projectMtDnaImportPreview.length).toBe(5);
    const source=fs.readFileSync(new URL('../js/mtdna-preview-presentation.ts',import.meta.url),'utf8');
    expect(source).not.toMatch(/replaceOwned|function skeleton|gb-mtdna-|indexOf|\.slice\(|matchAll|escapeHTML/);
  });
  it('has no raw HTML boundary or authored handlers',()=>{
    function unsafe(value:unknown,result:string[]=[]):string[]{
      if(!value||typeof value!=='object')return result;const node=value as {type?:string;name?:string};
      if(node.type==='HtmlTag'||node.type==='OnDirective'||node.type==='EventHandler'||node.type==='Attribute'&&/^on/i.test(node.name||''))result.push(node.type!);
      for(const child of Object.values(value)){if(Array.isArray(child))child.forEach(v=>unsafe(v,result));else unsafe(child,result);}return result;
    }
    const component=fs.readFileSync(new URL('../js/components/MtDnaImportPreview.svelte',import.meta.url),'utf8');expect(unsafe(parse(component,{modern:true}))).toEqual([]);
    for(const source of ['<button onclick={bad}>x</button>','{@html bad}'])expect(unsafe(parse(source,{modern:true})).length).toBeGreaterThan(0);
  });
});

describe('real exported mtDNA file controller with owned dependency ports',()=>{
  let dom:JSDOM;
  beforeEach(()=>{vi.resetModules();vi.clearAllMocks();dom=new JSDOM('<div id="dna-modal-overlay"><p>Prior</p></div>',{url:'https://mtdna-fixture.invalid/'});vi.stubGlobal('document',dom.window.document);ports.ensure.mockImplementation(()=>dom.window.document.querySelector<HTMLElement>('#dna-modal-overlay')!);ports.css.mockResolvedValue(true);});
  afterEach(()=>dom.window.close());
  it('preserves CSS short circuit and prior DOM without reading the file',async()=>{
    const dna=await import('../js/dna-mtdna.js');ports.css.mockResolvedValue(false);const text=vi.fn(async()=> '263G');expect(await dna.handleMtDNAFile({name:'file.txt',text})).toBe(false);expect(text).not.toHaveBeenCalled();expect(ports.pending).not.toHaveBeenCalled();expect(ports.ensure).not.toHaveBeenCalled();
  });
  it('preserves no-match failure and retryable domain notification',async()=>{
    const dna=await import('../js/dna-mtdna.js');expect(await dna.handleMtDNAFile({name:'empty.txt',text:async()=> 'not a marker'})).toBe(false);expect(ports.pending).not.toHaveBeenCalled();expect(ports.open).not.toHaveBeenCalled();expect(ports.notification).toHaveBeenCalledWith('No mtDNA mutations found in this file','error');
  });
  it('uses the public parser/classifier, sets pending before presentation and reuses the native overlay',async()=>{
    const table={haplogroups:{J:{mutations:['263G','750G'],coupling:'loose',climate:'Cold'}},couplingLevels:{loose:{label:'Loose',shortLabel:'L',description:'desc',implications:'imp',latitudeBands:[3,4]}}};
    vi.stubGlobal('fetch',vi.fn(async()=>({json:async()=>table})));
    const dna=await import('../js/dna-mtdna.js');const overlay=dom.window.document.querySelector<HTMLElement>('#dna-modal-overlay')!;const trace:string[]=[];
    ports.pending.mockImplementation(()=>trace.push('pending'));ports.ensure.mockImplementation(()=>{trace.push('ensure');return overlay;});ports.open.mockImplementation(()=>trace.push('open'));
    expect(await dna.handleMtDNAFile({name:'livingdna.txt',text:async()=> '263G\n750G'})).toBe(true);
    expect(trace).toEqual(['pending','ensure','open']);expect(ports.open).toHaveBeenCalledTimes(1);expect(ports.open.mock.calls[0]![0]).toBe(overlay);expect(overlay.querySelector('.mtdna-hg-value')!.textContent).toBe('J');expect(ports.pending.mock.calls[0]![0].source).toBe('mtDNA (Living DNA)');
  });
});
