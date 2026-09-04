// @ts-check
// Compact model and reasoning picker shared by direct, local, and CLI-backed
// chat routes. Provider setup remains in Settings; this surface only switches
// models exposed by the active provider.

import {
  fetchCustomApiModels,
  fetchOpenRouterModels,
  fetchPpqModels,
  fetchRoutstrModels,
  fetchVeniceModels,
  getActiveModelDisplay,
  getActiveModelId,
  getAIProvider,
  getCustomApiKey,
  getCustomApiUrl,
  getOllamaConfig,
  getOpenRouterKey,
  getPpqPrivateMode,
  getVeniceKey,
  getVeniceE2EE,
  isRecommendedModel,
  isRoutstrPrivateModeActive,
  modelMetadataIsAvailable,
  selectLatestModelFamilies,
  selectLatestRecommendedModels,
  setCustomApiModel,
  setOllamaMainModel,
  setPpqModel,
  supportsVision,
} from './api.js';
import { readStoredArray } from './api-provider-storage.js';
import { discoverLocalAI } from './local-ai-discovery.js';
import { cacheLocalAiModelDetails, getCachedLocalAiModelDetails } from './provider-local-ai-runtime.js';
import {
  connectDetectedAgent,
  getAgentHostAgent,
  getAgentHostEffort,
  getAgentHostEndpoint,
  getAgentHostModel,
  getAgentHostTarget,
  getAgentHostToken,
  getChatBackend,
  saveAgentChatSettings,
} from './agent-chat-settings.js';
import { listAgentModels } from './agent-chat-client.js';
import {
  cacheAgentModelCatalog,
  getAgentModelDisplay,
  getCachedAgentModelCatalog,
  resolveAgentModel,
  sortReasoningEffortValues,
} from './agent-model-catalog.js';
import { getDirectChatReasoningEffort, setDirectChatReasoningEffort } from './chat-model-preferences.js';
import { getModelReasoningCapabilities } from './reasoning-capabilities.js';
import { updateChatHeaderModelRuntime } from './chat-runtime.js';
import { hasPendingAttachments } from './chat-images.js';
import { escapeAttr, escapeHTML, showNotification } from './utils.js';

const MODEL_SEARCH_THRESHOLD = 9;
let controlsInitialized = false;
let modelRefreshInProgress = false;

const PROVIDER_LABELS = Object.freeze({
  ollama: 'Local AI',
  venice: 'Venice',
  openrouter: 'OpenRouter',
  routstr: 'Routstr',
  ppq: 'PPQ',
  custom: 'Custom API',
  codex: 'Codex CLI',
  claude: 'Claude Agent',
  opencode: 'OpenCode',
  hermes: 'Hermes Agent',
  grok: 'Grok Build',
  openclaw: 'OpenClaw',
});

function titleCase(value) {
  const raw = String(value || '');
  if (raw === 'xhigh') return 'Extra high';
  if (raw === 'none') return 'Off';
  return raw ? `${raw.charAt(0).toUpperCase()}${raw.slice(1)}` : 'Default';
}

function normalizedEfforts(value) {
  if (!Array.isArray(value)) return [];
  return sortReasoningEffortValues([...new Set(value.map(item => typeof item === 'string'
    ? item
    : item?.reasoningEffort || item?.effort || item?.value || '').map(item => String(item).trim()).filter(Boolean))]);
}

function readDirectModels(provider) {
  if (provider === 'ollama') {
    return getCachedLocalAiModelDetails().modelDetails.map(model => ({
      ...model,
      id: model.name || model.id,
      name: model.name || model.id,
    })).filter(model => model.id);
  }
  const keys = {
    openrouter: ['labcharts-openrouter-models'],
    venice: [getVeniceE2EE() ? 'labcharts-venice-e2ee-models' : 'labcharts-venice-models'],
    routstr: [isRoutstrPrivateModeActive() ? 'labcharts-routstr-private-models' : 'labcharts-routstr-models'],
    ppq: [getPpqPrivateMode() ? 'labcharts-ppq-private-models' : 'labcharts-ppq-models'],
    custom: ['labcharts-custom-models'],
  }[provider] || [];
  const models = keys.flatMap(readStoredArray).filter(model => model && typeof model === 'object'
    && model.id && modelMetadataIsAvailable(model));
  return [...new Map(models.map(model => [model.id, model])).values()];
}

