// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { renderHTML } from '../js/components/ChatShell.svelte.html.js';
import { ensureChatShell } from '../js/chat-shell-component.js';
import { initChatModelControls, refreshChatModelControls } from '../js/chat-model-controls.js';
import { chatModelPickerActions } from '../js/chat-model-picker-view.js';
import { state } from '../js/state.js';
import { connectDetectedAgent, saveAgentChatSettings } from '../js/agent-chat-settings.js';
import { listAgentModels } from '../js/agent-chat-client.js';
import { discoverLocalAI } from '../js/local-ai-discovery.js';
import { localAiResult } from '../js/local-ai-provider-shared.js';
import { cacheLocalAiModelDetails } from '../js/provider-local-ai-runtime.js';
import { hasPendingAttachments } from '../js/chat-images.js';
import { showNotification } from '../js/utils.js';
vi.mock('../js/agent-chat-settings.js',async original=>({...await original<typeof import('../js/agent-chat-settings.js')>(),connectDetectedAgent:vi.fn().mockResolvedValue({})}));
vi.mock('../js/agent-chat-client.js',()=>({listAgentModels:vi.fn().mockResolvedValue([])}));
vi.mock('../js/local-ai-discovery.js',()=>({discoverLocalAI:vi.fn()}));
vi.mock('../js/provider-local-ai-runtime.js',async original=>({...await original<typeof import('../js/provider-local-ai-runtime.js')>(),cacheLocalAiModelDetails:vi.fn()}));
vi.mock('../js/chat-images.js',()=>({hasPendingAttachments:vi.fn().mockReturnValue(false)}));
vi.mock('../js/utils.js',async original=>({...await original<typeof import('../js/utils.js')>(),showNotification:vi.fn()}));
function mount() {const host=document.createElement('div');host.id='chat-shell-host';host.innerHTML=renderHTML();document.body.replaceChildren(host);ensureChatShell();initChatModelControls();}
function menu(){return document.getElementById('chat-model-menu') as HTMLDetailsElement;}
function actions(){return chatModelPickerActions(menu())!;}
// The view's version is intentionally private; real handlers supply it from
// their bound rendered state, so exercise actual buttons/range controls.
function choose(value:string){const button=[...menu().querySelectorAll<HTMLButtonElement>('[data-chat-model-value]')].find(button=>button.dataset.chatModelValue===value)!;button.click();}
async function settled(){await Promise.resolve();await Promise.resolve();await Promise.resolve();}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>resolve=done);return {promise,resolve};}
beforeEach(async()=>{
  vi.clearAllMocks();vi.mocked(hasPendingAttachments).mockReturnValue(false);vi.mocked(connectDetectedAgent).mockResolvedValue({} as Awaited<ReturnType<typeof connectDetectedAgent>>);vi.mocked(listAgentModels).mockResolvedValue([]);
  localStorage.clear();state.currentProfile='picker-profile';state.currentThreadId='picker-thread';
  localStorage.setItem('labcharts-ai-provider','custom');localStorage.setItem('labcharts-custom-model','model-a');
  localStorage.setItem('labcharts-custom-models',JSON.stringify([{id:'model-a',name:'Model A',reasoning:{supported_efforts:['low','high']}},{id:'model-b',name:'<img src=x onerror=alert(1)>',reasoning:{supported_efforts:['low','high']}}]));
  mount();await settled();
});
it('renders literal metadata and owns direct selection without native templates or delegates',async()=>{
  expect(menu().textContent).toContain('<img src=x onerror=alert(1)>');expect(menu().querySelector('img')).toBeNull();
  choose('model-b');await settled();
  expect(localStorage.getItem('labcharts-custom-model')).toBe('model-b');expect(document.getElementById('chat-model-menu-label')!.textContent).toBe('<img src=x onerror=alert(1)>');
});
it('previews effort locally and persists the bound option for the current model',async()=>{
  const input=document.getElementById('chat-model-effort') as HTMLInputElement;input.value='2';input.dispatchEvent(new Event('input',{bubbles:true}));await settled();
  expect(document.getElementById('chat-model-effort-value')!.textContent).toBe('High');
  expect(localStorage.getItem('labcharts-chat-reasoning-effort-v1:custom:model-a')).toBeNull();
  input.dispatchEvent(new Event('change',{bubbles:true}));await settled();
  expect(localStorage.getItem('labcharts-chat-reasoning-effort-v1:custom:model-a')).toBe('high');
  choose('model-b');await settled();expect((document.getElementById('chat-model-effort') as HTMLInputElement).value).toBe('0');
});
it('blocks text-only selection while photos are attached',async()=>{
  localStorage.setItem('labcharts-ai-provider','openrouter');
  localStorage.setItem('labcharts-openrouter-model','model-a');
  localStorage.setItem('labcharts-openrouter-models',localStorage.getItem('labcharts-custom-models')!);
  localStorage.setItem('labcharts-openrouter-vision-models','[]');
  refreshChatModelControls();
  vi.mocked(hasPendingAttachments).mockReturnValue(true);choose('model-b');await settled();
  expect(localStorage.getItem('labcharts-openrouter-model')).toBe('model-a');expect(showNotification).toHaveBeenCalledWith('Remove the attached photos before switching to a text-only model.','error',6000);
});
it.each(['profile','thread','provider','view','credential','agent','target','model'] as const)('rejects a late CLI catalog/selection at the %s boundary',async boundary=>{
  await saveAgentChatSettings({agent:'codex',model:''});localStorage.setItem('labcharts-chat-backend','codex');refreshChatModelControls();
  const pending=deferred<Awaited<ReturnType<typeof listAgentModels>>>();vi.mocked(listAgentModels).mockReturnValueOnce(pending.promise);
  const candidate='new-cli-model';
  // Supply a real cached advertised model so selection is made through the UI.
  const catalog=await import('../js/agent-model-catalog.js');catalog.cacheAgentModelCatalog([{id:candidate,model:candidate,displayName:'New CLI',supportedReasoningEfforts:[],inputModalities:['text']}],'codex');
  refreshChatModelControls();choose(candidate);await settled();
  expect(listAgentModels).toHaveBeenCalledOnce();
  if(boundary==='profile')state.currentProfile='other-profile';
  if(boundary==='thread')state.currentThreadId='other-thread';
  if(boundary==='provider')localStorage.setItem('labcharts-chat-backend','direct');
  if(boundary==='view')mount();
  if(boundary==='credential')localStorage.setItem('labcharts-agent-host-endpoint','http://127.0.0.1:8325');
  if(boundary==='agent')await saveAgentChatSettings({agent:'opencode'});
  if(boundary==='target')await saveAgentChatSettings({target:'gateway-home'});
  if(boundary==='model')await saveAgentChatSettings({model:'newer-settings-choice'});
  pending.resolve([]);await settled();
  expect(localStorage.getItem('labcharts-agent-host-model')).toBe(boundary==='model'?'newer-settings-choice':'');expect(showNotification).not.toHaveBeenCalled();
});
it('lets the latest CLI model choice win when catalog replies arrive in reverse order',async()=>{
  await saveAgentChatSettings({agent:'codex',model:''});localStorage.setItem('labcharts-chat-backend','codex');
  const catalog=await import('../js/agent-model-catalog.js');catalog.cacheAgentModelCatalog(['first','second'].map(id=>({id,model:id,displayName:id,inputModalities:['text']})),'codex');refreshChatModelControls();
  const first=deferred<Awaited<ReturnType<typeof listAgentModels>>>(),second=deferred<Awaited<ReturnType<typeof listAgentModels>>>();vi.mocked(listAgentModels).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  choose('first');await settled();choose('second');await settled();
  second.resolve([]);await settled();first.resolve([]);await settled();
  expect(localStorage.getItem('labcharts-agent-host-model')).toBe('second');
});
it('rejects replaced local discovery results and allows the new context to refresh independently',async()=>{
  localStorage.setItem('labcharts-ai-provider','ollama');refreshChatModelControls();
  const first=deferred<Awaited<ReturnType<typeof discoverLocalAI>>>(),second=deferred<Awaited<ReturnType<typeof discoverLocalAI>>>();vi.mocked(discoverLocalAI).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const old=actions().refresh();await settled();state.currentProfile='other-profile';refreshChatModelControls();const current=actions().refresh();await settled();
  const providerResult={...localAiResult('ollama',[]),capabilities:{}};
  const result:Awaited<ReturnType<typeof discoverLocalAI>>={...providerResult,baseUrl:'http://127.0.0.1:11434',discoveredAt:0,executionLocation:'local',openai:{...providerResult,provider:'openai'},ollama:providerResult};
  second.resolve(result);await current;
  first.resolve(result);await old;
  expect(cacheLocalAiModelDetails).toHaveBeenCalledExactlyOnceWith([],true);
});
it('rejects detached picker actions and events after replacement',async()=>{
  const retired=menu();const retiredActions=chatModelPickerActions(retired);const button=retired.querySelector<HTMLButtonElement>('[data-chat-model-value="model-b"]')!;
  mount();await settled();button.click();await settled();
  expect(retiredActions).not.toBeNull();expect(chatModelPickerActions(retired)).toBeNull();expect(localStorage.getItem('labcharts-custom-model')).toBe('model-a');
});

