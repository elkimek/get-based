import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {parse} from 'svelte/compiler';
import {renderEmojiPicker,projectEmojiPicker,type EmojiCategory} from '../js/emoji-picker-presentation.js';
import {expectedEmojiSSR,requireEmojiGraph} from './helpers/emoji-genuine-expected-graph.js';
const ports=vi.hoisted(()=>({change:(html:string)=>html}));
let receipt=0;
export function nativeTree(markup:string):unknown {
  const dom=new JSDOM('');try{
    const template=dom.window.document.createElement('template');template.innerHTML=markup;
    function walk(node:Node):unknown{
      const el=node instanceof dom.window.Element?node:null;
      const defaults=el instanceof dom.window.HTMLInputElement?{type:el.type,value:el.value,defaultValue:el.defaultValue,disabled:el.disabled,readOnly:el.readOnly}
        :el instanceof dom.window.HTMLButtonElement?{type:el.type,disabled:el.disabled,value:el.value}
        :el instanceof dom.window.HTMLElement?{tabIndex:el.tabIndex}:null;
      return {type:node.nodeType,value:node.nodeValue,tag:el?.tagName??null,namespace:el?.namespaceURI??null,
        attrs:el?[...el.attributes].map(a=>[a.name,a.value,a.namespaceURI,a.prefix]):null,defaults,
        children:[...node.childNodes].map(walk)};
    }
    return [...template.content.childNodes].map(walk);
  }finally{dom.window.close();}
}
function record(kind:string,markup:string,props:unknown=null):void{
  const directory=process.env['GETBASED_EMOJI_RAW_OUTPUT'];if(!directory)return;
  fs.writeFileSync(path.join(directory,`raw-${receipt++}-${kind}.json`),JSON.stringify({kind,props,markup,tree:nativeTree(markup)},null,2),{flag:'wx'});
}
vi.mock('../js/components/EmojiPicker.svelte.html.js',async importOriginal=>{
  const actual=await importOriginal<typeof import('../js/components/EmojiPicker.svelte.html.js')>();
  return {renderHTML:(props:Parameters<typeof actual.renderHTML>[0])=>{
    const markup=actual.renderHTML(props);record('compiled',markup,props);return ports.change(markup);
  }};
});
const escape=(value:unknown)=>value==null?'':String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
vi.mock('../js/utils.js',()=>({escapeHTML:(value:unknown)=>value==null?'':String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))}));
const controller=fs.readFileSync(new URL('./fixtures/emoji-picker-original-controller.txt',import.meta.url),'utf8');
const paletteSource=controller.slice(controller.indexOf('const EMOJI_CATEGORIES = ['),controller.indexOf('export function showEmojiPicker'));
const categories=vm.runInNewContext(paletteSource+';EMOJI_CATEGORIES') as EmojiCategory[];
const nativeRender=vm.runInNewContext('('+fs.readFileSync(new URL('./fixtures/emoji-picker-original-render.txt',import.meta.url),'utf8')+')',{escapeHTML:escape}) as (search:string,active:string|null|undefined,categories:readonly EmojiCategory[],opts:{showReset?:boolean})=>string;
function original(search:string,active:string|null|undefined,reset:boolean):string{
  const markup=nativeRender(search,active,categories,{showReset:reset});record('original',markup);return markup;
}
function resetStyleTransferred(html:string):string{
  const prefix='<button data-cat="__reset" title="Reset to default" style="font-size:12px;font-family:inherit">';
  return html.replace(prefix,'<button data-cat="__reset" title="Reset to default">');
}
afterEach(()=>{ports.change=html=>html;});
describe('complete category emoji picker presentation',()=>{
  const cases:Array<[string,string|null|undefined,boolean]>=[['',null,false],['',null,true],...categories.map(c=>['',c.id,false] as [string,string,boolean]),['medical',null,true],['SCIENCE',null,false],['no matching category',null,false],['medical','body',true],['<script>&"\n<!--foreign-->getbased-emoji-search-private-slot',null,true]];
  cases.forEach(([search,active,reset],i)=>it('preserves native whole tree/defaults and emoji choices '+i,()=>{
    const old=original(search,active,reset),current=renderEmojiPicker(search,active,categories,()=>reset);
    record('facade',current);expect(nativeTree(current)).toEqual(nativeTree(expectedEmojiSSR(resetStyleTransferred(old))));
    const dom=new JSDOM(current);try{
      expect(dom.window.document.querySelector('script,[onclick]')).toBeNull();
      const oldDOM=new JSDOM(old);try{
        expect(dom.window.document.querySelector('input')!.value).toBe(oldDOM.window.document.querySelector('input')!.value);
        expect(dom.window.document.querySelector('input')!.defaultValue).toBe(search);
      }finally{oldDOM.window.close();}
      expect([...dom.window.document.querySelectorAll('button')].every(button=>button.type==='submit')).toBe(true);
    }finally{dom.window.close();}
  }));
  it('does not rewrite private-class/search literals in catalog title text',()=>{
    const literal='getbased-emoji-private-inactive getbased-emoji-search-private-slot';
    const local=[{id:'literal',label:literal,icon:'X',emojis:['Y']}];
    const old=nativeRender('',null,local,{showReset:false});record('original-collision',old);
    const current=renderEmojiPicker('',null,local,()=>false);record('facade-collision',current);
    expect(nativeTree(current)).toEqual(nativeTree(expectedEmojiSSR(old)));
  });
  it('reads showReset after search coercion once and propagates throws atomically',()=>{
    const trace:string[]=[];const search={toString(){trace.push('search');return '';}};
    const opts={get showReset(){trace.push('reset');throw new Error('reset failed');}};
    expect(()=>Reflect.apply(nativeRender,null,[search,null,categories,opts])).toThrow('reset failed');const old=[...trace];trace.length=0;
    expect(()=>Reflect.apply(renderEmojiPicker,null,[search,null,categories,()=>opts.showReset])).toThrow('reset failed');expect(trace).toEqual(old);
    let calls=0;projectEmojiPicker('',null,categories,()=>{calls++;return true;});expect(calls).toBe(1);
  });
  it('projects literal search once and preserves hostile catalog values as literal data',()=>{
    const literal='<b data-probe>literal & "quoted"</b><!--[0-->getbased-emoji-search-private-slot';
    const empty=projectEmojiPicker(literal,null,[],()=>true);
    expect(empty.searchValue).toBe(literal);expect(empty.showReset).toBe(true);
    const local=[{id:literal,label:literal,icon:literal,emojis:[literal,'🧬','👩🏽‍🔬','⚕️']}];
    const html=renderEmojiPicker('',null,local,()=>true),dom=new JSDOM(html);
    try{
      const doc=dom.window.document,button=doc.querySelector('button:not([data-cat="__reset"])')!;
      expect(button.getAttribute('data-cat')).toBe(literal);expect(button.getAttribute('title')).toBe(literal);
      expect(button.getAttribute('class')).toBe('');expect(button.textContent).toBe(literal);
      expect(doc.querySelector('.emoji-picker-label')!.textContent).toBe(literal);
      expect([...doc.querySelectorAll('[data-emoji]')].map(node=>[node.getAttribute('data-emoji'),node.textContent]))
        .toEqual(local[0]!.emojis.map(emoji=>[emoji,emoji]));
      expect(doc.querySelector('script,b,[data-probe],[onclick]')).toBeNull();
    }finally{dom.window.close();}
    const source=fs.readFileSync(new URL('../js/emoji-picker-presentation.ts',import.meta.url),'utf8');
    expect(source).not.toMatch(/SEARCH_SLOT|private-inactive|matchAll|Unqualified|slice\(/);
  });
  it('contains no authored HTML sinks or handlers',()=>{
    const ast=parse(fs.readFileSync(new URL('../js/components/EmojiPicker.svelte',import.meta.url),'utf8'),{modern:true});
    function visit(value:unknown):void{if(!value||typeof value!=='object')return;const node=value as Record<string,unknown>;
      expect(node.type).not.toBe('HtmlTag');expect(node.type).not.toBe('EventDirective');
      if(node.type==='Attribute')expect(String(node.name)).not.toMatch(/^on(?::|[a-z])/i);
      for(const child of Object.values(node))if(Array.isArray(child))child.forEach(visit);else visit(child);
    }visit(ast);
  });
  for(const [name,mutate] of [
    ['unknown marker',(html:string)=>html.replace('<!--[-->','<!--foreign-->')],
    ['extra marker',(html:string)=>html+'<!---->'],
    ['missing root',(html:string)=>html.replace('<!--[-->','')],
    ['changed literal search',(html:string)=>html.replace('value=""','value="gone"')],
    ['changed inactive class',(html:string)=>html.replace('class=""','class="gone"')],
    ['duplicate inactive button',(html:string)=>html.replace('<div class="emoji-picker-cats">','<div class="emoji-picker-cats"><button data-cat="science" title="Science &amp; Medical" class="">duplicate</button>')],
    ['duplicate search input',(html:string)=>html.replace('<div class="emoji-picker-cats">','<div class="emoji-picker-search"><input type="text" placeholder="Search emoji..." value=""></div><div class="emoji-picker-cats">')],
    ['changed emoji Unicode',(html:string)=>html.replace('🧪','💥')],
    ['changed native input default',(html:string)=>html.replace('type="text"','type="password"')],
  ] as const)it('detects genuine graph corruption '+name,()=>{
    const expected=nativeTree(expectedEmojiSSR(resetStyleTransferred(original('',null,true))));
    expect(()=>requireEmojiGraph(nativeTree(renderEmojiPicker('',null,categories,()=>true)),expected)).not.toThrow();
    ports.change=html=>{const changed=mutate(html);expect(changed).not.toBe(html);return changed;};
    expect(()=>requireEmojiGraph(nativeTree(renderEmojiPicker('',null,categories,()=>true)),expected)).toThrow('Changed genuine Emoji graph');
  });
});