function providerGroupFromModel(agent, modelId) {
  const id = String(modelId || '');
  if (agent === 'opencode' || agent === 'openclaw') return id.includes('/') ? id.split('/')[0] : agent;
  if (agent === 'hermes') {
    if (id.startsWith('custom:')) return id.split(':').slice(0, 2).join(':');
    return id.includes(':') ? id.split(':')[0] : 'Hermes';
  }
  return '';
}

function friendlyProviderGroup(value) {
  const known = {
    recommended: 'Recommended',
    current: 'Current personal profile',
    other: 'Other models',
    openrouter: 'OpenRouter',
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    'openai-codex': 'OpenAI Codex',
    opencode: 'OpenCode',
    openclaw: 'OpenClaw',
    'opencode-free': 'OpenCode Free',
    'opencode-zen': 'OpenCode Zen',
    ollama: 'Ollama',
    'ollama-cloud': 'Ollama Cloud',
    venice: 'Venice',
    xai: 'xAI',
    'custom:ollama': 'Ollama',
    'custom:openrouter': 'OpenRouter (custom)',
  };
  return known[value] || String(value || '').split(/[-_:]/).filter(Boolean)
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function cliModelIsRecommended(agent, modelId) {
  const id = String(modelId || '');
  if (agent === 'opencode' && id.startsWith('openrouter/')) {
    return isRecommendedModel('openrouter', id.slice('openrouter/'.length));
  }
  return isRecommendedModel('custom', id);
}

function orderCliModels(agent, target, catalog) {
  // A personal gateway is the authority for its own profile. Do not apply
  // getbased's cross-provider recommendations to that catalog: they can make
  // an unrelated model look endorsed even when the gateway merely reports it.
  const recommended = target === 'local'
    ? selectLatestModelFamilies(catalog.filter(model => cliModelIsRecommended(agent, model.id)))
    : catalog.filter(model => model.isDefault);
  const recommendedIds = new Set(recommended.map(model => model.id));
  return {
    recommendedIds,
    models: [...recommended, ...catalog.filter(model => !recommendedIds.has(model.id))],
  };
}

function orderDirectModels(provider, catalog) {
  const recommended = selectLatestRecommendedModels(provider, catalog);
  const recommendedIds = new Set(recommended.map(model => model.id));
  return {
    recommendedIds,
    models: [...recommended, ...catalog.filter(model => !recommendedIds.has(model.id))],
  };
}

function currentControlState() {
  const cli = getChatBackend() === 'codex';
  if (cli) {
    const agent = getAgentHostAgent();
    const target = getAgentHostTarget(agent);
    const catalog = getCachedAgentModelCatalog(agent, target);
    const selectedId = getAgentHostModel();
    const selected = resolveAgentModel(selectedId, catalog);
    const defaultModel = catalog.find(model => model.isDefault) || catalog[0] || null;
    const orderedCatalog = orderCliModels(agent, target, catalog);
    const models = [
      {
        id: '',
        name: defaultModel ? `Default · ${defaultModel.displayName}` : 'CLI default',
        search: `default ${defaultModel?.displayName || ''} ${defaultModel?.id || ''}`,
        group: '',
      },
      ...orderedCatalog.models.map(model => ({
        id: model.id,
        name: model.displayName || model.id,
        search: `${model.displayName || ''} ${model.id} ${model.model || ''}`,
        group: orderedCatalog.recommendedIds.has(model.id)
          ? (target === 'local' ? 'recommended' : 'current')
          : providerGroupFromModel(agent, model.id) || (orderedCatalog.recommendedIds.size ? 'other' : ''),
      })),
    ];
    if (selectedId && !catalog.some(model => model.id === selectedId || model.model === selectedId)) {
      models.splice(1, 0, { id: selectedId, name: `${selectedId} · unavailable`, search: selectedId, group: providerGroupFromModel(agent, selectedId) });
    }
    return {
      cli: true,
      provider: agent,
      target,
      providerLabel: PROVIDER_LABELS[agent] || 'CLI agent',
      selectedId,
      selectedName: selectedId ? getAgentModelDisplay(selectedId, catalog) : (defaultModel?.displayName || 'CLI default'),
      models,
      efforts: normalizedEfforts(selected?.supportedReasoningEfforts),
      defaultEffort: selected?.defaultReasoningEffort || '',
      selectedEffort: getAgentHostEffort(),
    };
  }
  const provider = getAIProvider();
  const selectedId = getActiveModelId(provider);
  const cached = readDirectModels(provider);
  const selected = cached.find(model => model.id === selectedId) || null;
  const reasoningCapabilities = getModelReasoningCapabilities(provider, selected);
  const orderedCatalog = orderDirectModels(provider, cached);
  const models = orderedCatalog.models.map(model => ({
    id: model.id,
    name: model.name || model.displayName || model.id,
    search: `${model.name || ''} ${model.displayName || ''} ${model.id}`,
    group: orderedCatalog.recommendedIds.has(model.id)
      ? 'recommended'
      : orderedCatalog.recommendedIds.size ? 'other' : '',
  }));
  if (selectedId && !models.some(model => model.id === selectedId)) {
    models.unshift({
      id: selectedId,
      name: getActiveModelDisplay(provider),
      search: selectedId,
      group: orderedCatalog.recommendedIds.size ? 'other' : '',
    });
  }
  return {
    cli: false,
    provider,
    providerLabel: PROVIDER_LABELS[provider] || provider,
    selectedId,
    selectedName: getActiveModelDisplay(provider),
    models,
    efforts: normalizedEfforts(reasoningCapabilities.efforts),
    defaultEffort: reasoningCapabilities.defaultEffort,
    selectedEffort: getDirectChatReasoningEffort(provider, selectedId),
  };
}

function currentCatalogIsEmpty() {
  return getChatBackend() === 'codex'
    ? getCachedAgentModelCatalog(getAgentHostAgent(), getAgentHostTarget()).length === 0
    : readDirectModels(getAIProvider()).length === 0;
}

/** @param {{cli: boolean, provider: string, target?: string}} snapshot */
function controlStateIsCurrent(snapshot) {
  if ((getChatBackend() === 'codex') !== snapshot.cli) return false;
  if (snapshot.cli) {
    return getAgentHostAgent() === snapshot.provider
      && getAgentHostTarget(snapshot.provider) === snapshot.target;
  }
  return getAIProvider() === snapshot.provider;
}

function effortOptions(state) {
  return [
    { value: '', label: state.defaultEffort ? `Default · ${titleCase(state.defaultEffort)}` : 'Default' },
    ...state.efforts.map(value => ({ value, label: titleCase(value) })),
  ];
}

function renderModelGroups(state) {
  if (!state.models.length) return '<div class="chat-model-empty">No model catalog is available yet.</div>';
  const groups = new Map();
  for (const model of state.models) {
    const group = model.group || '';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(model);
  }
  return [...groups.entries()].map(([group, models]) => `
    <section class="chat-model-option-group">
      ${group ? `<div class="chat-model-option-group-label">${escapeHTML(friendlyProviderGroup(group))}</div>` : ''}
      ${models.map(model => `<button type="button" class="chat-model-option" role="option" aria-selected="${model.id === state.selectedId}" data-chat-model-value="${escapeAttr(model.id)}" data-chat-model-search="${escapeAttr(model.search.toLowerCase())}">
        <span title="${escapeAttr(model.name)}">${escapeHTML(model.name)}</span>${model.id === state.selectedId ? '<span aria-hidden="true">✓</span>' : ''}
      </button>`).join('')}
    </section>`).join('');
}

function renderEffortSlider(state) {
  if (!state.efforts.length) {
    return '<div class="chat-model-effort-unavailable">This model does not expose a separate reasoning control.</div>';
  }
  const options = effortOptions(state);
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === state.selectedEffort));
  const progress = options.length > 1 ? selectedIndex / (options.length - 1) * 100 : 0;
  return `<div class="chat-model-effort">
    <div class="chat-model-effort-head"><span>Reasoning</span><strong id="chat-model-effort-value">${escapeHTML(options[selectedIndex].label)}</strong></div>
    <div class="chat-model-effort-control" style="--chat-effort-progress:${progress}%">
      <input type="range" id="chat-model-effort" min="0" max="${options.length - 1}" step="1" value="${selectedIndex}" aria-label="Reasoning effort" aria-valuetext="${escapeAttr(options[selectedIndex].label)}" data-chat-effort-values="${escapeAttr(JSON.stringify(options))}">
      <div class="chat-model-effort-dots" aria-hidden="true">${options.map(() => '<span></span>').join('')}</div>
    </div>
  </div>`;
}

