// @vitest-environment jsdom
import {expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {parse} from 'svelte/compiler';
import {renderDashboardGreetingHTML,renderDashboardWelcomeFragment,renderDashboardOnboardingHTML,renderDashboardStartupWelcome,projectDashboardGreetingView,projectDashboardWelcomeView,projectDashboardOnboardingBannerView} from '../js/dashboard-welcome-presentation.js';
import {withDashboardWelcomeSnapshot} from '../scripts/dashboard-welcome-snapshot.mjs';
import {withAppShellSnapshot} from '../scripts/app-shell-snapshot.mjs';
import {renderHTML as renderAppShellHTML} from '../js/components/AppShell.svelte.html.js';
import fixtures from './fixtures/dashboard-welcome-original.json' with {type:'json'};
import annotations from './fixtures/dashboard-welcome-svelte-annotations.json' with {type:'json'};
interface NativeNode {
  type?: number; text?: string | null; name?: string; namespace?: string | null;
  attributes?: string[][]; children?: NativeNode[]; control?: unknown;
}
function native(html:string):NativeNode[] {
  const host=document.createElement('template');host.innerHTML=html;
  function node(n:Node):NativeNode {
    if(n instanceof Element) return {name:n.tagName,namespace:n.namespaceURI,attributes:[...n.attributes].map(a=>[a.name,a.value]),children:[...n.childNodes].map(node),control:n instanceof HTMLInputElement?{type:n.type,value:n.value,defaultValue:n.defaultValue,checked:n.checked,defaultChecked:n.defaultChecked,required:n.required,disabled:n.disabled}:null};
    return {type:n.nodeType,text:n.nodeValue};
  }
  return [...host.content.childNodes].map(node);
}
/** ADD-only, fixed source-owned comments. Native nodes, text, attrs/defaults remain exact. */
function withOwnerAnnotations(value:NativeNode[],name:string):NativeNode[] {
  const result=structuredClone(value);
  const rows=new Map(Object.entries(annotations)).get(name);
  if(!rows)throw new Error('Unknown native Welcome fixture '+name);
  const groups=new Map<string,typeof rows>();
  for(const row of rows){
    const key=JSON.stringify(row.path);
    const group=groups.get(key)??[];group.push(row);groups.set(key,group);
  }
  for(const group of [...groups.values()].sort((a,b)=>b[0]!.path.length-a[0]!.path.length)){
    let target=result;
    for(const index of group[0]!.path){
      const children=target[index]?.children;
      if(!children)throw new Error('Missing native child path');
      target=children;
    }
    for(const row of [...group].sort((a,b)=>a.index-b.index)){
      if(row.index<0||row.index>target.length)throw new Error('Invalid native comment position');
      target.splice(row.index,0,{type:8,text:row.text});
    }
  }
  return result;
}
function welcome(mode:'none'|'ready'|'paused',reminder='') {
  return renderDashboardWelcomeFragment(projectDashboardWelcomeView({ready:mode==='ready',paused:mode==='paused',reminder:reminder?{mode:'reminder'}:null}));
}
function profile(sex:string,dob:unknown,trace:string[]=[]){
  return renderDashboardOnboardingHTML(projectDashboardOnboardingBannerView({male:()=>{trace.push('male');return sex==='male'?' active':'';},female:()=>{trace.push('female');return sex==='female'?' active':'';},dob:()=>{trace.push('dob');return dob;}}));
}
for(const fixture of fixtures){
  it('preserves original native full tree/defaults '+fixture.name,()=>{
    const actual=fixture.name==='greeting'?renderDashboardGreetingHTML(projectDashboardGreetingView({title:()=>'<Title>&',name:()=>'<Name>&',parts:()=>['one','<two>&']})):fixture.name==='loading'?renderDashboardWelcomeFragment({mode:'loading'}):fixture.name==='empty'?renderDashboardWelcomeFragment({mode:'empty'}):fixture.name==='reminder'?renderDashboardOnboardingHTML({mode:'reminder'}):fixture.name.startsWith('profile-')?profile(fixture.sex,fixture.dob):welcome(fixture.mode as 'none'|'ready'|'paused',fixture.reminder);
    expect(native(actual)).toEqual(withOwnerAnnotations(native(fixture.html),fixture.name));
  });
}
it('preserves original getter order and atomic DOB coercion failure with literal actions',()=>{
  const trace:string[]=[];profile('male',{[Symbol.toPrimitive](hint:string){trace.push(hint);return '2000-01-02';}},trace);
  expect(trace).toEqual(['male','female','dob','string']);
  const failed:string[]=[];expect(()=>profile('',Symbol('DOB'),failed)).toThrow(TypeError);
  expect(failed).toEqual(['male','female','dob']);
});
it('escapes hostile supplied DOB instead of accepting supplied attributes/elements',()=>{
  const value='2000-01-02" autofocus data-injected="yes"><em id="injected">literal</em><input value="';
  const host=document.createElement('div');host.innerHTML=profile('',value);
  expect(host.querySelector('#injected')).toBeNull();expect(host.querySelector('[data-injected]')).toBeNull();
  const input=host.querySelector<HTMLInputElement>('#onboarding-dob')!;
  expect(input.getAttribute('value')).toBe(value);expect(input.value).toBe('');expect(input.hasAttribute('autofocus')).toBe(false);
});
it('treats private sentinel/action needles in escaped labels as ordinary text',()=>{
  const value='getbased-dashboard-private-primary data-dashboard-private-action="primary-3" <button type="button" class="welcome-action-btn"';
  const body=renderDashboardGreetingHTML(projectDashboardGreetingView({title:()=>value,name:()=>value,parts:()=>[value]}));
  const host=document.createElement('div');host.innerHTML=body;expect(host.querySelectorAll('button')).toHaveLength(0);expect(host.querySelector('h1')!.textContent).toBe('Hey '+value+'.');
});
it('composes typed children and keeps former private needles literal in title/copy',()=>{
  const value='<!---->getbased-dashboard-private-primary<!----><span>getbased-dashboard-private-reminder</span>';
  const model=projectDashboardWelcomeView({ready:false,paused:false,reminder:{mode:'reminder'}});
  const body=renderDashboardWelcomeFragment({...model,primary:{...model.primary,title:value,copy:value}});
  const host=document.createElement('div');host.innerHTML=body;
  expect(host.querySelector('.welcome-primary-panel strong')!.textContent).toBe(value);
  expect(host.querySelector('.welcome-primary-panel p')!.textContent).toBe(value);
  expect(host.querySelectorAll('.ai-reminder-banner')).toHaveLength(1);
  expect(host.querySelector('[data-dashboard-private-action]')).toBeNull();
  expect(host.querySelectorAll('[data-dashboard-welcome-action]')).toHaveLength(4);
});
it('generates one static default owner through the production AppShell path and preserves the hydration marker',()=>{
  const body=renderDashboardStartupWelcome();expect(body).toContain('data-prerendered-welcome');
  const source='<main class="main" id="main-content"><div data-prerendered-welcome>old</div></main><aside>foreign</aside>';
  const currentIndex=fs.readFileSync(path.join(process.cwd(),'index.html'),'utf8');
  // Production composes Welcome as an AppShell child. Standalone SSR has its
  // own outer render envelope; replacing the child with it changes SDK markers.
  const shell = renderAppShellHTML();
  expect(withAppShellSnapshot(currentIndex,shell)).toBe(currentIndex);
  const host=document.createElement('div');host.innerHTML=shell;
  expect(host.querySelectorAll('#main-content [data-prerendered-welcome]')).toHaveLength(1);
  const generated=withDashboardWelcomeSnapshot(source,body);expect(generated).toContain('<aside>foreign</aside>');
  expect(withDashboardWelcomeSnapshot(generated,body)).toBe(generated);
  expect(()=>withDashboardWelcomeSnapshot(source+source,body)).toThrow();
});
it('accepts a long sequence of complete compiler comments without changing snapshot bytes',()=>{
  const source='<main class="main" id="main-content"><div data-prerendered-welcome>old</div></main>';
  const owner='<div class="welcome-hero welcome-hero-noai" data-prerendered-welcome="">new</div>';
  const body='<!----><!--[--><!--]-->'.repeat(10000)+owner;
  expect(withDashboardWelcomeSnapshot(source,body)).toBe('<main class="main" id="main-content">\n      '+body+'\n    </main>');
});
it('rejects malformed or non-owner content after many comments without reinterpreting terminators',()=>{
  const source='<main class="main" id="main-content"><div data-prerendered-welcome>old</div></main>';
  const owner='<div class="welcome-hero welcome-hero-noai" data-prerendered-welcome>new</div>';
  for(const body of ['<!---->'.repeat(10000)+'<div>wrong owner</div>',
    '<!---->'.repeat(10000)+'<!--unterminated',
    '<!--first-->foreign<!--second-->'+owner,
    '<!--unterminated '+owner]){
    expect(()=>withDashboardWelcomeSnapshot(source,body)).toThrow('one owned initial Dashboard welcome');
  }
});
function authoredSlots(source:string,owner:string):string[] {
  const owned:string[]=[];
  function visit(value:unknown):void {
    if(!value||typeof value!=='object')return;
    const node=value as {type?:string;name?:string;expression?:{type?:string;object?:{name?:string};property?:{name?:string}}};
    if(node.type==='EventHandler'||node.type==='OnDirective')throw new Error('Authored event directive');
    if(node.type==='Attribute'&&node.name&&/^on/i.test(node.name))throw new Error('Authored event attribute');
    if(node.type==='HtmlTag'){
      throw new Error('Ordinary Dashboard children must not use raw HTML: '+owner);
    }
    for(const item of Object.values(value))if(Array.isArray(item))item.forEach(visit);else if(item&&typeof item==='object')visit(item);
  }
  visit(parse(source,{modern:true}));
  return owned;
}
it('enumerates all authored event attributes and exact local HtmlTag owners',()=>{
  const owned:string[]=[];
  for(const name of ['DashboardGreeting','DashboardWelcome','DashboardWelcomePrimary','DashboardWelcomeSecondary','DashboardOnboarding']){
    const source=fs.readFileSync(new URL('../js/components/'+name+'.svelte',import.meta.url),'utf8');
    owned.push(...authoredSlots(source,name));
  }
  expect(owned).toEqual([]);
});
for(const markup of ['<button onclick="run()">x</button>','<button onclick={run}>x</button>','<button on:click={run}>x</button>','<button on:click|preventDefault={run}>x</button>','<button on:click>x</button>','<button {onclick}>x</button>']){
  it('rejects authored handler '+markup,()=>expect(()=>authoredSlots(markup,'DashboardWelcome')).toThrow());
}
it('rejects an extra raw HTML owner/expression',()=>{
  expect(()=>authoredSlots('{@html providerHTML}','DashboardWelcome')).toThrow();
  expect(()=>authoredSlots('{@html view.reminderHTML}','DashboardOnboarding')).toThrow();
});

it('keeps full native comparisons sensitive to attrs, text, defaults, children and added comments',()=>{
  const original=fixtures.find(f=>f.name==='profile-male-dob')!;
  const expected=withOwnerAnnotations(native(original.html),original.name);
  const actual=native(profile(original.sex,original.dob));
  expect(actual).toEqual(expected);
  for(const mutation of ['attribute','text','control','child','comment']){
    const corrupt=structuredClone(actual);
    const banner=corrupt.find(n=>n.name==='DIV')!;
    if(mutation==='attribute')banner.attributes!.push(['data-corruption','yes']);
    else if(mutation==='text')banner.children!.push({type:3,text:'foreign'});
    else if(mutation==='control'){
      const walk=(nodes:NativeNode[]):NativeNode|undefined=>{for(const n of nodes){if(n.name==='INPUT')return n;const found=n.children&&walk(n.children);if(found)return found;}return undefined;};
      const input=walk(corrupt)!;input.control={changed:true};
    }else if(mutation==='child')banner.children!.pop();
    else corrupt.push({type:8,text:'foreign'});
    expect(()=>expect(corrupt).toEqual(expected)).toThrow();
  }
  expect(()=>withOwnerAnnotations([], 'unknown')).toThrow();
});
