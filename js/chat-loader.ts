// chat-loader.js - cached first-use boundary for the closed Chat composition.

type ChatModule = typeof import('./app-ai-interaction-modules.js');

let chatModulePromise: Promise<ChatModule> | null = null;
let chatModule: ChatModule | null = null;
let useChatModuleRetryUrl = false;
const chatHostDeps: Record<string, unknown> = {};

export function configureChatLoader(deps: unknown = {}) {
  Object.assign(chatHostDeps, deps);
  chatModule?.configureAppChatHooks(chatHostDeps);
}

function loadChatRetryModule() {
  return import('./app-ai-interaction-modules.js?lazy-retry=1' as './app-ai-interaction-modules.js');
}

export function loadChatModule() {
  if (!chatModulePromise) {
    const load = useChatModuleRetryUrl
      ? loadChatRetryModule()
      : import('./app-ai-interaction-modules.js');
    const prepareLightSunContext = chatHostDeps.prepareLightSunContext;
    const lightSunContextReady = typeof prepareLightSunContext === 'function'
      ? Promise.resolve((prepareLightSunContext as () => unknown)()).catch(() => null)
      : Promise.resolve(null);
    const prepareHealthDataContext = chatHostDeps.prepareHealthDataContext;
    const healthDataContextReady = typeof prepareHealthDataContext === 'function'
      ? Promise.resolve((prepareHealthDataContext as () => unknown)()).catch(() => null)
      : Promise.resolve(null);
    chatModulePromise = Promise.all([load, lightSunContextReady, healthDataContextReady])
      .then(([module]) => {
        chatModule = module;
        module.configureAppChatHooks(chatHostDeps);
        return module;
      })
      .catch(err => {
        chatModulePromise = null;
        chatModule = null;
        useChatModuleRetryUrl = true;
        throw err;
      });
  }
  return chatModulePromise;
}

export function isChatModuleLoaded() {
  return chatModule !== null;
}

/**
 * @param {keyof ChatModule} name
 * @param {unknown[]} args
 */
function callChatModule(name: keyof ChatModule, args: unknown[]) {
  return loadChatModule().then(module => {
    const callback = module[name];
    if (typeof callback !== 'function') {
      throw new Error(`Chat action ${String(name)} is unavailable`);
    }
    return Reflect.apply(callback, module, args) as unknown;
  });
}

/**
 * @param {keyof ChatModule} name
 * @param {unknown[]} args
 * @param {unknown} fallback
 */
function callLoadedChatModule(name: keyof ChatModule, args: unknown[], fallback: unknown) {
  const callback = chatModule?.[name];
  return typeof callback === 'function'
    ? Reflect.apply(callback, chatModule, args) as unknown
    : fallback;
}

export function openChatPanel(...args: unknown[]) { return callChatModule('openChatPanel', args); }
export function toggleChatPanel(...args: unknown[]) { return callChatModule('toggleChatPanel', args); }
export function createNewThread(...args: unknown[]) { return callChatModule('createNewThread', args); }
export function createThreadProject(...args: unknown[]) { return callChatModule('createThreadProject', args); }
export function clearChatHistory(...args: unknown[]) { return callChatModule('clearChatHistory', args); }
export function filterThreadList(...args: unknown[]) { return callChatModule('filterThreadList', args); }
export function sendChatMessage(...args: unknown[]) { return callChatModule('sendChatMessage', args); }
export function setChatBackendFromUI(...args: unknown[]) { return callChatModule('setChatBackendFromUI', args); }
export function setChatPersonality(...args: unknown[]) { return callChatModule('setChatPersonality', args); }
export function setChatWebSearchEnabled(...args: unknown[]) { return callChatModule('setChatWebSearchEnabled', args); }
export function startDiscussion(...args: unknown[]) { return callChatModule('startDiscussion', args); }
export function summarizeThread(...args: unknown[]) { return callChatModule('summarizeThread', args); }
export function setChatThreadSort(...args: unknown[]) { return callChatModule('setChatThreadSort', args); }
export function toggleChatFullscreen(...args: unknown[]) { return callChatModule('toggleChatFullscreen', args); }
export function togglePersonalityBar(...args: unknown[]) { return callChatModule('togglePersonalityBar', args); }
export function toggleVoiceRecording(...args: unknown[]) { return callChatModule('toggleVoiceRecording', args); }
export function toggleThreadRail(...args: unknown[]) { return callChatModule('toggleThreadRail', args); }
export function useChatPrompt(...args: unknown[]) { return callChatModule('useChatPrompt', args); }
export function askAIAboutCorrelations(...args: unknown[]) { return callChatModule('askAIAboutCorrelations', args); }
export function askAIAboutMarker(...args: unknown[]) { return callChatModule('askAIAboutMarker', args); }

export function closeChatPanel(...args: unknown[]) {
  return callLoadedChatModule('closeChatPanel', args, false);
}

export function closeSummaryModal(...args: unknown[]) {
  return callLoadedChatModule('closeSummaryModal', args, false);
}

export function isChatStreaming(...args: unknown[]) {
  return Boolean(callLoadedChatModule('isChatStreaming', args, false));
}

export function ensureActiveThreadIfLoaded(...args: unknown[]) {
  return callLoadedChatModule('ensureActiveThread', args, false);
}

export function loadChatHistoryIfLoaded(...args: unknown[]) {
  return callLoadedChatModule('loadChatHistory', args, false);
}

export function loadChatThreadsIfLoaded(...args: unknown[]) {
  return callLoadedChatModule('loadChatThreads', args, false);
}

export async function refreshChatPersonalitiesIfLoaded() {
  if (!chatModule) return false;
  await chatModule.loadCustomPersonalities();
  chatModule.loadChatPersonality();
  chatModule.updateChatHeaderTitle();
  chatModule.updatePersonalityBar();
  return true;
}

export function renderThreadListIfLoaded(...args: unknown[]) {
  return callLoadedChatModule('renderThreadList', args, false);
}

export function updateChatContextStatusIfLoaded(...args: unknown[]) {
  if (chatModule) {
    return callLoadedChatModule('updateChatContextStatus', args, false);
  }
  // A few deferred feature surfaces can render Chat directly in isolation
  // (including browser fixtures). Preserve the cold boundary unless a Chat
  // context chip is actually present, then adopt the open panel into the
  // configured composition before refreshing it.
  if (typeof document === 'undefined' || !document.querySelector('.chat-context-status')) {
    return false;
  }
  return callChatModule('updateChatContextStatus', args);
}

export function updateChatHeaderModelIfLoaded(...args: unknown[]) {
  if (chatModule) {
    return callLoadedChatModule('updateChatHeaderModel', args, false);
  }
  // Do not pull Chat into a closed panel merely because profile context
  // changed. The chip is created by Chat on first render, so its presence is
  // a safe signal that a directly-rendered panel needs adopting.
  if (typeof document === 'undefined' || !document.querySelector('.chat-context-status')) {
    return false;
  }
  return callChatModule('updateChatHeaderModel', args);
}

export function onContextCardSavedIfLoaded(...args: unknown[]) {
  return callLoadedChatModule('onContextCardSaved', args, false);
}

export function handleChatKeydown(event: unknown) {
  if ((event as { key?: unknown } | null | undefined)?.key !== 'Enter' || (event as { shiftKey?: unknown }).shiftKey) return false;
  (event as { preventDefault?: (() => unknown) | null }).preventDefault?.();
  return callChatModule('sendChatMessage', []);
}
