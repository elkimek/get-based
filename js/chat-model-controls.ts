// Chat model actions share the existing provider/CLI domain services. Svelte
// owns rendering and events; each async action retains its originating view.
import { fetchCustomApiModels, fetchOpenRouterModels, fetchPpqModels, fetchRoutstrModels, fetchVeniceModels,
  getCustomApiKey, getCustomApiUrl, getOllamaConfig, getOpenRouterKey, getPpqKey, getPpqPrivateMode,
  getRoutstrKey, getRoutstrNodeUrl, getVeniceKey, getVeniceE2EE, isRoutstrPrivateModeActive,
  setCustomApiModel, setOllamaMainModel, setPpqModel, supportsVision } from './api.js';
import { discoverLocalAI } from './local-ai-discovery.js';
import { cacheLocalAiModelDetails } from './provider-local-ai-runtime.js';
import { connectDetectedAgent, getAgentHostEndpoint, getAgentHostToken, saveAgentChatSettings } from './agent-chat-settings.js';
import { listAgentModels } from './agent-chat-client.js';
import { cacheAgentModelCatalog, getCachedAgentModelCatalog, resolveAgentModel } from './agent-model-catalog.js';
import { setDirectChatReasoningEffort } from './chat-model-preferences.js';
import { updateChatHeaderModelRuntime } from './chat-runtime.js';
import { hasPendingAttachments } from './chat-images.js';
import { showNotification } from './utils.js';
import { state as appState } from './state.js';
import { getChatModelControlState, isChatModelCatalogEmpty, isChatModelStateCurrent, type ChatModelControlState } from './chat-model-control-state.js';
import { chatModelPickerState } from './chat-model-picker-presentation.js';
import { configureChatModelPicker, getChatModelPickerView } from './chat-model-picker-view.js';
import type { ChatModelPickerView } from './chat-model-picker-contract.js';

// Credentials participate in request ownership but never enter presentation state.
function configuration(state: ChatModelControlState): unknown[] {
  if (state.cli) return [getAgentHostEndpoint(), getAgentHostToken()];
  if (state.provider === 'ollama') {
    const config = getOllamaConfig();
    return [config.url, config.apiKey];
  }
  if (state.provider === 'custom') return [getCustomApiUrl(), getCustomApiKey()];
  if (state.provider === 'openrouter') return [getOpenRouterKey()];
  if (state.provider === 'venice') return [getVeniceKey(), getVeniceE2EE()];
  if (state.provider === 'routstr') return [getRoutstrNodeUrl(), getRoutstrKey(), isRoutstrPrivateModeActive()];
  if (state.provider === 'ppq') return [getPpqKey(), getPpqPrivateMode()];
  return [];
}

function captureContext(state: ChatModelControlState, view: ChatModelPickerView) {
  const profile = appState.currentProfile;
  const thread = appState.currentThreadId;
  let settings = configuration(state);
  const base = () => view.isCurrent() && appState.currentProfile === profile
    && appState.currentThreadId === thread && isChatModelStateCurrent(state);
  const current = (model = false) => base()
    && configuration(state).every((value, index) => value === settings[index])
    && (!model || getChatModelControlState().selectedId === state.selectedId);
  // Connection negotiation checks the original settings before publishing. Its
  // accepted endpoint/token then become the boundary for the catalog request.
  return { base, current, acceptConnection: () => { settings = configuration(state); } };
}
type Context = ReturnType<typeof captureContext>;
let version = 0;
let selectionRevision = 0;
let projection: {
  version: number;
  state: ChatModelControlState;
  view: ChatModelPickerView;
  context: Context;
} | null = null;
let refreshRequest: { current(): boolean } | null = null;

export function refreshChatModelControls() {
  const view = getChatModelPickerView();
  if (!view) return;
  const state = getChatModelControlState();
  if (!projection || projection.view !== view || !projection.context.current(true)) {
    projection = { version: ++version, state, view, context: captureContext(state, view) };
  } else {
    projection.state = state;
  }
  view.render(chatModelPickerState(state, projection.version, refreshRequest?.current() === true));
}

function actionSource(expected: number) {
  if (projection?.version === expected && projection.context.current(true)) return projection;
  refreshChatModelControls();
  return null;
}

function supportsAttachments(state: ChatModelControlState, value: string): boolean {
  if (!hasPendingAttachments()) return true;
  const supported = state.cli
    ? resolveAgentModel(value, getCachedAgentModelCatalog(state.provider, state.target))?.inputModalities.includes('image') === true
    : supportsVision(state.provider, value);
  if (!supported) showNotification('Remove the attached photos before switching to a text-only model.', 'error', 6000);
  return supported;
}

