import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {renderEmojiPicker} from '../js/emoji-picker-presentation.js';
interface PickerPort {showEmojiPicker(anchor:Element,callback:(emoji:string|null|undefined)=>unknown,opts?:{showReset?:boolean}):void}
const original=fs.readFileSync(new URL('./fixtures/emoji-picker-original-controller.js.txt',import.meta.url),'utf8');
const candidate=fs.readFileSync(new URL('../js/category-customization.js',import.meta.url),'utf8');
const escapeHTML=(value:unknown)=>value==null?'':String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function run(source:string,action:(dom:JSDOM,ports:PickerPort,callback:Array<string|null|undefined>,flush:(delay:number)=>void)=>unknown){
  const dom=new JSDOM('<button id="anchor">Icon</button>');
  const timers:Array<{delay:number;fn:()=>void}>=[],callback:Array<string|null|undefined>=[];
  const document=dom.window.document,anchor=document.querySelector('#anchor')!;
  const ports=vm.runInNewContext(source.replace(/^import[\s\S]*?;\n/gm,'').replace(/export /g,'')+'\n;({showEmojiPicker})',{
    document,Node:dom.window.Node,Element:dom.window.Element,escapeHTML,renderEmojiPicker,
    navigateCategoryCustomizationRuntime:()=>{throw new Error('unrelated navigation port must not run');},
    getCategoryCustomizationViewportSize:()=>({width:800,height:600}),
    setTimeout:(fn:()=>void,delay:number)=>{timers.push({fn,delay});return timers.length;},
  }) as PickerPort;
  function flush(delay:number){for(const timer of timers.filter(t=>t.delay===delay))timer.fn();}
  try{ports.showEmojiPicker(anchor,emoji=>callback.push(emoji),{showReset:true});return action(dom,ports,callback,flush);}finally{dom.window.close();}
}
function compare(action:Parameters<typeof run>[1]){expect(run(candidate,action)).toEqual(run(original,action));}
describe('real emoji controller original lifecycle',()=>{
  it('keeps original fixed position, delayed focus and native button defaults',()=>compare((dom,_ports,callback,flush)=>{
    flush(50);const picker=dom.window.document.querySelector('.emoji-picker') as HTMLElement;
    return {left:picker.style.left,top:picker.style.top,focus:dom.window.document.activeElement?.tagName,callbacks:callback,buttonType:picker.querySelector('button')!.type};
  }));
  it('retains filtering, input replacement, focus and caret at search end',()=>compare((dom,_ports,callback)=>{
    const input=dom.window.document.querySelector('input')!;input.value='medical';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    const next=dom.window.document.querySelector('input')!;
    return {replacement:input!==next,value:next.value,focused:next===dom.window.document.activeElement,start:next.selectionStart,end:next.selectionEnd,labels:[...dom.window.document.querySelectorAll('.emoji-picker-label')].map(el=>el.textContent),callbacks:callback};
  }));
  it('retains category toggle and emoji selection callback before removal',()=>compare((dom,_ports,callback)=>{
    const doc=dom.window.document;
    (doc.querySelector('button[data-cat="body"]') as HTMLButtonElement).click();const filtered=doc.querySelectorAll('[data-emoji]').length;
    (doc.querySelector('button[data-cat="body"]') as HTMLButtonElement).click();const all=doc.querySelectorAll('[data-emoji]').length;
    (doc.querySelector('[data-emoji]') as HTMLElement).click();return {filtered,all,callbacks:callback,removed:!doc.querySelector('.emoji-picker')};
  }));
  it('retains reset null callback and native outside/Escape dismissal',()=>{
    compare((dom,_ports,callback)=>{(dom.window.document.querySelector('[data-cat="__reset"]') as HTMLButtonElement).click();return {callback,removed:!dom.window.document.querySelector('.emoji-picker')};});
    for(const kind of ['outside','escape'])compare((dom,_ports,callback,flush)=>{flush(10);const doc=dom.window.document;
      if(kind==='outside')doc.body.dispatchEvent(new dom.window.MouseEvent('mousedown',{bubbles:true}));else doc.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      return {callback,removed:!doc.querySelector('.emoji-picker')};});
  });
  it('leaves the existing picker removed and new markup uncommitted if reset getter throws',()=>{
    compare((dom,ports,_callback)=>{expect(()=>ports.showEmojiPicker(dom.window.document.querySelector('#anchor')!,()=>{}, {get showReset():boolean{throw new Error('reset failed');}})).toThrow('reset failed');return {picker:!!dom.window.document.querySelector('.emoji-picker')};});
  });
});
