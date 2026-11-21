// @vitest-environment jsdom
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {beforeEach,expect,it} from 'vitest';
import {renderHTML} from '../js/components/AppShell.svelte.html.js';
import {ensureAppShell} from '../js/app-shell-component.js';
import {ensureChatShell} from '../js/chat-shell-component.js';
import {withAppShellSnapshot} from '../scripts/app-shell-snapshot.mjs';
import {staticKitTemplate} from '../scripts/sveltekit-contracts.mjs';
import {publishChatMessageEditing} from '../js/chat-message-editor-view.js';

const original=fs.readFileSync(path.join(process.cwd(),'tests/fixtures/app-shell-original.html.txt'),'utf8');
// Only annotation values actually present in the immutable native shell oracle.
const nativeAnnotationValues=new Set<string|null>();
const nativeOracle=document.createElement('div');nativeOracle.innerHTML=original;
const nativeComments=document.createTreeWalker(nativeOracle,NodeFilter.SHOW_COMMENT);
while(nativeComments.nextNode())nativeAnnotationValues.add(nativeComments.currentNode.nodeValue);
function host(){const node=document.createElement('div');node.id='app-shell-host';node.style.display='contents';node.innerHTML=renderHTML();return node;}
function element(id:string){const node=document.getElementById(id);if(!node)throw Error('Missing '+id);return node;}
function tree(node:Node):unknown {
 if(node.nodeType===8){expect(nativeAnnotationValues.has(node.nodeValue)).toBe(true);return null;}
 if(node instanceof Element)return {tag:node.tagName,namespace:node.namespaceURI,attrs:[...node.attributes].map(attr=>[attr.name,attr.value]),children:[...node.childNodes].filter(child=>child.nodeType!==8).map(tree)};
 return {type:node.nodeType,value:node.nodeValue};
}
beforeEach(()=>{document.body.replaceChildren(host());});
it('preserves every native element, ordered attribute, text, control default and SVG namespace',()=>{
 const native=document.createElement('div');native.innerHTML=original;const current=element('app-shell-host');
 // The only reviewed native accessibility delta makes the initially closed rail inert.
 const rails=native.querySelectorAll('#chat-thread-rail');expect(rails).toHaveLength(1);
 const rail=rails[0]!;expect([...rail.attributes].map(attr=>[attr.name,attr.value])).toEqual([['class','chat-thread-rail'],['id','chat-thread-rail']]);
 rail.setAttribute('inert','');expect(current.querySelectorAll('#chat-thread-rail[inert]')).toHaveLength(1);
 const toggle=native.querySelector('#sidebar-toggle')!;expect(toggle.hasAttribute('aria-controls')).toBe(false);expect(toggle.hasAttribute('aria-expanded')).toBe(false);
 toggle.setAttribute('aria-controls','sidebar-nav');toggle.setAttribute('aria-expanded','false');
 // Components add inert compiler comments; constrain every candidate annotation
 // while retaining complete native elements, ordered attributes and text.
 const comments=document.createTreeWalker(current,NodeFilter.SHOW_COMMENT);while(comments.nextNode())tree(comments.currentNode);
 expect([...current.children].map(tree)).toEqual([...native.children].flatMap(child=>child.id==='chat-shell-host'?[...child.children].map(tree):[tree(child)]));
 expect(current.querySelectorAll('#chat-panel')).toHaveLength(1);expect(current.querySelector('#chat-panel')!.hasAttribute('inert')).toBe(true);
 const input=current.querySelector<HTMLInputElement>('#pdf-input')!,old=native.querySelector<HTMLInputElement>('#pdf-input')!;
 expect([input.type,input.multiple,input.accept,input.value,input.disabled]).toEqual([old.type,old.multiple,old.accept,old.value,old.disabled]);
});
it('hydrates once retaining Welcome, controls, focus, restored values and live feature hosts',()=>{
 const header=document.querySelector('.header')!,welcome=document.querySelector('[data-prerendered-welcome]')!;
 const input=element('chat-input') as HTMLTextAreaElement;input.value='Browser restored draft';input.focus();
 const menu=element('sidebar-toggle'),main=element('main-content'),sidebar=element('sidebar-nav'),modal=element('detail-modal');
 expect(ensureAppShell()).toBe(true);expect(ensureChatShell()).toBe(true);expect(document.querySelector('.header')).toBe(header);expect(document.querySelector('[data-prerendered-welcome]')).toBe(welcome);
 expect(element('chat-input')).toBe(input);expect(input.value).toBe('Browser restored draft');expect(document.activeElement).toBe(input);
 const live=document.createElement('article');live.textContent='Router-owned page';main.replaceChildren(live);
 const navigation=document.createElement('button');navigation.textContent='Router-owned category';sidebar.append(navigation);
 const dialog=document.createElement('input');dialog.value='Unsaved modal';modal.append(dialog);
 publishChatMessageEditing(true);publishChatMessageEditing(false);ensureAppShell();ensureChatShell();
 expect(element('main-content')).toBe(main);expect(main.firstChild).toBe(live);expect(sidebar.firstChild).toBe(navigation);expect(modal.firstChild).toBe(dialog);
 expect(element('sidebar-toggle')).toBe(menu);expect(element('chat-input')).toBe(input);expect(input.value).toBe('Browser restored draft');
});
it('retires replaced native ownership and does not hydrate the Kit-owned route again',()=>{
 ensureAppShell();const old=element('chat-input');document.body.replaceChildren(host());expect(ensureAppShell()).toBe(true);expect(element('chat-input')).not.toBe(old);
 const kit=document.createElement('div');kit.id='kit-root';kit.innerHTML=renderHTML();document.body.replaceChildren(kit);
 const input=element('chat-input');expect(ensureAppShell()).toBe(true);expect(ensureChatShell()).toBe(true);expect(element('chat-input')).toBe(input);
});
it('mounts the emitted Kit page once and disposes its shell without touching sibling hosts', async () => {
 const load = createRequire(import.meta.url);
 const page = load('../js/kit/routes/app/+page.svelte.native.js') as typeof import('../js/kit/routes/app/+page.svelte.native.js');
 const reference = host(), root = document.createElement('div'), sibling = document.createElement('div');
 root.id = 'kit-root';
 sibling.textContent = 'Independent host';
 document.body.replaceChildren(root, sibling);
 const view = page.mount(page.default, {target: root});
 try {
  page.flushSync();
  const control = element('chat-input') as HTMLTextAreaElement;
  const originalControl = reference.querySelector<HTMLTextAreaElement>('#chat-input')!;
  expect(root.querySelectorAll('#chat-input')).toHaveLength(1);
  expect(root.querySelectorAll('[data-prerendered-welcome]')).toHaveLength(1);
  expect([...root.children].map(node => node.id)).toEqual([...reference.children].map(node => node.id));
  expect({placeholder: control.placeholder, value: control.value, disabled: control.disabled})
   .toEqual({placeholder: originalControl.placeholder, value: originalControl.value, disabled: originalControl.disabled});
  control.value = 'Existing draft in the Kit route';
  control.focus();
  expect(ensureAppShell()).toBe(true);
  expect(ensureChatShell()).toBe(true);
  expect(element('chat-input')).toBe(control);
  expect(document.activeElement).toBe(control);
  expect(control.value).toBe('Existing draft in the Kit route');
 } finally {
  await page.unmount(view);
 }
 expect(root.children).toHaveLength(0);
 expect(sibling.isConnected).toBe(true);
 expect(sibling.textContent).toBe('Independent host');
});
it('changes only shell snapshot bytes and fails closed for missing or duplicate shell markers',()=>{
 const before='<!doctype html><html><head></head><body><div id="legal-consent-overlay">Gate</div><script src="js/legal-consent-bootstrap.js"></script>';
 const after='<script src="version.js" defer></script><script type="module" src="js/main.js"></script></body></html>';
 const source=before+'<!-- APP_SVELTE_SHELL_START -->old<!-- APP_SVELTE_SHELL_END -->'+after;
 const snapshot=withAppShellSnapshot(source,renderHTML());expect(snapshot.startsWith(before)).toBe(true);expect(snapshot.endsWith(after)).toBe(true);
 expect(withAppShellSnapshot(snapshot,renderHTML())).toBe(snapshot);expect(snapshot.match(/id="main-content"/g)).toHaveLength(1);expect(snapshot.match(/id="chat-panel"/g)).toHaveLength(1);
 expect(()=>withAppShellSnapshot('',renderHTML())).toThrow('one generated App');expect(()=>withAppShellSnapshot(source+source,renderHTML())).toThrow('one generated App');
});
it('gives the Kit route the whole shell while retaining the original document and bootstrap order',()=>{
 const index=fs.readFileSync(path.join(process.cwd(),'index.html'),'utf8');const output=staticKitTemplate(index);
 expect(output.startsWith('<!DOCTYPE html>')).toBe(index.startsWith('<!DOCTYPE html>'));
 const begin=index.indexOf('<!-- APP_SVELTE_SHELL_START'),end=index.indexOf('<!-- APP_SVELTE_SHELL_END -->')+'<!-- APP_SVELTE_SHELL_END -->'.length;
 expect(begin).toBeGreaterThan(index.indexOf('PRODUCTION_LEGAL_BOOTSTRAP_END'));expect(end).toBeLessThan(index.indexOf('src="version.js"'));
 expect(output).toContain('id="legal-consent-overlay"');expect(output).not.toContain('id="main-content"');expect(output).not.toContain('class="header"');expect(output).not.toContain('class="app-footer"');expect(output).not.toContain('id="chat-panel"');
 expect(output.match(/%sveltekit.body%/g)).toHaveLength(1);expect(output.match(/%sveltekit.head%/g)).toHaveLength(1);
 expect(output.indexOf('legal-consent-bootstrap.js')).toBeLessThan(output.indexOf('%sveltekit.body%'));expect(output.indexOf('%sveltekit.body%')).toBeLessThan(output.indexOf('version.js'));
 expect(output).toContain('src="/js/service-worker-update.js"');expect(output).toContain('src="/js/analytics-bootstrap.js"');expect(output).not.toContain('src="js/main.js"');
 expect(()=>staticKitTemplate(index.replace('APP_SVELTE_SHELL_END','BROKEN'))).toThrow('one generated App');expect(()=>staticKitTemplate(index.replace('<!-- APP_SVELTE_SHELL_END -->','<!-- APP_SVELTE_SHELL_END --><!-- APP_SVELTE_SHELL_START --><!-- APP_SVELTE_SHELL_END -->'))).toThrow('one generated App');
 expect(fs.readFileSync(path.join(process.cwd(),'js/kit/routes/app/+page.svelte'),'utf8')).toContain('<AppShell />');
});
