// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {state} from '../js/state.js';
import {createDefaultProfileData} from '../js/profile.js';
import * as catalog from '../js/context-cards.js';
import {renderEmptyChatState} from '../js/chat-empty-state.js';
import {disposeChatEmptyCatalog} from '../js/chat-empty-catalog-component.js';
import {projectChatEmpty} from '../js/chat-empty-presentation.js';
import {renderHTML as emptyHTML} from '../js/components/ChatEmptyState.svelte.html.js';
import {renderHTML as catalogHTML} from '../js/components/ContextCardCatalog.svelte.html.js';
import {contextChildIsOwned} from '../js/context-child-ownership.js';
import {ensureContextNotes} from '../js/context-notes-view.js';
import {ensureContextCardStatus} from '../js/context-card-status-view.js';
import {publishContextCardStatus} from '../js/context-card-status.js';
import {contextStatusElement} from './helpers/context-card-status-fixture.js';
const previous={profile:state.currentProfile,data:state.importedData,profiles:state.profiles,sex:state.profileSex,dob:state.profileDob,history:state.chatHistory,thread:state.currentThreadId};
let sequence=0;
beforeEach(()=>{
 vi.useFakeTimers();state.currentProfile='empty-catalog-'+ ++sequence;state.profileSex='male';state.profileDob='1990-01-01';
 state.profiles=[{id:state.currentProfile,name:'Synthetic Ada'}];state.importedData=createDefaultProfileData();state.importedData.diet={breakfast:'Reported eggs'};state.importedData.contextNotes='Captured note';
 state.chatHistory=[];state.currentThreadId='synthetic-empty-thread';
 localStorage.setItem('labcharts-ai-provider','ollama');localStorage.setItem('labcharts-ai-paused','false');localStorage.setItem(`labcharts-onboard-extras-done-${state.currentProfile}`,'1');
 sessionStorage.setItem(`chat-onboard-force-step-${state.currentProfile}`,'cards');
 document.body.innerHTML='<aside><input id="outside" value="retained"></aside><main id="empty-host"></main>';
 globalThis.dispatchEvent(new Event('labcharts-profile-switched'));
});
afterEach(async()=>{
 disposeChatEmptyCatalog();vi.restoreAllMocks();document.body.replaceChildren();vi.clearAllTimers();vi.useRealTimers();
 state.currentProfile=previous.profile;state.importedData=previous.data;state.profiles=previous.profiles;state.profileSex=previous.sex;state.profileDob=previous.dob;state.chatHistory=previous.history;state.currentThreadId=previous.thread;
 localStorage.clear();sessionStorage.clear();globalThis.dispatchEvent(new Event('labcharts-profile-switched'));await Promise.resolve();
});
function graph(node:Node|null):unknown {
 if(!node)return null;const element=node instanceof Element?node:null;
 return {type:node.nodeType,value:node.nodeValue,tag:element?.tagName??null,namespace:element?.namespaceURI??null,
  attrs:element?[...element.attributes].map(attr=>[attr.name,attr.value,attr.namespaceURI,attr.prefix]):null,
  defaults:element instanceof HTMLButtonElement?{type:element.type,disabled:element.disabled,value:element.value,tabIndex:element.tabIndex}
   :element instanceof HTMLTextAreaElement?{value:element.value,defaultValue:element.defaultValue,disabled:element.disabled,readOnly:element.readOnly,tabIndex:element.tabIndex}:null,
  children:[...node.childNodes].map(graph)};
}
it.each(['initial','partial'] as const)('retains complete shared catalog SSR native graph inside genuine empty parent: %s',kind=>{
 const model=catalog.projectProfileContextCards(),view=projectChatEmpty({kind,name:'Synthetic Ada',personalityLabel:'Guide',connected:false,filled:1});
 const parent=document.createElement('div'),native=document.createElement('div');parent.innerHTML=emptyHTML({view,contextCatalog:model});native.innerHTML=catalogHTML({view:model});
 expect(graph(parent.querySelector('[data-context-cards-view]'))).toEqual(graph(native.querySelector('[data-context-cards-view]')));
 expect(parent.querySelectorAll('[data-context-cards-view]')).toHaveLength(1);expect(parent.querySelectorAll('article.context-card')).toHaveLength(9);
 expect([...parent.querySelectorAll('button')].every(button=>button.type==='button')).toBe(true);
});
it('commits the original parent before catalog getters, retains its nodes/listeners, and performs no child HTML assignment',()=>{
 const host=document.getElementById('empty-host')!,outside=document.getElementById('outside'),actual=catalog.projectProfileContextCards;
 let committed:Element|null=null,button:Element|null=null,clicks=0,projection=0;const writes:string[]=[];
 const setter=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML')!.set!;
 vi.spyOn(Element.prototype,'innerHTML','set').mockImplementation(function(this:Element,value:string){
  if(this===host)writes.push('parent');if(this.hasAttribute('data-chat-empty-context-slot'))writes.push('child');setter.call(this,value);
  if(this===host){committed=host.querySelector('[data-chat-empty-view]');button=host.querySelector('button');button?.addEventListener('click',()=>clicks++);}
 });
 vi.spyOn(catalog,'projectProfileContextCards').mockImplementation(()=>{projection++;expect(committed).not.toBeNull();expect(host.querySelector('[data-chat-empty-view]')).toBe(committed);
  expect(host.querySelector('[data-chat-empty-context-slot]')!.children).toHaveLength(0);return actual();});
 renderEmptyChatState(host);expect(projection).toBe(1);expect(writes).toEqual(['parent']);expect(host.querySelector('[data-chat-empty-view]')).toBe(committed);expect(host.querySelector('button')).toBe(button);
 button!.dispatchEvent(new Event('click'));expect(clicks).toBe(1);expect(document.getElementById('outside')).toBe(outside);
 expect(host.querySelectorAll('[data-context-cards-view]')).toHaveLength(1);
});
it('leaves the committed original parent and actions intact if catalog projection throws',()=>{
 const host=document.getElementById('empty-host')!,before=JSON.stringify(state.importedData);
 vi.spyOn(catalog,'projectProfileContextCards').mockImplementation(()=>{expect(host.querySelector('[data-chat-empty-view]')).not.toBeNull();throw new Error('Synthetic catalog getter');});
 expect(()=>renderEmptyChatState(host)).toThrow('Synthetic catalog getter');expect(host.querySelector('[data-chat-empty-action="skip-context-cards"]')).not.toBeNull();
 expect(host.querySelectorAll('[data-context-cards-view]')).toHaveLength(0);expect(JSON.stringify(state.importedData)).toBe(before);
});
it('genuinely owns catalog status/notes once, preserves focused fields through ensure, and retires removed subscriptions',async()=>{
 const host=document.getElementById('empty-host')!;renderEmptyChatState(host);
 const fields=[...host.querySelectorAll<HTMLElement>('[data-context-status-host],[data-context-notes-host]')];expect(fields.length).toBeGreaterThan(10);expect(fields.every(contextChildIsOwned)).toBe(true);
 const input=host.querySelector<HTMLTextAreaElement>('.ctx-notes-textarea')!;input.focus();input.setSelectionRange(2,5);
 const summary=contextStatusElement('summary','diet',host)!;
 publishContextCardStatus('diet',{visible:true,label:'Ready',summary:'Genuine catalog update',tips:true});
 expect(summary.textContent).toBe('Genuine catalog update');expect(()=>{ensureContextNotes();ensureContextCardStatus();ensureContextNotes();ensureContextCardStatus();}).not.toThrow();
 expect(host.querySelectorAll('[data-context-status-key="diet"] .ctx-tips-badge')).toHaveLength(1);expect(host.querySelector('.ctx-notes-textarea')).toBe(input);expect(document.activeElement).toBe(input);expect([input.selectionStart,input.selectionEnd]).toEqual([2,5]);
 host.remove();await Promise.resolve();expect(fields.every(field=>!contextChildIsOwned(field))).toBe(true);
 publishContextCardStatus('diet',{summary:'Late retired update'});expect(summary.textContent).toBe('Genuine catalog update');
});
it('retires old catalog owners on profile changes without preserving stale child subscriptions',()=>{
 const host=document.getElementById('empty-host')!;renderEmptyChatState(host);const fields=[...host.querySelectorAll<HTMLElement>('[data-context-status-host],[data-context-notes-host]')];
 state.currentProfile='synthetic-destination';globalThis.dispatchEvent(new Event('labcharts-profile-switched'));expect(fields.every(field=>!contextChildIsOwned(field))).toBe(true);
});
it('uses genuine typed catalog composition and retains public standalone serialization',()=>{
 const source=readFileSync('js/chat-empty-state.ts','utf8'),component=readFileSync('js/components/ChatEmptyState.svelte','utf8');
 expect(source).not.toContain('slot.innerHTML');expect(source).toContain('hydrateChatEmptyCatalog(container, view, projectProfileContextCards())');
 expect(component).toContain('<ContextCardCatalog view={catalog}/>');expect(component).not.toContain('{@html');expect(typeof catalog.renderProfileContextCards).toBe('function');
});