it('rejects credentials changed during CLI connection negotiation',async()=>{
  await saveAgentChatSettings({agent:'codex',model:''});localStorage.setItem('labcharts-chat-backend','codex');
  const catalog=await import('../js/agent-model-catalog.js');
  catalog.cacheAgentModelCatalog([{id:'candidate',model:'candidate',displayName:'Candidate',inputModalities:['text']}],'codex');refreshChatModelControls();
  const connection=deferred<void>();
  vi.mocked(connectDetectedAgent).mockImplementationOnce(async(_agent,options)=>{
    await connection.promise;
    if(options?.isCurrent?.()===false)throw new Error('Superseded connection');
    return {} as Awaited<ReturnType<typeof connectDetectedAgent>>;
  });
  choose('candidate');await settled();
  localStorage.setItem('labcharts-agent-host-endpoint','http://127.0.0.1:8325');
  connection.resolve();await settled();
  expect(listAgentModels).not.toHaveBeenCalled();
  expect(localStorage.getItem('labcharts-agent-host-model')).toBe('');
  expect(showNotification).not.toHaveBeenCalled();
});

it('rechecks photos attached while CLI selection is awaiting a catalog',async()=>{
  await saveAgentChatSettings({agent:'codex',model:''});localStorage.setItem('labcharts-chat-backend','codex');
  const catalog=await import('../js/agent-model-catalog.js');
  const models=[{id:'text-only',model:'text-only',displayName:'Text only',inputModalities:['text']}];
  catalog.cacheAgentModelCatalog(models,'codex');refreshChatModelControls();
  const response=deferred<Awaited<ReturnType<typeof listAgentModels>>>();vi.mocked(listAgentModels).mockReturnValueOnce(response.promise);
  choose('text-only');await settled();vi.mocked(hasPendingAttachments).mockReturnValue(true);
  response.resolve(models);await settled();
  expect(localStorage.getItem('labcharts-agent-host-model')).toBe('');
  expect(showNotification).toHaveBeenCalledWith('Remove the attached photos before switching to a text-only model.','error',6000);
});

it('owns Escape immediately after opening, before a deferred native toggle event',async()=>{
  menu().querySelector('summary')!.click();
  const escape=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});
  document.dispatchEvent(escape);await settled();
  expect(escape.defaultPrevented).toBe(true);
  expect(menu().open).toBe(false);
  expect(document.activeElement).toBe(menu().querySelector('summary'));
});