export function refreshChatModelControls() {
  const label = document.getElementById('chat-model-menu-label');
  const popover = document.getElementById('chat-model-menu-popover');
  const toggle = document.getElementById('chat-model-menu-toggle');
  if (!label || !popover || !toggle) return;
  const state = currentControlState();
  const selectedEffort = effortOptions(state).find(option => option.value === state.selectedEffort)?.label || '';
  label.textContent = `${state.selectedName}${state.selectedEffort && selectedEffort ? ` · ${selectedEffort}` : ''}`;
  toggle.setAttribute('title', `${state.providerLabel} · ${label.textContent}`);
  toggle.setAttribute('aria-label', `Choose model and reasoning effort. Current: ${state.providerLabel}, ${label.textContent}`);
  const searchable = state.models.length > MODEL_SEARCH_THRESHOLD;
  popover.innerHTML = `<div class="chat-model-menu-head"><span>${escapeHTML(state.providerLabel)}</span><strong>${escapeHTML(state.selectedName)}</strong></div>
    ${renderEffortSlider(state)}
    ${searchable ? '<input type="search" class="chat-model-search" id="chat-model-search" placeholder="Search models" aria-label="Search models">' : ''}
    <div class="chat-model-options" id="chat-model-options" role="listbox" aria-label="Models">${renderModelGroups(state)}</div>
    <button type="button" class="chat-model-refresh" data-chat-model-refresh${modelRefreshInProgress ? ' disabled' : ''}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>${modelRefreshInProgress ? 'Refreshing…' : 'Refresh models'}
    </button>`;
}

