import fs from 'node:fs';
import vm from 'node:vm';
import {describe,it,expect} from 'vitest';
import {JSDOM} from 'jsdom';
import {renderEMFInterpretationModal,renderEMFInterpretationStatus,renderEMFInterpretationError} from '../js/emf-interpretation-presentation.js';
import path from 'node:path';
import crypto from 'node:crypto';
import {renderMarkdown} from '../js/markdown.js';
const escape=(value:unknown)=>value==null?'':String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
interface Legacy {open(title:unknown,existing:{text:unknown;model?:unknown}|null,onGenerate:()=>void):void;meta(interp:unknown):string;stream(prompt:string,complete:((value:unknown)=>void)|null):void}
/** Execute the original whole emitted owner under explicit external service ports, not a retyped candidate oracle. */
function legacy(document:Document,trace:string[],source?:string,ports:Record<string,unknown>={}){
 const stripModule=(text:string)=>text.replace(/^import[\s\S]*?;\s*$/gm,'').replace(/^export \{ configureEMFInterpretationRuntimeDeps \};\s*$/gm,'').replace(/^export /gm,'');
 // The candidate moved only its dependency holder; run that actual emitted module
 // under the same original ports before executing the actual candidate controller body.
 const runtime=source===undefined?'':`const {configureEMFInterpretationRuntimeDeps,getEMFInterpretationRuntimeDeps,registerEMFInterpretationCloseHandler}=(()=>{${stripModule(fs.readFileSync(new URL('../js/emf-interpretation-runtime.js',import.meta.url),'utf8'))}\nreturn {configureEMFInterpretationRuntimeDeps,getEMFInterpretationRuntimeDeps,registerEMFInterpretationCloseHandler};})();\n`;
 const code=runtime+stripModule(source??fs.readFileSync(new URL('./fixtures/emf-interpretation-original.js.txt',import.meta.url),'utf8'));
 const context=vm.createContext({document,HTMLElement:document.defaultView!.HTMLElement,Element:document.defaultView!.Element,HTMLButtonElement:document.defaultView!.HTMLButtonElement,
  state:{importedData:{}},escapeHTML:escape,escapeAttr:escape,renderMarkdown:(text:unknown)=>{trace.push('markdown');return String(text);},
  openModalOverlay:()=>{},trapModalFocus:()=>{},isProductRecsEnabled:()=>false,callAssistantFeatureAI:()=>{},calculateCost:()=>0,formatCost:()=>'$0',
  Date,AbortController,getAssistantFeatureIdentity:()=>({}),removeModalOverlay:()=>{},getEMFSeverity:()=>null,saveImportedData:()=>{},showNotification:()=>{},
  SBM_2015_THRESHOLDS:{},trackUsage:()=>{},detectMitigationsInText:()=>[],loadEMFCatalog:()=>{},renderEMFMitigationRecs:()=>'',renderEMFInterpretationModal,renderEMFInterpretationStatus,renderEMFInterpretationError,...ports});
 vm.runInContext(code+'\nglobalThis.original={open:openInterpretationModal,meta:buildMetaLine,stream:streamInterpretation};',context);
 return context.original as Legacy;
}
function parse(document:Document,html:string){const host=document.createElement('div');host.innerHTML=html;
 const anchors=new Set(['','[',']','[!','[-1','[0','[1','[2']);
 // Exact inert @html hydration hashes for the two pinned native Markdown fixtures.
 // Accept them only inside the real body immediately before their exact native child.
 const markdownAnchors=new Map([['yba798','<p>Existing <strong>safe</strong> Markdown</p>'],['cx245f','<p>safe</p>']]);
 const comments=document.createTreeWalker(host,128),remove:Node[]=[];
 for(let node=comments.nextNode();node;node=comments.nextNode()){const next=node.nextSibling,expected=markdownAnchors.get(node.nodeValue??'');
  if(anchors.has(node.nodeValue??'')||(expected!==undefined&&node.parentNode instanceof document.defaultView!.Element&&node.parentNode.id==='emf-interp-body'&&next instanceof document.defaultView!.Element&&next.outerHTML===expected))remove.push(node);}
 for(const node of remove)node.parentNode?.removeChild(node);host.normalize();
 const walk=(node:Node):unknown=>({type:node.nodeType,text:node.nodeType===3||node.nodeType===8?node.nodeValue:null,
  name:node instanceof document.defaultView!.Element?node.tagName:null,attrs:node instanceof document.defaultView!.Element?Array.from(node.attributes,attr=>[attr.name,attr.value]):null,
  children:Array.from(node.childNodes,walk)});return {tree:Array.from(host.childNodes,walk),buttons:Array.from(host.querySelectorAll('button'),button=>({type:button.type,disabled:button.disabled,value:button.value,text:button.textContent,action:button.dataset.emfInterpAction}))};}
