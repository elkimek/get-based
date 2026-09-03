// @ts-check
// Capability-aware resolution for the assistant and CLI-backed feature routes.

import { getAgentHostModel, getAgentHostToken, getChatBackend } from './agent-chat-settings.js';
import {
  agentModelSupports, getAgentModelDisplay, getCachedAgentModelCatalog, resolveAgentModel,
} from './agent-model-catalog.js';

export function getAssistantExecutionRoute() {
  if (getChatBackend() !== 'codex') return { adapter: 'direct' };
  const configuredModel = getAgentHostModel();
  const modelEntry = resolveAgentModel(configuredModel);
  const model = configuredModel || modelEntry?.id || '';
  return {
    adapter: 'codex',
    provider: 'codex',
    providerDisplay: 'Codex CLI',
    model,
    modelDisplay: getAgentModelDisplay(model),
    available: Boolean(getAgentHostToken()),
    inputModalities: modelEntry?.inputModalities || [],
  };
}

/** @param {string} modelId @param {string} modality */
export function getCodexExecutionRoute(modelId = '', modality = 'text') {
  const entry = resolveAgentModel(modelId);
  const model = modelId || entry?.id || '';
  return {
    adapter: 'codex',
    provider: 'codex',
    providerDisplay: 'Codex CLI',
    model,
    modelDisplay: getAgentModelDisplay(model),
    local: true,
    available: Boolean(getAgentHostToken()) && !!entry && agentModelSupports(model, modality),
    inputModalities: entry?.inputModalities || [],
  };
}

/** @param {string} modality */
export function listCodexExecutionRoutes(modality = 'text') {
  return getCachedAgentModelCatalog().filter(model => model.inputModalities.includes(modality)).map(model => ({
    adapter: 'codex',
    provider: 'codex',
    providerDisplay: 'Codex CLI',
    model: model.id,
    modelDisplay: model.displayName,
    local: true,
    available: Boolean(getAgentHostToken()),
    inputModalities: model.inputModalities,
  }));
}