function filterModelOptions(query) {
  const normalized = String(query || '').trim().toLowerCase();
  document.querySelectorAll('#chat-model-options [data-chat-model-search]').forEach(option => {
    option.toggleAttribute('hidden', normalized && !String(option.getAttribute('data-chat-model-search') || '').includes(normalized));
  });
  document.querySelectorAll('#chat-model-options .chat-model-option-group').forEach(group => {
    group.toggleAttribute('hidden', !group.querySelector('.chat-model-option:not([hidden])'));
  });
}

async function selectDirectModel(provider, model) {
  if (provider === 'ollama') setOllamaMainModel(model);
  else if (provider === 'ppq') setPpqModel(model);
  else if (provider === 'custom') setCustomApiModel(model);
  else {
    const controls = await import('./provider-model-controls.js');
    if (provider === 'venice') controls.onVeniceModelDropdownChange(model);
    else if (provider === 'openrouter') controls.onOpenRouterDropdownChange(model);
    else if (provider === 'routstr') controls.onRoutstrModelDropdownChange(model);
  }
}

async function selectModel(value) {
  const state = currentControlState();
  if (hasPendingAttachments()) {
    const supportsImages = state.cli
      ? resolveAgentModel(value, getCachedAgentModelCatalog(state.provider, state.target))?.inputModalities.includes('image') === true
      : supportsVision(state.provider, value);
    if (!supportsImages) {
      showNotification('Remove the attached photos before switching to a text-only model.', 'error', 6000);
      return;
    }
  }
  try {
    if (state.cli) {
      await connectDetectedAgent(state.provider);
      if (!controlStateIsCurrent(state)) return;
      const models = await listAgentModels({
        endpoint: getAgentHostEndpoint(), token: getAgentHostToken(), agent: state.provider,
        target: state.target, model: value || undefined,
      });
      if (!controlStateIsCurrent(state)) return;
      cacheAgentModelCatalog(models, state.provider, state.target);
      await saveAgentChatSettings({ model: value });
    } else {
      await selectDirectModel(state.provider, value);
      if (!controlStateIsCurrent(state)) return;
    }
    document.getElementById('chat-model-menu')?.removeAttribute('open');
    updateChatHeaderModelRuntime();
    refreshChatModelControls();
  } catch (error) {
    if (!controlStateIsCurrent(state)) return;
    showNotification(error instanceof Error ? error.message : 'Could not switch models.', 'error', 8000);
  }
}