describe('EMF interpretation authored presentation and original contract',()=>{
 it.each([null,{text:''},{text:'<p>Existing <strong>safe</strong> Markdown</p>',model:'<model> & value'}])('retains full original source HTML/parser/defaults for %j',existing=>{
  const browser=new JSDOM('<!doctype html><body></body>');try{const trace:string[]=[],old=legacy(browser.window.document,trace);
   const title='<literal> & "quoted" getbased-emf-private-title';old.open(title,existing,()=>{});
   const expected=browser.window.document.querySelector('#emf-interp-overlay')!.innerHTML;
   // Capture pre-parser HTML from the exact original assignment as well as native parsed output.
   const descriptor=Object.getOwnPropertyDescriptor(browser.window.Element.prototype,'innerHTML')!;let raw='';
   const overlay=browser.window.document.getElementById('emf-interp-overlay')!;Object.defineProperty(overlay,'innerHTML',{configurable:true,get:()=>raw,set(value:string){raw=value;}});
   old.open(title,existing,()=>{});Object.defineProperty(overlay,'innerHTML',descriptor);
   const candidate=legacy(browser.window.document,[],fs.readFileSync(path.join(import.meta.dirname,'../js/emf-interpretation.js'),'utf8'));
   const current=renderEMFInterpretationModal(title,existing&&existing.text,()=>({kind:'markdown',sanitizedHTML:String(existing!.text)}),()=>candidate.meta(existing));
   if(process.env['EMF_QUALIFICATION_OUTPUT'])fs.writeFileSync(process.env['EMF_QUALIFICATION_OUTPUT']+'/fixture-'+(existing===null?'empty':existing.text===''?'blank':'existing')+'.json',JSON.stringify({originalRaw:raw,candidateRaw:current,originalParsed:parse(browser.window.document,expected),candidateParsed:parse(browser.window.document,current)},null,2));
   expect(parse(browser.window.document,current)).toEqual(parse(browser.window.document,raw));expect(parse(browser.window.document,current)).toEqual(parse(browser.window.document,expected));
   expect(current).not.toContain('<getbased-');expect(parse(browser.window.document,current).buttons[0]!.text).toBe('×');
   expect(parse(browser.window.document,current).buttons.every(button=>button.type==='submit'&&!button.disabled)).toBe(true);
  }finally{browser.window.close();}
 });
 it('retains eager title/body/meta order and callback exceptions without later reads',()=>{
  const trace:string[]=[];const title={[Symbol.toPrimitive](hint:string){trace.push('title:'+hint);return 'Title';}};
  renderEMFInterpretationModal(title,true,()=>{trace.push('body');return {kind:'markdown',sanitizedHTML:'<p>Safe</p>'};},()=>{trace.push('meta');return '<meta>'; });
  expect(trace).toEqual(['title:string','body','meta']);trace.length=0;
  expect(()=>renderEMFInterpretationModal(title,true,()=>{trace.push('body');throw new Error('body getter');},()=>{trace.push('meta');return '';})).toThrow('body getter');
  expect(trace).toEqual(['title:string','body']);
  expect(()=>renderEMFInterpretationModal({toString(){throw new Error('title coercion');}},true,()=>{throw new Error('later');},()=>'' )).toThrow('title coercion');
  renderEMFInterpretationModal(null,false,()=>{throw new Error('unselected body');},()=>{throw new Error('unselected meta');});
 });
 it.each(['normal','body-throw','meta-throw'] as const)('compares original/candidate public owner getter chronology %s',kind=>{
  const outputs=[];for(const candidate of [false,true]){const browser=new JSDOM();try{const trace:string[]=[];
   const original=legacy(browser.window.document,trace,candidate?fs.readFileSync(new URL('../js/emf-interpretation.js',import.meta.url),'utf8'):undefined);
   const title={[Symbol.toPrimitive](hint:string){trace.push('title:'+hint);return 'Title';}};
   const existing={get text(){trace.push('text');if(kind==='body-throw'&&trace.filter(x=>x==='text').length===2)throw Error('body read');return '<p>safe</p>';},get model(){trace.push('model');if(kind==='meta-throw')throw Error('meta read');return 'Model';}};
   let error:string|null=null;try{original.open(title,existing,()=>{});}catch(value){error=(value as Error).message;}
   outputs.push({trace,error,html:parse(browser.window.document,browser.window.document.getElementById('emf-interp-overlay')?.innerHTML??'')});
  }finally{browser.window.close();}}expect(outputs[1]).toEqual(outputs[0]);
 });
 it.each(['success','empty','failure','abort'] as const)('preserves actual controller stream/throttle/usage/completion chronology %s',kind=>{
  async function run(candidate:boolean){const browser=new JSDOM();try{let now=1000;const trace:string[]=[],snapshots:unknown[]=[];let completion:unknown=null;
   class FixtureDate extends Date{constructor(value?:string|number){super(value??'2001-02-03T04:05:06.000Z');}static override now(){return now;}}
   let resolve!:(value:unknown)=>void,reject!:(value:unknown)=>void;const response=new Promise((yes,no)=>{resolve=yes;reject=no;});
   let stream!:(text:unknown)=>void;
   const api=(options:{onStream:(text:unknown)=>void;signal:AbortSignal;messages:unknown;system:unknown})=>{trace.push('api');stream=options.onStream;expect(options.signal.aborted).toBe(false);expect(options.messages).toEqual([{role:'user',content:'prompt'}]);return response;};
   const original=legacy(browser.window.document,trace,candidate?fs.readFileSync(new URL('../js/emf-interpretation.js',import.meta.url),'utf8'):undefined,{Date:FixtureDate,callAssistantFeatureAI:api,
    getAssistantFeatureIdentity:()=>({get provider(){trace.push('provider');return 'fixture';},get modelId(){trace.push('modelId');return 'model';},get modelDisplay(){trace.push('modelDisplay');return 'Model';},get subscription(){trace.push('subscription');return false;}}),trackUsage:(...args:unknown[])=>trace.push('usage:'+JSON.stringify(args))});
   original.open('Title',null,()=>{});original.stream('prompt',value=>{trace.push('complete');completion=value;});const body=browser.window.document.getElementById('emf-interp-body')!;
   snapshots.push(parse(browser.window.document,body.innerHTML));stream('<think>private</think> first');snapshots.push(parse(browser.window.document,body.innerHTML));now=1149;stream('skipped');snapshots.push(parse(browser.window.document,body.innerHTML));now=1150;stream('second');snapshots.push(parse(browser.window.document,body.innerHTML));
   if(kind==='failure'||kind==='abort')reject({name:kind==='abort'?'AbortError':'Error',message:'<hostile>'});else resolve({text:kind==='empty'?'':'final',usage:{inputTokens:2,outputTokens:3}});
   await response.catch(()=>{});await Promise.resolve();await Promise.resolve();
   const error=kind==='failure'?body.firstElementChild:null;if(error){expect(error.textContent).toBe('Error: <hostile>');expect(error.outerHTML).toBe(candidate?'<div class="emf-interp-error">Error: &lt;hostile&gt;</div>':'<div style="color:var(--red);padding:12px">Error: &lt;hostile&gt;</div>');}
   return {trace,snapshots,completion,bodyText:body.textContent,meta:browser.window.document.getElementById('emf-interp-meta')!.innerHTML,
    generate:browser.window.document.getElementById('emf-interp-generate')!.textContent,buttons:Array.from(browser.window.document.querySelectorAll('button'),button=>({type:button.type,text:button.textContent,action:button.dataset.emfInterpAction,disabled:button.disabled}))};
  }finally{browser.window.close();}}
  return Promise.all([run(false),run(true)]).then(([old,current])=>{expect(current).toEqual(old);expect(old.snapshots[1]).toEqual(old.snapshots[2]);expect(old.snapshots[3]).not.toEqual(old.snapshots[2]);if(kind==='success'||kind==='empty'){expect(old.trace.at(-1)).toBe('complete');expect(old.buttons.find(button=>button.action==='discuss')!.type).toBe('button');}else expect(old.completion).toBeNull();});
 });
 it.each(['Click Interpret to get an AI interpretation of this assessment.','Thinking…','No response received.'] as const)('retains original static status %s',text=>{
  const browser=new JSDOM();try{expect(parse(browser.window.document,renderEMFInterpretationStatus(text))).toEqual(parse(browser.window.document,'<div class="emf-interp-placeholder">'+text+'</div>'));}finally{browser.window.close();}
 });
 it('moves only original error inline declarations and preserves escaped native text',()=>{
  const value='<img src=x onerror=alert(1)> getbased-emf-private-status <!--[-->';
  const baseline='<div class="emf-interp-error">Error: '+escape(value)+'</div>';
  const comparison=new JSDOM();try{expect(parse(comparison.window.document,renderEMFInterpretationError(value))).toEqual(parse(comparison.window.document,baseline));}finally{comparison.window.close();}
  const browser=new JSDOM();try{const holder=browser.window.document.createElement('div');holder.innerHTML=renderEMFInterpretationError(value);
   expect(holder.querySelector('img,script,[onerror]')).toBeNull();expect(holder.textContent).toBe('Error: '+value);
  }finally{browser.window.close();}
 });
 it('keeps sanitized Markdown as the sole rich-text boundary and title/meta/status literal',()=>{
  const browser=new JSDOM();try{
   const text='<img src=x onerror=alert(1)> getbased-emf-private-title <!--[0-->',markdown='## Heading\n\n**Safe** and [bad](javascript:alert(1))\n\n'+text;
   const html=renderEMFInterpretationModal(text,true,()=>({kind:'markdown',sanitizedHTML:renderMarkdown(markdown)}),()=>text);
   const host=browser.window.document.createElement('div');host.innerHTML=html;
   expect(host.querySelector('h3')!.textContent).toBe(text);expect(host.querySelector('#emf-interp-meta')!.textContent).toBe('\n        '+text+'\n      ');
   expect(host.querySelector('#emf-interp-body .chat-h2')!.textContent).toBe('Heading');expect(host.querySelector('strong')!.textContent).toBe('Safe');
   expect(host.querySelectorAll('img,script,[onerror],[href^="javascript:"]')).toHaveLength(0);
   expect(host.querySelector('#emf-interp-body')!.textContent).toContain(text);
  }finally{browser.window.close();}
 });
 it('keeps current native DOM comparisons sensitive to unknown comments, fields and action changes',()=>{
  const browser=new JSDOM();try{
   const html=renderEMFInterpretationModal('Title',false,()=>{throw Error('unselected');},()=>{throw Error('unselected');}),baseline=parse(browser.window.document,html);
   for(const changed of [html.replace('Title','Other'),html.replace('data-emf-interp-action="generate"','data-emf-interp-action="close"'),html+'<!--[99-->',html+'<button></button>'])expect(parse(browser.window.document,changed)).not.toEqual(baseline);
  }finally{browser.window.close();}
 });
 it('preserves seven retired private-coordinate-only controls exactly as history',()=>{
  expect(crypto.createHash('sha256').update(fs.readFileSync(path.join(import.meta.dirname,'fixtures/emf-retired-protocol.json'))).digest('hex')).toBe('a558db1ed29270d3c60dcbacd1faa002c59e0a24e3917a4bc7dff2e11fe22c6b');
 });
});
