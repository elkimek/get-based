// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderHTML } from '../js/components/ChatShell.svelte.html.js';
import { ensureChatShell } from '../js/chat-shell-component.js';
import { initChatLayout, syncChatLayout } from '../js/chat-layout.js';
import { resizeChatLayout, isChatLayoutCurrent } from '../js/chat-layout-view.js';
function element(id: string) { return document.getElementById(id) as HTMLElement; }
function mountShell() {
  const host = document.createElement('div'); host.id = 'chat-shell-host'; host.innerHTML = renderHTML();
  document.body.replaceChildren(host); ensureChatShell(); element('chat-panel').classList.add('open'); initChatLayout();
  for (const [id, fallback, property] of [['chat-panel',600,'--chat-panel-width'],['chat-thread-rail',220,'--chat-rail-width']] as const) {
    vi.spyOn(element(id),'getBoundingClientRect').mockImplementation(() => new DOMRect(0,0,Number.parseFloat(element(id).style.getPropertyValue(property)) || fallback,900));
  }
}
function pointer(target: EventTarget, type: string, x: number, id = 1, button = 0) {
  const event = new MouseEvent(type, { bubbles:true, cancelable:true, clientX:x, button });
  Object.defineProperty(event,'pointerId',{value:id}); target.dispatchEvent(event);
}
function key(id: string, name: string) { element(id).dispatchEvent(new KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true})); }
beforeEach(async () => {
  localStorage.clear();
  vi.stubGlobal('innerWidth',1400);
  vi.stubGlobal('matchMedia',vi.fn(() => ({matches:globalThis.innerWidth >= 769})));
  mountShell(); await Promise.resolve();
});
afterEach(() => vi.unstubAllGlobals());
it('renders current panel and rail geometry and aria values without replacing live controls', () => {
  const input=element('chat-input');
  expect(element('chat-panel').style.getPropertyValue('--chat-panel-width')).toBe('600px');
  expect(document.body.style.getPropertyValue('--chat-panel-current-width')).toBe('600px');
  element('chat-thread-rail').classList.add('open'); syncChatLayout();
  expect(element('chat-panel').style.getPropertyValue('--chat-panel-width')).toBe('820px');
  expect(element('chat-panel-resize-handle').getAttribute('aria-valuemin')).toBe('580');
  expect(element('chat-rail-resize-handle').getAttribute('aria-valuenow')).toBe('220');
  expect(element('chat-input')).toBe(input);
});
it('owns keyboard direction, Home and double-click defaults with independent stored preferences', () => {
  key('chat-panel-resize-handle','ArrowLeft');
  expect(localStorage.getItem('labcharts-chat-panel-width')).toBe('616');
  element('chat-thread-rail').classList.add('open');syncChatLayout();
  key('chat-rail-resize-handle','ArrowRight');
  expect(localStorage.getItem('labcharts-chat-rail-width')).toBe('236');
  key('chat-panel-resize-handle','ArrowRight');
  expect(localStorage.getItem('labcharts-chat-panel-with-rail-width')).toBe('804');
  key('chat-rail-resize-handle','Home');
  expect(localStorage.getItem('labcharts-chat-rail-width')).toBe('220');
  element('chat-panel-resize-handle').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
  expect(localStorage.getItem('labcharts-chat-panel-with-rail-width')).toBe('600');
  expect(localStorage.getItem('labcharts-chat-panel-width')).toBe('616');
});
it('captures a single pointer and persists live movement exactly once per accepted move', () => {
  const handle=element('chat-panel-resize-handle');const write=vi.spyOn(Storage.prototype,'setItem');
  pointer(handle,'pointerdown',800,1,2);expect(document.body.classList.contains('chat-layout-resizing')).toBe(false);
  pointer(handle,'pointerdown',800);pointer(handle,'pointermove',740,2);expect(write).not.toHaveBeenCalled();
  pointer(handle,'pointermove',740);expect(write).toHaveBeenCalledExactlyOnceWith('labcharts-chat-panel-width','660');
  expect(document.body.classList.contains('chat-layout-resizing')).toBe(true);
  pointer(window,'pointerup',740);pointer(handle,'pointermove',700);expect(write).toHaveBeenCalledTimes(1);
  expect(document.body.classList.contains('chat-layout-resizing')).toBe(false);
});
it.each(['pointercancel','lostpointercapture','blur'] as const)('retires a drag on %s', event => {
  const handle=element('chat-panel-resize-handle');pointer(handle,'pointerdown',800);
  if(event==='pointercancel') pointer(window,event,800);
  else (event==='blur'?window:handle).dispatchEvent(new Event(event));
  pointer(handle,'pointermove',700);
  expect(localStorage.getItem('labcharts-chat-panel-width')).toBeNull();
  expect(document.body.classList.contains('chat-layout-resizing')).toBe(false);
});
it('rejects retired controls and clears the global drag when the shell is replaced', async () => {
  const retired=element('chat-panel-resize-handle');pointer(retired,'pointerdown',800);
  mountShell();await Promise.resolve();
  expect(isChatLayoutCurrent(retired)).toBe(false);
  resizeChatLayout(retired,'panel',900);pointer(retired,'pointermove',700);key('chat-panel-resize-handle','ArrowLeft');
  expect(localStorage.getItem('labcharts-chat-panel-width')).toBe('616');
  expect(document.body.classList.contains('chat-layout-resizing')).toBe(false);
});
it('retires a drag and owned width variables on the mobile viewport', () => {
  const handle=element('chat-panel-resize-handle');pointer(handle,'pointerdown',800);
  vi.stubGlobal('innerWidth',390);window.dispatchEvent(new Event('resize'));pointer(handle,'pointermove',700);key('chat-panel-resize-handle','ArrowLeft');
  expect(element('chat-panel').style.getPropertyValue('--chat-panel-width')).toBe('');
  expect(element('chat-thread-rail').style.getPropertyValue('--chat-rail-width')).toBe('');
  expect(document.body.style.getPropertyValue('--chat-panel-current-width')).toBe('');
  expect(document.body.classList.contains('chat-layout-resizing')).toBe(false);
  expect(localStorage.getItem('labcharts-chat-panel-width')).toBeNull();
});
it('clamps invalid saved preferences and preserves panel minimums for the projected rail', () => {
  localStorage.setItem('labcharts-chat-panel-width','not-a-number');syncChatLayout();
  expect(element('chat-panel-resize-handle').getAttribute('aria-valuenow')).toBe('600');
  localStorage.setItem('labcharts-chat-rail-width','999');element('chat-thread-rail').classList.add('open');syncChatLayout();
  resizeChatLayout(element('chat-panel-resize-handle'),'panel',0);
  expect(localStorage.getItem('labcharts-chat-panel-with-rail-width')).toBe('720');
  expect(element('chat-rail-resize-handle').getAttribute('aria-valuenow')).toBe('360');
  resizeChatLayout(element('chat-rail-resize-handle'),'rail',0);
  expect(localStorage.getItem('labcharts-chat-rail-width')).toBe('180');
});