async function selectDirectModel(
  provider: string,
  model: string,
  current: () => boolean,
  allowed: () => boolean,
) {
  if (!current() || !allowed()) return;
  if (provider === 'ollama') setOllamaMainModel(model);
  else if (provider === 'ppq') setPpqModel(model);
  else if (provider === 'custom') setCustomApiModel(model);
  else {
    const controls = await import('./provider-model-controls.js');
    if (!current() || !allowed()) return;
    if (provider === 'venice') controls.onVeniceModelDropdownChange(model);
    else if (provider === 'openrouter') controls.onOpenRouterDropdownChange(model);
    else if (provider === 'routstr') controls.onRoutstrModelDropdownChange(model);
  }
}

async function selectModel(value: string, expected: number) {
  const source = actionSource(expected);
  if (!source || !supportsAttachments(source.state, value)) return;
  const revision = ++selectionRevision;
  const current = () => revision === selectionRevision && source.context.current();
  const ownsChoice = () => revision === selectionRevision && source.context.current(true);
  const connecting = () => revision === selectionRevision && source.context.base()
    && getChatModelControlState().selectedId === source.state.selectedId;
  try {
    if (source.state.cli) {
      await connectDetectedAgent(source.state.provider, { isCurrent: ownsChoice });
      if (!connecting()) return;
      source.context.acceptConnection();
      const models = await listAgentModels({
        endpoint: getAgentHostEndpoint(), token: getAgentHostToken(),
        agent: source.state.provider, target: source.state.target, model: value || undefined,
      });
      if (!ownsChoice()) return;
      cacheAgentModelCatalog(models, source.state.provider, source.state.target);
      if (!ownsChoice() || !supportsAttachments(source.state, value)) return;
      await saveAgentChatSettings({ model: value });
    } else {
      await selectDirectModel(source.state.provider, value, ownsChoice, () => supportsAttachments(source.state, value));
    }
    if (!current()) return;
    source.view.close();
    updateChatHeaderModelRuntime();
    refreshChatModelControls();
  } catch (error) {
    if (current()) showNotification(error instanceof Error ? error.message : 'Could not switch models.', 'error', 8000);
  }
}

async function refreshModels() {
  const view = getChatModelPickerView();
  if (!view || refreshRequest?.current()) return;
  const state = getChatModelControlState();
  const context = captureContext(state, view);
  const request = { current: () => refreshRequest === request && context.current() };
  refreshRequest = request;
  refreshChatModelControls();
  const connecting = () => refreshRequest === request && context.base();
  try {
    if (state.cli) {
      await connectDetectedAgent(state.provider, { isCurrent: request.current });
      if (!connecting()) return;
      context.acceptConnection();
      const models = await listAgentModels({
        endpoint: getAgentHostEndpoint(), token: getAgentHostToken(),
        agent: state.provider, target: state.target, refresh: true,
      });
      if (!request.current()) return;
      cacheAgentModelCatalog(models, state.provider, state.target);
    } else if (state.provider === 'openrouter') {
      await fetchOpenRouterModels(getOpenRouterKey(), { isCurrent: request.current });
    } else if (state.provider === 'venice') {
      await fetchVeniceModels(getVeniceKey(), { isCurrent: request.current });
    } else if (state.provider === 'routstr') {
      await fetchRoutstrModels({ isCurrent: request.current });
    } else if (state.provider === 'ppq') {
      await fetchPpqModels(undefined, { isCurrent: request.current });
    } else if (state.provider === 'custom') {
      await fetchCustomApiModels(getCustomApiUrl(), getCustomApiKey(), { isCurrent: request.current });
    } else if (state.provider === 'ollama') {
      const config = getOllamaConfig();
      const result = await discoverLocalAI(config.url, config.apiKey, { force: true });
      if (request.current()) cacheLocalAiModelDetails(result.modelDetails || [], result.provider === 'ollama');
    }
  } catch (error) {
    if (request.current()) showNotification(error instanceof Error ? error.message : 'Could not refresh models.', 'error', 8000);
  } finally {
    // A retired request must not clear a newer request's loading state.
    if (refreshRequest === request) {
      refreshRequest = null;
      if (view.isCurrent()) refreshChatModelControls();
    }
  }
}

async function saveEffort(value: string, expected: number) {
  const source = actionSource(expected);
  if (!source) return;
  const state = source.state;
  if (value && !state.efforts.includes(value)) return;
  try {
    if (state.cli) await saveAgentChatSettings({ effort: value });
    else setDirectChatReasoningEffort(state.provider, state.selectedId, value);
    if (source.context.current(true)) refreshChatModelControls();
  } catch (error) {
    if (source.context.current(true)) {
      showNotification(error instanceof Error ? error.message : 'Could not save reasoning effort.', 'error', 8000);
      refreshChatModelControls();
    }
  }
}

export function initChatModelControls() {
  configureChatModelPicker({
    refreshView: refreshChatModelControls,
    open: () => {
      refreshChatModelControls();
      if (isChatModelCatalogEmpty()) void refreshModels();
    },
    select: selectModel,
    refresh: refreshModels,
    effort: saveEffort,
  });
  refreshChatModelControls();
}
