import {afterEach,expect,it,vi} from 'vitest';
import {JSDOM} from 'jsdom';
import {escapeHTML} from './fixtures/mtdna-preview-escape.js';
import {originalDnaPreview} from './fixtures/dna-preview-original.js';
import {renderDnaImportPreview,type DnaPreviewInput} from '../js/dna-preview-presentation.js';
import {snpFindingPresentation,resolveSnpEvidenceProfile} from '../js/dna-evidence.js';
import {dnaPreviewNativeTree,expectedDnaPreviewDOMHTML} from './helpers/dna-preview-owned-receipts.js';
vi.mock('../js/utils.js',()=>({escapeHTML,escapeAttr:escapeHTML}));
afterEach(()=>{vi.unstubAllGlobals();});
function input():DnaPreviewInput {
 const call={rsid:'rs1801133',gene:'Synthetic gene',variant:'Synthetic variant',category:'other',genotype:'CC',effect:'mild',valence:'risk',note:'Synthetic note'};
 const finding={...call,presentation:snpFindingPresentation(call.effect,call.valence),evidenceProfile:resolveSnpEvidenceProfile(call,call)};
 return {source:()=>'<synthetic>&',stats:'Synthetic preview',apoe:null,groups:[[finding],[],[],[{...finding,presentation:snpFindingPresentation('none','neutral')}]],categoryLabel:()=> 'Other',importCount:()=>2};
}
async function run(render:(value:DnaPreviewInput)=>string) {
 vi.resetModules();const dom=new JSDOM('<div id="dna-modal-overlay"></div><div id="foreign"><div class="dna-preview-collapsible" role="button" tabindex="0" data-dna-action="toggle-preview-group">Foreign</div></div>',{url:'https://example.invalid/'});
 for(const name of ['window','document','Element','HTMLElement','MouseEvent','KeyboardEvent']as const)vi.stubGlobal(name,dom.window[name]);
 const document=dom.window.document,overlay=document.querySelector<HTMLElement>('#dna-modal-overlay')!;
 const data={genetics:{source:'synthetic-existing',snps:{rs1:{genotype:'AA',origin:'manual'}}},labData:{synthetic:[{value:3}]},profile:{id:'synthetic-profile'}};
 dom.window.localStorage.setItem('synthetic-dna-existing',JSON.stringify(data));dom.window.localStorage.setItem('synthetic-other-profile','{"protected":true}');
 const beforeData=JSON.stringify(data),beforeStorage=[...Array(dom.window.localStorage.length)].map((_,index)=>{const key=dom.window.localStorage.key(index)!;return[key,dom.window.localStorage.getItem(key)];});
 const calls:string[]=[],events:unknown[]=[],listeners:{type:string;callback:EventListenerOrEventListenerObject}[]=[];
 const add=document.addEventListener.bind(document);const spy=vi.spyOn(document,'addEventListener').mockImplementation((type,callback,options)=>{if(callback)listeners.push({type,callback});add(type,callback,options);});
 try {
  const actions=await import('../js/dna-actions.js');actions.initDnaActionDelegates({closeDNAImportPreview:()=>calls.push('close'),confirmDNAImport:()=>calls.push('confirm')});
  overlay.innerHTML=render(input());
  const primary=overlay.querySelector<HTMLButtonElement>('.import-btn-primary')!,collapse=overlay.querySelector<HTMLElement>('.dna-preview-collapsible')!;
  primary.focus();const snapshots:Record<string,unknown>[]=[];
  function snapshot(step:string){const raw=overlay.innerHTML;snapshots.push({step,raw,dom:dnaPreviewNativeTree(raw),events:structuredClone(events),calls:[...calls],data:JSON.stringify(data),storage:[...Array(dom.window.localStorage.length)].map((_,index)=>{const key=dom.window.localStorage.key(index)!;return[key,dom.window.localStorage.getItem(key)];}),focus:document.activeElement?.outerHTML,foreign:document.querySelector('#foreign')!.outerHTML});}
  function send(target:HTMLElement,key:string){const event=key==='click'?new dom.window.MouseEvent('click',{bubbles:true,cancelable:true}):new dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});target.dispatchEvent(event);events.push({key,type:event.type,cancelled:event.defaultPrevented,action:target.dataset.dnaAction,expanded:collapse.parentElement!.classList.contains('expanded')});snapshot(key+':'+target.dataset.dnaAction);}
  snapshot('initial');send(collapse,'click');collapse.focus();send(collapse,'Enter');send(collapse,' ');send(collapse,'Escape');send(overlay.querySelector<HTMLButtonElement>('.import-btn-secondary')!,'click');send(primary,'click');send(document.querySelector<HTMLElement>('#foreign .dna-preview-collapsible')!,'click');
  expect(calls).toEqual(['close','confirm']);expect(events.map(value=>(value as {cancelled:boolean}).cancelled)).toEqual([true,true,true,false,true,true,false]);expect(document.querySelector('#foreign')!.className).toBe('');expect(JSON.stringify(data)).toBe(beforeData);expect(beforeStorage).toEqual(snapshots.at(-1)!['storage']);
  return snapshots;
 }finally{spy.mockRestore();for(const {type,callback}of listeners)document.removeEventListener(type,callback);dom.window.close();vi.unstubAllGlobals();}
}
it('preserves complete original delegated click/Enter/Space/cancel/confirm/foreign/focus/data/storage chronology',async()=>{
 const original=await run(originalDnaPreview),actual=await run(renderDnaImportPreview);
 const expected=original.map(row=>({...row,raw:expectedDnaPreviewDOMHTML(row['raw']as string),dom:dnaPreviewNativeTree(row['raw']as string,true)}));
 expect(actual).toEqual(expected);
});