async function refreshModels() {
  if (modelRefreshInProgress) return;
  modelRefreshInProgress = true;
  refreshChatModelControls();
  const state = currentControlState();
  try {
    if (state.cli) {
      await connectDetectedAgent(state.provider);
      if (!controlStateIsCurrent(state)) return;
      const models = await listAgentModels({
        endpoint: getAgentHostEndpoint(), token: getAgentHostToken(), agent: state.provider,
        target: state.target,
        refresh: true,
      });
      if (!controlStateIsCurrent(state)) return;
      cacheAgentModelCatalog(models, state.provider, state.target);
    } else if (state.provider === 'openrouter') await fetchOpenRouterModels(getOpenRouterKey());
    else if (state.provider === 'venice') await fetchVeniceModels(getVeniceKey());
    else if (state.provider === 'routstr') await fetchRoutstrModels();
    else if (state.provider === 'ppq') await fetchPpqModels();
    else if (state.provider === 'custom') await fetchCustomApiModels(getCustomApiUrl(), getCustomApiKey());
    else if (state.provider === 'ollama') {
      const config = getOllamaConfig();
      const result = await discoverLocalAI(config.url, config.apiKey, { force: true });
      cacheLocalAiModelDetails(result.modelDetails || [], result.provider === 'ollama');
    }
  } catch (error) {
    if (!controlStateIsCurrent(state)) return;
    showNotification(error instanceof Error ? error.message : 'Could not refresh models.', 'error', 8000);
  } finally {
    modelRefreshInProgress = false;
    refreshChatModelControls();
  }
}

function parseEffortOptions(input) {
  try {
    const parsed = JSON.parse(input.dataset.chatEffortValues || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function updateEffortSlider(input, persist = false) {
  const options = parseEffortOptions(input);
  const index = Math.max(0, Math.min(options.length - 1, Number(input.value) || 0));
  const selected = options[index] || { value: '', label: 'Default' };
  const control = input.closest('.chat-model-effort-control');
  const progress = options.length > 1 ? index / (options.length - 1) * 100 : 0;
  control?.style.setProperty('--chat-effort-progress', `${progress}%`);
  input.setAttribute('aria-valuetext', selected.label);
  const label = document.getElementById('chat-model-effort-value');
  if (label) label.textContent = selected.label;
  if (!persist) return;
  const state = currentControlState();
  if (state.cli) void saveAgentChatSettings({ effort: selected.value }).then(refreshChatModelControls);
  else setDirectChatReasoningEffort(state.provider, state.selectedId, selected.value);
}

export function initChatModelControls() {
  refreshChatModelControls();
  if (controlsInitialized) return;
  controlsInitialized = true;
  document.getElementById('chat-model-menu')?.addEventListener('toggle', event => {
    const menu = /** @type {HTMLDetailsElement} */ (event.currentTarget);
    if (!menu.open) return;
    refreshChatModelControls();
    if (currentCatalogIsEmpty()) void refreshModels();
  });
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    const menu = document.getElementById('chat-model-menu');
    if (menu?.hasAttribute('open') && target && !menu.contains(target)) menu.removeAttribute('open');
    const modelOption = target?.closest('[data-chat-model-value]');
    if (modelOption) {
      event.preventDefault();
      void selectModel(modelOption.getAttribute('data-chat-model-value') || '');
    }
    if (target?.closest('[data-chat-model-refresh]')) {
      event.preventDefault();
      void refreshModels();
    }
  });
  document.addEventListener('input', event => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.id === 'chat-model-search') filterModelOptions(target.value);
    if (target instanceof HTMLInputElement && target.id === 'chat-model-effort') updateEffortSlider(target);
  });
  document.addEventListener('change', event => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.id === 'chat-model-effort') updateEffortSlider(target, true);
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const menu = document.getElementById('chat-model-menu');
    if (!menu?.hasAttribute('open')) return;
    menu.removeAttribute('open');
    document.getElementById('chat-model-menu-toggle')?.focus();
  });
  globalThis.addEventListener('labcharts-ai-settings-local-changed', refreshChatModelControls);
  globalThis.addEventListener('getbased:agent-model-catalog-changed', refreshChatModelControls);
  globalThis.addEventListener('getbased:agent-host-settings-changed', refreshChatModelControls);
  globalThis.addEventListener('getbased:chat-backend-changed', refreshChatModelControls);
  globalThis.addEventListener('getbased:chat-model-selection-changed', refreshChatModelControls);
}
