// @ts-check
// chat-loader.js - cached first-use boundary for the closed Chat composition.

/** @typedef {typeof import('./app-ai-interaction-modules.js')} ChatModule */

/** @type {Promise<ChatModule> | null} */
let chatModulePromise = null;
/** @type {ChatModule | null} */
let chatModule = null;
let useChatModuleRetryUrl = false;
const chatHostDeps = {};

export function configureChatLoader(deps = {}) {
  Object.assign(chatHostDeps, deps);
  chatModule?.configureAppChatHooks(chatHostDeps);
}

/** @returns {Promise<ChatModule>} */
function loadChatRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./app-ai-interaction-modules.js?lazy-retry=1');
}

/** @returns {Promise<ChatModule>} */
export function loadChatModule() {
  if (!chatModulePromise) {
    const load = useChatModuleRetryUrl
      ? loadChatRetryModule()
      : import('./app-ai-interaction-modules.js');
    const prepareLightSunContext = chatHostDeps.prepareLightSunContext;
    const lightSunContextReady = typeof prepareLightSunContext === 'function'
      ? Promise.resolve(prepareLightSunContext()).catch(() => null)
      : Promise.resolve(null);
    const prepareHealthDataContext = chatHostDeps.prepareHealthDataContext;
    const healthDataContextReady = typeof prepareHealthDataContext === 'function'
      ? Promise.resolve(prepareHealthDataContext()).catch(() => null)
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
function callChatModule(name, args) {
  return loadChatModule().then(module => {
    const callback = module[name];
    if (typeof callback !== 'function') {
      throw new Error(`Chat action ${String(name)} is unavailable`);
    }
    return Reflect.apply(callback, module, args);
  });
}

/**
 * @param {keyof ChatModule} name
 * @param {unknown[]} args
 * @param {unknown} fallback
 */
function callLoadedChatModule(name, args, fallback) {
  const callback = chatModule?.[name];
  return typeof callback === 'function'
    ? Reflect.apply(callback, chatModule, args)
    : fallback;
}

export function openChatPanel(...args) { return callChatModule('openChatPanel', args); }
export function toggleChatPanel(...args) { return callChatModule('toggleChatPanel', args); }
export function createNewThread(...args) { return callChatModule('createNewThread', args); }
export function clearChatHistory(...args) { return callChatModule('clearChatHistory', args); }
export function filterThreadList(...args) { return callChatModule('filterThreadList', args); }
export function sendChatMessage(...args) { return callChatModule('sendChatMessage', args); }
export function setChatBackendFromUI(...args) { return callChatModule('setChatBackendFromUI', args); }
export function setChatPersonality(...args) { return callChatModule('setChatPersonality', args); }
export function setChatWebSearchEnabled(...args) { return callChatModule('setChatWebSearchEnabled', args); }
export function startDiscussion(...args) { return callChatModule('startDiscussion', args); }
export function summarizeThread(...args) { return callChatModule('summarizeThread', args); }
export function toggleChatFullscreen(...args) { return callChatModule('toggleChatFullscreen', args); }
export function toggleHDMode(...args) { return callChatModule('toggleHDMode', args); }
export function togglePersonalityBar(...args) { return callChatModule('togglePersonalityBar', args); }
export function toggleVoiceRecording(...args) { return callChatModule('toggleVoiceRecording', args); }
export function toggleThreadRail(...args) { return callChatModule('toggleThreadRail', args); }
export function useChatPrompt(...args) { return callChatModule('useChatPrompt', args); }
export function askAIAboutCorrelations(...args) { return callChatModule('askAIAboutCorrelations', args); }
export function askAIAboutMarker(...args) { return callChatModule('askAIAboutMarker', args); }

export function closeChatPanel(...args) {
  return callLoadedChatModule('closeChatPanel', args, false);
}

export function closeSummaryModal(...args) {
  return callLoadedChatModule('closeSummaryModal', args, false);
}

export function isChatStreaming(...args) {
  return Boolean(callLoadedChatModule('isChatStreaming', args, false));
}

export function ensureActiveThreadIfLoaded(...args) {
  return callLoadedChatModule('ensureActiveThread', args, false);
}

export function loadChatHistoryIfLoaded(...args) {
  return callLoadedChatModule('loadChatHistory', args, false);
}

export function loadChatThreadsIfLoaded(...args) {
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

export function renderThreadListIfLoaded(...args) {
  return callLoadedChatModule('renderThreadList', args, false);
}

export function updateChatContextStatusIfLoaded(...args) {
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

export function updateChatHeaderModelIfLoaded(...args) {
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

export function onContextCardSavedIfLoaded(...args) {
  return callLoadedChatModule('onContextCardSaved', args, false);
}

export function handleChatKeydown(event) {
  if (event?.key !== 'Enter' || event.shiftKey) return false;
  event.preventDefault?.();
  return callChatModule('sendChatMessage', []);
}