it.each(['close','fullscreen','rail'] as const)('retires a live drag at the %s shell boundary', boundary => {
  const rail=element('chat-thread-rail');rail.classList.add('open');syncChatLayout();
  const handle=element(boundary==='rail'?'chat-rail-resize-handle':'chat-panel-resize-handle');
  pointer(handle,'pointerdown',800);
  if(boundary==='close') element('chat-panel').classList.remove('open');
  if(boundary==='fullscreen') element('chat-panel').classList.add('chat-panel-fullscreen');
  if(boundary==='rail') rail.classList.remove('open');
  syncChatLayout();pointer(handle,'pointermove',700);
  expect(document.body.classList.contains('chat-layout-resizing')).toBe(false);
  expect(localStorage.getItem(boundary==='rail'?'labcharts-chat-rail-width':'labcharts-chat-panel-with-rail-width')).toBeNull();
});

it('keeps the closed rail inert and restores the same live controls on desktop and mobile',()=>{
 const rail=element('chat-thread-rail'),search=element('chat-thread-search');
 expect(rail.hasAttribute('inert')).toBe(true);
 for(const width of [1400,390]){
  vi.stubGlobal('innerWidth',width);rail.classList.add('open');syncChatLayout();
  expect(rail.inert).toBe(false);expect(element('chat-thread-search')).toBe(search);
  rail.classList.remove('open');syncChatLayout();expect(rail.inert).toBe(true);
 }
});
it('returns focus from a closing rail to its live header toggle without taking over panel close',()=>{
 const rail=element('chat-thread-rail'),toggle=document.querySelector<HTMLButtonElement>('.chat-rail-toggle')!,close=rail.querySelector<HTMLButtonElement>('.chat-rail-back')!;
 rail.classList.add('open');syncChatLayout();close.focus();expect(document.activeElement).toBe(close);
 rail.classList.remove('open');syncChatLayout();expect(rail.inert).toBe(true);expect(document.activeElement).toBe(toggle);
 rail.classList.add('open');syncChatLayout();close.focus();element('chat-panel').classList.remove('open');syncChatLayout();
 expect(rail.inert).toBe(true);expect(document.activeElement).not.toBe(toggle);
});
it('does not steal external focus or let a retired rail update the current owner',async()=>{
 const oldRail=element('chat-thread-rail');oldRail.classList.add('open');syncChatLayout();
 const outside=document.createElement('button');document.body.append(outside);outside.focus();oldRail.classList.remove('open');syncChatLayout();expect(document.activeElement).toBe(outside);
 mountShell();await Promise.resolve();const current=element('chat-thread-rail');expect(current).not.toBe(oldRail);
 oldRail.classList.add('open');syncChatLayout();expect(current.inert).toBe(true);
});

it('focuses the visible mobile rail only for explicit opening and preserves restored preference focus',async()=>{
 const {toggleThreadRail,restoreRailState}=await import('../js/chat-threads.js');
 const {state}=await import('../js/state.js');
 const rail=element('chat-thread-rail'),toggle=document.querySelector<HTMLButtonElement>('.chat-rail-toggle')!,close=rail.querySelector<HTMLButtonElement>('.chat-rail-back')!,input=element('chat-input');
 for(const width of [1400,390]){
  vi.stubGlobal('innerWidth',width);vi.stubGlobal('matchMedia',vi.fn((query:string)=>({matches:query.includes('max-width')?width<=768:width>=769})));
  rail.classList.remove('open');syncChatLayout();toggle.focus();toggleThreadRail();
  expect(rail.inert).toBe(false);expect(document.activeElement).toBe(width<=768?close:toggle);
  toggleThreadRail();expect(rail.inert).toBe(true);expect(document.activeElement).toBe(toggle);
  localStorage.setItem(`labcharts-${state.currentProfile}-chatRailOpen`,'true');input.focus();restoreRailState();
  expect(rail.inert).toBe(false);expect(document.activeElement).toBe(input);
 }
});
