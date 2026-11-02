import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest';
import {JSDOM} from 'jsdom';
import {buildPIIDiffHTML, projectPIIDiff, reviewPIIBeforeSend, showPIIDiffViewer, PII_REVIEW_UNAVAILABLE} from '../js/pii-review.js';
import {renderPIIReviewModal, renderPIIDiffViewer, renderPIIPanel} from '../js/pii-review-presentation.js';

const styles=vi.hoisted(()=>({loaded:true,loadResult:true}));
vi.mock('../js/modal-lifecycle.js', () => ({
  isDataProtectionStylesheetLoaded: () => styles.loaded,
  loadDataProtectionStylesheetForAction: async () => styles.loadResult,
  openModalOverlay: (node: HTMLElement) => node.classList.add('show'),
  removeModalOverlay: (node: HTMLElement) => node.remove(),
  trapModalFocus: () => {},
}));
vi.mock('../js/utils.js', () => ({
  escapeHTML: (value: unknown) => value == null ? '' : String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
  showNotification: vi.fn(),
}));
let window: JSDOM['window'];
const click = (id: string) => window.document.querySelector<HTMLButtonElement>(id)!.click();
beforeEach(() => {
  styles.loaded=true;styles.loadResult=true;
  window = new JSDOM('<!doctype html><body></body>', {pretendToBeVisual: true, url: 'https://pii-fixture.invalid/'}).window;
  for (const name of ['window','document','HTMLElement','HTMLTextAreaElement','Element','Node','Event','AbortController']) vi.stubGlobal(name, Reflect.get(window, name));
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {fn(0);return 1;});
});
afterEach(() => {window.close();vi.unstubAllGlobals();vi.useRealTimers();vi.restoreAllMocks();});
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const fixtures=path.join(import.meta.dirname,'fixtures');
const nativeDiff: {original:string;replacement:string;leftHtml:string;rightHtml:string}[]=JSON.parse(fs.readFileSync(path.join(fixtures,'pii-native-diff.json'),'utf8'));
const nativeModal: {original:string;replacement:string;viewer:string;reviews:{initial:string;streaming:boolean;html:string}[]}=JSON.parse(fs.readFileSync(path.join(fixtures,'pii-native-modal.json'),'utf8'));
// Only inert official Svelte anchors are omitted; every visible node, ordered
// attribute, whitespace character and form value remains part of the oracle.
function normalized(html:string):HTMLElement {
 const root=window.document.createElement('div');root.innerHTML=html;
 const walk=window.document.createTreeWalker(root,128),remove:Node[]=[];
 const anchors=new Set(['','[',']','[!','[-1','[0','[1','[2']);
 for(let node=walk.nextNode();node;node=walk.nextNode())if(anchors.has(node.nodeValue??''))remove.push(node);
 for(const node of remove)node.parentNode?.removeChild(node);root.normalize();return root;
}
function sameDOM(actual:string,expected:string):void {
 const a=normalized(actual),b=normalized(expected);
 expect(a.isEqualNode(b)).toBe(true);
 const controls=(root:HTMLElement)=>[...root.querySelectorAll('input,textarea,button,details')].map(node=>node instanceof window.HTMLTextAreaElement ? [node.value,node.defaultValue,node.readOnly,node.disabled] : node instanceof window.HTMLInputElement ? [node.value,node.defaultValue,node.type,node.checked,node.disabled] : node instanceof window.HTMLButtonElement ? [node.type,node.disabled] : node instanceof window.HTMLDetailsElement ? [node.open] : []);
 expect(controls(a)).toEqual(controls(b));
}
describe('genuine PII children and retained controller',()=>{
 it('preserves the exact public serializer for all original native token/line receipts',()=>{
  for(const row of nativeDiff)expect(buildPIIDiffHTML(row.original,row.replacement)).toEqual({leftHtml:row.leftHtml,rightHtml:row.rightHtml});
 });
 it.each(nativeDiff)('keeps genuine current panels equal to original native complete DOM: $original',row=>{
  const view=projectPIIDiff(row.original,row.replacement);
  sameDOM(renderPIIPanel(view.left),row.leftHtml);sameDOM(renderPIIPanel(view.right),row.rightHtml);
 });
 it.each(nativeModal.reviews)('retains current full modal/defaults initial=$initial streaming=$streaming',row=>{
  const view=projectPIIDiff(nativeModal.original,nativeModal.replacement);
  sameDOM(renderPIIReviewModal(view.left,row.initial,row.streaming),row.html);
 });
 it.each([false,true])('keeps all original adversarial textarea/default-value cases literal, streaming=%s',streaming=>{
  const left=projectPIIDiff('Alice','Bob').left;
  for(const initial of ['&<textarea>"\'','</textarea><button id="injected">x</button>','getbased-pii-private-initial<!--[0-->$&','<textarea>&getbased-pii-private-left','<!--[-->']){
   const root=normalized(renderPIIReviewModal(left,initial,streaming)),textarea=root.querySelector<HTMLTextAreaElement>('textarea')!;
   expect([textarea.value,textarea.defaultValue,textarea.textContent,textarea.readOnly,textarea.getAttribute('spellcheck')]).toEqual([initial,initial,initial,streaming,'false']);
   expect(root.querySelectorAll('#injected,script,img')).toHaveLength(0);
   expect(root.querySelectorAll('.pii-diff-left > div')).toHaveLength(2);
   expect([...root.querySelectorAll('button')].every(button=>button.type==='button')).toBe(true);
  }
 });
 it('keeps genuine viewer complete DOM equal to native and literal malformed words',()=>{
  const view=projectPIIDiff(nativeModal.original,nativeModal.replacement),html=renderPIIDiffViewer(view.left,view.right);
  sameDOM(html,nativeModal.viewer);const root=normalized(html);
  expect(root.querySelectorAll('script,img,#injected')).toHaveLength(0);
  expect(root.querySelector('.pii-diff-left')!.textContent).toContain(nativeModal.original);
  expect(root.querySelector('.pii-diff-right')!.textContent).toContain(nativeModal.replacement);
 });
 it('preserves exact LCS token ties and distinguishes empty fallback from literal NBSP',()=>{
  expect(projectPIIDiff('A B','A C')).toEqual({left:{lines:[{kind:'removed',words:[{kind:'equal',text:'A'},{kind:'equal',text:' '},{kind:'removed',text:'B'}]}]},right:{lines:[{kind:'added',words:[{kind:'equal',text:'A'},{kind:'equal',text:' '},{kind:'added',text:'C'}]}]}});
  expect(buildPIIDiffHTML('\u00a0','\u00a0')).toEqual({leftHtml:'<div>\u00a0</div>',rightHtml:'<div>\u00a0</div>'});
  expect(buildPIIDiffHTML('','')).toEqual({leftHtml:'<div>&nbsp;</div>',rightHtml:'<div>&nbsp;</div>'});
 });
 it('keeps malformed/encoded user text literal through initial values, preview, and send',async()=>{
  const text='&lt;script&gt; &nbsp; </textarea><img id="injected" src=x> <!--[0-->';
  const done=reviewPIIBeforeSend(text,{obfuscatedText:text},{obfuscatePDFText:()=>({original:text,obfuscated:text,replacements:0}),unloadOllamaPIIModel:vi.fn()});
  const textarea=window.document.querySelector<HTMLTextAreaElement>('textarea')!;
  expect(textarea.value).toBe(text);expect(textarea.defaultValue).toBe(text);
  click('#pii-review-regex');expect(window.document.querySelector('.pii-diff-preview')!.textContent).toBe(text);
  expect(window.document.querySelectorAll('script,img,#injected')).toHaveLength(0);
  click('#pii-review-send');expect(await done).toBe(text);
 });
 it('keeps DOM corruption observable beyond inert compiler comments',()=>{
  const view=projectPIIDiff('Alice','Bob'),html=renderPIIPanel(view.left),base=normalized(html);
  for(const changed of [html.replace('Alice','Mallory'),html.replace('pii-word-removed','pii-word-added'),html+'<!--[99-->',html+'<span></span>'])expect(normalized(changed).isEqualNode(base)).toBe(false);
 });
 it('keeps archived private-coordinate-only assertions intact without treating them as current acceptance',()=>{
  const bytes=fs.readFileSync(path.join(fixtures,'pii-retired-protocol.json'));
  expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe('206c76c85a903727e19e47779921bc2b1f3accfa1f28323b5b8302445a824e12');
 });
  it('captures option getters once and retains dependency/read chronology until explicit regex/cancel',async()=>{
    const events:string[]=[];
    const options={get obfuscatedText(){events.push('initial');return 'Bob';},get streamFn(){events.push('stream');return null;}};
    const deps={get obfuscatePDFText(){events.push('obfuscator');return (text:string)=>{events.push(text);return {original:text,get obfuscated(){events.push('result');return 'Carol';},replacements:1};};},get unloadOllamaPIIModel(){events.push('unload-get');return ()=>{events.push('unload');};}};
    const done=reviewPIIBeforeSend('Alice',options,deps);
    expect(events).toEqual(['initial','stream']);click('#pii-review-regex');
    expect(events).toEqual(['initial','stream','obfuscator','Alice','result','unload-get','unload','result']);
    click('#pii-review-cancel');expect(await done).toBe('cancel');
    expect(events.slice(-2)).toEqual(['unload-get','unload']);
  });
  it('keeps failed streaming output unsendable and retry/cancel active without implicit persistence',async()=>{
    const unload=vi.fn(),failure=new Error('model unavailable');let attempts=0;
    const done=reviewPIIBeforeSend('Alice',{streamFn:()=>{attempts++;return Promise.reject(failure);}},{obfuscatePDFText:()=>({original:'Alice',obfuscated:'Bob',replacements:1}),unloadOllamaPIIModel:unload});
    await Promise.resolve();await Promise.resolve();
    expect(window.document.querySelector('#pii-stream-status')!.textContent).toBe('Error: model unavailable Use Regex fallback or retry before sending.');
    expect(window.document.querySelector<HTMLButtonElement>('#pii-review-send')!.disabled).toBe(true);
    expect(window.document.querySelector<HTMLButtonElement>('#pii-stream-retry')!.hidden).toBe(false);
    expect(unload).not.toHaveBeenCalled();click('#pii-stream-retry');expect(attempts).toBe(2);
    await Promise.resolve();await Promise.resolve();click('#pii-review-cancel');expect(await done).toBe('cancel');expect(unload).toHaveBeenCalledTimes(1);
  });
  it('reports a cancelled review after a local model failure as unavailable only when asked',async()=>{
    const deps={obfuscatePDFText:()=>({original:'Alice',obfuscated:'Bob',replacements:1}),unloadOllamaPIIModel:vi.fn()};
    const failing=()=>Promise.reject(new Error('connection refused'));
    const done=reviewPIIBeforeSend('Alice',{streamFn:failing,reportUnavailable:true},deps);
    await Promise.resolve();await Promise.resolve();
    click('#pii-review-cancel');expect(await done).toBe(PII_REVIEW_UNAVAILABLE);
    const optedOut=reviewPIIBeforeSend('Alice',{streamFn:failing},deps);
    await Promise.resolve();await Promise.resolve();
    click('#pii-review-cancel');expect(await optedOut).toBe('cancel');
  });
  it.each([false,true])('reports unavailable stylesheet loading only when opted in: %s',async reportUnavailable=>{
    styles.loaded=false;styles.loadResult=false;
    const stream=vi.fn();
    const deps={obfuscatePDFText:()=>({original:'Alice',obfuscated:'Bob',replacements:1}),unloadOllamaPIIModel:vi.fn()};
    expect(await reviewPIIBeforeSend('Alice',{streamFn:stream,reportUnavailable},deps)).toBe(reportUnavailable?PII_REVIEW_UNAVAILABLE:'cancel');
    expect(stream).not.toHaveBeenCalled();expect(window.document.querySelector('.pii-warning-overlay')).toBeNull();
  });
  it('retains unavailability while a failed model is being retried, then clears it after a successful retry',async()=>{
    let attempt=0;let succeed:(value:string)=>void=()=>{};
    const deps={obfuscatePDFText:()=>({original:'Alice',obfuscated:'Bob',replacements:1}),unloadOllamaPIIModel:vi.fn()};
    const run=()=>reviewPIIBeforeSend('Alice',{reportUnavailable:true,streamFn:()=>{
      attempt++;return attempt===1?Promise.reject(new Error('down')):new Promise<string>(resolve=>{succeed=resolve;});
    }},deps);
    const cancelled=run();await Promise.resolve();await Promise.resolve();
    click('#pii-stream-retry');click('#pii-review-cancel');expect(await cancelled).toBe(PII_REVIEW_UNAVAILABLE);
    attempt=0;const recovered=run();await Promise.resolve();await Promise.resolve();
    click('#pii-stream-retry');succeed('safe final');await Promise.resolve();await Promise.resolve();
    click('#pii-review-cancel');expect(await recovered).toBe('cancel');
  });
  it('treats an unexplained provider AbortError as a failed attempt rather than a user stop',async()=>{
    const done=reviewPIIBeforeSend('Alice',{reportUnavailable:true,streamFn:()=>Promise.reject(new window.DOMException('provider stopped','AbortError'))},{obfuscatePDFText:()=>({original:'Alice',obfuscated:'Bob',replacements:1}),unloadOllamaPIIModel:vi.fn()});
    await Promise.resolve();await Promise.resolve();
    expect(window.document.querySelector('#pii-stream-status')!.textContent).toContain('Error: provider stopped');
    click('#pii-review-cancel');expect(await done).toBe(PII_REVIEW_UNAVAILABLE);
  });
  it('keeps queued and late stream output out of a selected regex result',async()=>{
    const frames:FrameRequestCallback[]=[];
    vi.stubGlobal('requestAnimationFrame',(frame:FrameRequestCallback)=>{frames.push(frame);return frames.length;});
    let lateText:(text:string)=>void=()=>{},lateThinking:(text:string)=>void=()=>{},finish:(text:string)=>void=()=>{};
    const done=reviewPIIBeforeSend('original',{reportUnavailable:true,streamFn:(onChunk,_signal,onThinking)=>{
      lateText=onChunk;lateThinking=onThinking;onChunk('old draft');onThinking('old reasoning');
      return new Promise<string>(resolve=>{finish=resolve;});
    }},{obfuscatePDFText:()=>({original:'original',obfuscated:'safe regex',replacements:1}),unloadOllamaPIIModel:vi.fn()});
    click('#pii-review-regex');lateText('late draft');lateThinking('late reasoning');finish('old final');
    await Promise.resolve();await Promise.resolve();for(const frame of frames)frame(0);
    expect(window.document.querySelector<HTMLTextAreaElement>('#pii-edit-textarea')!.value).toBe('safe regex');
    expect(window.document.querySelector('#pii-thinking-content')!.textContent).toBe('');
    expect(window.document.querySelector('#pii-stream-status')!.textContent).toBe('Regex applied — 1 replacement');
    click('#pii-review-send');expect(await done).toBe('safe regex');
  });
  it('keeps queued output from a stopped attempt out of a successful retry',async()=>{
    const frames:FrameRequestCallback[]=[];vi.stubGlobal('requestAnimationFrame',(frame:FrameRequestCallback)=>{frames.push(frame);return frames.length;});
    let count=0;let oldText:(text:string)=>void=()=>{},oldFinish:(value:string)=>void=()=>{};
    const done=reviewPIIBeforeSend('original',{streamFn:onChunk=>{
      if(count++===0){oldText=onChunk;onChunk('old draft');return new Promise<string>(resolve=>{oldFinish=resolve;});}
      onChunk('new draft');return Promise.resolve('new finalized text');
    }},{obfuscatePDFText:()=>({original:'original',obfuscated:'safe regex',replacements:1}),unloadOllamaPIIModel:vi.fn()});
    click('#pii-stream-stop');for(const frame of frames.splice(0))frame(0);
    expect(window.document.querySelector<HTMLTextAreaElement>('#pii-edit-textarea')!.value).toBe('');
    click('#pii-stream-retry');oldText('late old draft');oldFinish('old finalized text');
    await Promise.resolve();await Promise.resolve();for(const frame of frames)frame(0);
    expect(window.document.querySelector<HTMLTextAreaElement>('#pii-edit-textarea')!.value).toBe('new finalized text');
    click('#pii-review-send');expect(await done).toBe('new finalized text');
  });
  it('ignores queued and late callbacks after cancellation or successful completion',async()=>{
    const frames:FrameRequestCallback[]=[];vi.stubGlobal('requestAnimationFrame',(frame:FrameRequestCallback)=>{frames.push(frame);return frames.length;});
    let late:(text:string)=>void=()=>{},finish:(value:string)=>void=()=>{};
    const begin=()=>reviewPIIBeforeSend('original',{streamFn:onChunk=>{late=onChunk;onChunk('draft');return new Promise<string>(resolve=>{finish=resolve;});}},{obfuscatePDFText:()=>({original:'original',obfuscated:'regex',replacements:1}),unloadOllamaPIIModel:vi.fn()});
    const cancelled=begin();const removed=window.document.querySelector<HTMLTextAreaElement>('#pii-edit-textarea')!;
    click('#pii-review-cancel');late('late cancelled draft');finish('cancelled final');
    await Promise.resolve();await Promise.resolve();for(const frame of frames.splice(0))frame(0);
    expect(await cancelled).toBe('cancel');expect(removed.value).toBe('');
    const completed=begin();finish('validated final');await Promise.resolve();await Promise.resolve();late('late completed draft');
    for(const frame of frames)frame(0);
    expect(window.document.querySelector<HTMLTextAreaElement>('#pii-edit-textarea')!.value).toBe('validated final');
    click('#pii-review-send');expect(await completed).toBe('validated final');
  });
  it('treats cancel as an explicit skip once regex fallback replaced a failed local model',async()=>{
    const deps={obfuscatePDFText:()=>({original:'Alice',obfuscated:'Bob',replacements:1}),unloadOllamaPIIModel:vi.fn()};
    const done=reviewPIIBeforeSend('Alice',{streamFn:()=>Promise.reject(new Error('down')),reportUnavailable:true},deps);
    await Promise.resolve();await Promise.resolve();
    click('#pii-review-regex');click('#pii-review-cancel');expect(await done).toBe('cancel');
  });
  it('ignores a delayed failure from a stream the regex fallback replaced',async()=>{
    const deps={obfuscatePDFText:()=>({original:'Alice',obfuscated:'Bob',replacements:1}),unloadOllamaPIIModel:vi.fn()};
    // Like the reachability probe: an abort surfaces later as a plain Error.
    const pending=(_:unknown,signal:AbortSignal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('unreachable')),{once:true}));
    const done=reviewPIIBeforeSend('Alice',{streamFn:pending,reportUnavailable:true},deps);
    click('#pii-review-regex');
    await Promise.resolve();await Promise.resolve();await Promise.resolve();
    expect(window.document.querySelector('#pii-stream-status')!.textContent).not.toContain('Error:');
    click('#pii-review-cancel');expect(await done).toBe('cancel');
  });
  it('treats cancel after a successful stream as an explicit skip',async()=>{
    const deps={obfuscatePDFText:()=>({original:'Alice',obfuscated:'Bob',replacements:1}),unloadOllamaPIIModel:vi.fn()};
    const done=reviewPIIBeforeSend('Alice',{streamFn:onChunk=>{onChunk('Bob');return Promise.resolve();},reportUnavailable:true},deps);
    await Promise.resolve();await Promise.resolve();
    click('#pii-review-cancel');expect(await done).toBe('cancel');
  });
  it('retains independent viewer close controls and modal removal', () => {
    showPIIDiffViewer('Alice','Bob');expect(window.document.querySelectorAll('.pii-warning-overlay')).toHaveLength(1);
    click('[data-pii-diff-close]');expect(window.document.querySelectorAll('.pii-warning-overlay')).toHaveLength(0);
    showPIIDiffViewer('Alice','Bob');click('.modal-close');expect(window.document.querySelectorAll('.pii-warning-overlay')).toHaveLength(0);
  });
  it('retains search escaping, dirty send label, regex fallback and cancel return', async () => {
    const unload=vi.fn(), obfuscate=vi.fn(()=>({original:'Alice',obfuscated:'Bob [literal]',replacements:1}));
    const done=reviewPIIBeforeSend('Alice [literal]',{obfuscatedText:'Bob [literal]'},{obfuscatePDFText:obfuscate,unloadOllamaPIIModel:unload});
    const search=window.document.querySelector<HTMLInputElement>('#pii-search-input')!, textarea=window.document.querySelector<HTMLTextAreaElement>('#pii-edit-textarea')!;
    search.value='[literal]';search.dispatchEvent(new window.Event('input'));expect(window.document.querySelector('#pii-search-count')!.textContent).toBe('1 found — PII may still be present');
    textarea.value='edited';textarea.dispatchEvent(new window.Event('input'));expect(window.document.querySelector('#pii-review-send')!.textContent).toBe('Save & Send to AI');
    click('#pii-review-regex');expect(obfuscate).toHaveBeenCalledWith('Alice [literal]');expect(unload).toHaveBeenCalledTimes(1);expect(textarea.value).toBe('Bob [literal]');
    click('#pii-review-cancel');expect(await done).toBe('cancel');expect(unload).toHaveBeenCalledTimes(2);
  });
  it('retains synchronous streamed chunks/thinking and explicit final send payload', async () => {
    const unload=vi.fn();let finish:()=>void=()=>{};
    const done=reviewPIIBeforeSend('Alice',{streamFn:(onChunk,_signal,onThinking)=>{onThinking('private thought');onChunk('Bob');return new Promise<void>(resolve=>{finish=resolve;});}},{obfuscatePDFText:()=>({original:'Alice',obfuscated:'regex',replacements:0}),unloadOllamaPIIModel:unload});
    expect(window.document.querySelector('#pii-thinking-content')!.textContent).toBe('private thought');
    expect(window.document.querySelector<HTMLButtonElement>('#pii-review-send')!.disabled).toBe(true);
    finish();await Promise.resolve();await Promise.resolve();
    expect(window.document.querySelector('#pii-stream-status')!.textContent).toBe('Complete — 3 chars — click text to edit');
    click('#pii-review-send');expect(await done).toBe('Bob');expect(unload).not.toHaveBeenCalled();
  });
  it('retains stop/retry AbortSignal ownership and unload chronology', async () => {
    const unload=vi.fn(), signals:AbortSignal[]=[];
    const done=reviewPIIBeforeSend('Alice',{streamFn:(_chunk,signal)=>{signals.push(signal);return new Promise<void>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new window.DOMException('stop','AbortError'))));}},{obfuscatePDFText:()=>({original:'Alice',obfuscated:'Bob',replacements:1}),unloadOllamaPIIModel:unload});
    click('#pii-stream-stop');expect(signals[0]!.aborted).toBe(true);expect(unload).toHaveBeenCalledTimes(1);
    expect(window.document.querySelector<HTMLButtonElement>('#pii-review-send')!.disabled).toBe(true);
    click('#pii-stream-retry');expect(signals).toHaveLength(2);expect(signals[1]!.aborted).toBe(false);
    click('#pii-review-cancel');expect(await done).toBe('cancel');expect(signals[1]!.aborted).toBe(true);
  });
  it('sends the finalized privacy result and shows its actual length', async () => {
    const finalText='Patient: John Doe\nGlucose 91 mg/dL';
    const done=reviewPIIBeforeSend('Patient: Alice Smith\nGlucose 91 mg/dL', {streamFn:onChunk=>{
      onChunk('unfinished model draft');return Promise.resolve(finalText);
    }}, {obfuscatePDFText:()=>({original:'original',obfuscated:'regex',replacements:1}),unloadOllamaPIIModel:vi.fn()});
    await Promise.resolve();await Promise.resolve();
    const textarea=window.document.querySelector<HTMLTextAreaElement>('#pii-edit-textarea')!;
    expect(textarea.value).toBe(finalText);expect(textarea.readOnly).toBe(false);
    expect(window.document.querySelector('#pii-stream-status')!.textContent).toBe(`Complete — ${finalText.length} chars — click text to edit`);
    click('#pii-review-send');expect(await done).toBe(finalText);
  });
  it('retains blur preview and click-line caret/scroll restoration', async () => {
    vi.useFakeTimers();const done=reviewPIIBeforeSend('first\nAlice', {obfuscatedText:'first\nBob'}, {obfuscatePDFText:()=>({original:'Alice',obfuscated:'Bob',replacements:1}),unloadOllamaPIIModel:vi.fn()});
    const textarea=window.document.querySelector<HTMLTextAreaElement>('#pii-edit-textarea')!;
    textarea.dispatchEvent(new window.Event('blur'));await vi.advanceTimersByTimeAsync(150);
    const preview=window.document.querySelector<HTMLElement>('.pii-diff-preview')!;expect(preview).not.toBeNull();
    // Original Edit control toggles the textarea; controller owns selection/focus.
    click('#pii-edit-btn');expect(textarea.style.display).toBe('');expect(window.document.activeElement).toBe(textarea);
    click('#pii-review-cancel');expect(await done).toBe('cancel');
  });
});
