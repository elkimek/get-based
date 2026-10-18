import {readFileSync} from 'node:fs';
import type {Component} from 'svelte';
import type {AttestationBadgeProps} from '../../js/chat-attestation-presentation.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {expect,test} from './coverage-fixture.js';
const cases=(JSON.parse(readFileSync('tests/fixtures/chat-attestation-public-original.json','utf8')) as {cases:Array<{name:string;attestation:unknown}>}).cases;
test.beforeEach(async({page,context})=>{
 await installDiscussionFixture(context);await page.goto('/app');
 await page.evaluate(async()=>{await(await import('/js/chat-loader.js')).openChatPanel();});
});

test('typed transcript receipts retain complete genuine badge native graphs and exact usage text',async({page})=>{
 const results=await page.evaluate(async cases=>{
  const [{state},render,projector]=await Promise.all([import('/js/state.js'),import('/js/chat-render.js'),import('/js/chat-transcript-presentation.js')]);
  const modulePath='/js/components/ChatAttestationBadge.svelte.native.js';
  const reference=await import(modulePath) as {default:Component<AttestationBadgeProps>;mount:typeof import('svelte').mount;unmount:typeof import('svelte').unmount;flushSync:typeof import('svelte').flushSync};
  function tree(node:Node|null):unknown {
   if(!node)return null;const element=node instanceof Element?node:null;
   return {type:node.nodeType,value:node.nodeValue,tag:element?.tagName??null,namespace:element?.namespaceURI??null,
    attrs:element?[...element.attributes].map(a=>[a.name,a.value,a.namespaceURI,a.prefix]):null,
    defaults:element instanceof HTMLButtonElement?{type:element.type,disabled:element.disabled,value:element.value,tabIndex:element.tabIndex}:null,
    children:[...node.childNodes].map(tree)};
  }
  const results=[];
  for(const row of cases){
   const message={role:'assistant',content:'**Synthetic receipt**',provider:'openrouter',modelId:'synthetic/model',modelDisplay:'Synthetic model',usage:{inputTokens:10,outputTokens:20},e2ee:true,attestation:row.attestation};
   state.chatHistory=[message];render.renderChatMessages();
   const article=document.getElementById('chat-msg-0')!,footnote=article.querySelector('.chat-cost-footnote')!;
   const target=document.createElement('div');document.body.append(target);
   const owner=reference.mount(reference.default,{target,props:{attestation:row.attestation,footnote:true}});reference.flushSync();
   try{results.push({name:row.name,actual:tree(footnote.querySelector('button')),expected:tree(target.querySelector('button')),
     count:footnote.querySelectorAll('.e2ee-attestation-badge').length,expectedCount:target.querySelectorAll('.e2ee-attestation-badge').length,
     text:footnote.textContent,expectedText:projector.projectChatTranscriptMessage(message,0).usage!.text+target.textContent,
     body:article.querySelector('strong')?.textContent,injection:!!article.querySelector('img,[data-probe],script,[onerror]')});
   }finally{await reference.unmount(owner);reference.flushSync();target.remove();}
  }
  return results;
 },cases);
 for(const result of results){expect(result.actual,result.name).toEqual(result.expected);expect(result.count,result.name).toBe(result.expectedCount);expect(result.count).toBeLessThanOrEqual(1);
  expect(result.text,result.name).toBe(result.expectedText);expect(result.body).toBe('Synthetic receipt');expect(result.injection).toBe(false);}
});

test('typed receipt tooltip preserves node identity focus security changes and retirement',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');state.chatHistory=[{role:'assistant',content:'Receipt lifecycle',provider:'openrouter',modelId:'synthetic/model',modelDisplay:'Synthetic model',usage:{inputTokens:10,outputTokens:20},e2ee:true,attestation:{securityVerified:true,enclaveHost:'<host data-probe>literal & quoted</host>'}}];
  (await import('/js/chat-render.js')).renderChatMessages();
 });
 const badge=page.locator('#chat-msg-0 .e2ee-attestation-badge'),tooltip=page.locator('#e2ee-attestation-tooltip');
 await expect(badge).toHaveCount(1);const retained=await badge.elementHandle();await badge.focus();await expect(tooltip).toBeVisible();await expect(tooltip).toContainText('TEE attestation verified');
 await expect(tooltip).toContainText('<host data-probe>literal & quoted</host>');await expect(tooltip.locator('host,[data-probe]')).toHaveCount(0);
 await expect(badge).toHaveAttribute('aria-expanded','true');await expect(badge).toHaveAttribute('aria-describedby','e2ee-attestation-tooltip');
 await page.evaluate(async()=>{(await import('/js/chat-render.js')).renderChatMessages({preserveScroll:true});});
 expect(await retained!.evaluate(node=>node===document.querySelector('#chat-msg-0 .e2ee-attestation-badge'))).toBe(true);await expect(badge).toBeFocused();await expect(tooltip).toBeVisible();
 await page.keyboard.press('Escape');await expect(tooltip).toBeHidden();await expect(badge).toHaveAttribute('aria-expanded','false');
 await page.keyboard.press('Enter');await expect(tooltip).toBeVisible();
 await page.evaluate(async()=>{const{state}=await import('/js/state.js');state.chatHistory[0]!.attestation={securityVerified:false,enclaveHost:'synthetic.invalid'};(await import('/js/chat-render.js')).renderChatMessages({preserveScroll:true});});
 await expect(tooltip).toBeHidden();expect(await retained!.evaluate(node=>node===document.querySelector('#chat-msg-0 .e2ee-attestation-badge'))).toBe(true);
 await expect(badge).toContainText('failed');await badge.focus();await page.keyboard.press('Enter');await expect(tooltip).toBeVisible();await expect(tooltip).toContainText('TEE attestation FAILED');
 await page.evaluate(async()=>{const{state}=await import('/js/state.js');state.chatHistory=[{role:'assistant',content:'Plain replacement',provider:'openrouter',modelId:'synthetic/model',usage:{inputTokens:1,outputTokens:2},e2ee:false}];(await import('/js/chat-render.js')).renderChatMessages();});
 await expect(tooltip).toBeHidden();await expect(badge).toHaveCount(0);expect(await retained!.evaluate(node=>node.isConnected)).toBe(false);
 await expect(page.locator('[data-chat-attestation-host]')).toHaveCount(1);expect(errors).toEqual([]);
});
