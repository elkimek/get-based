// @ts-check
// Capability-aware resolution for the assistant and CLI-backed feature routes.

import { getAgentHostAgent, getAgentHostModel, getAgentHostTarget, getAgentHostToken, getChatBackend } from './agent-chat-settings.js';
import {
  agentModelSupports, getAgentModelDisplay, getCachedAgentModelCatalog, resolveAgentModel,
} from './agent-model-catalog.js';

const CLI_PROVIDER_NAMES = Object.freeze({
  codex: 'Codex CLI', claude: 'Claude Agent', opencode: 'OpenCode',
  hermes: 'Hermes Agent', grok: 'Grok Build', openclaw: 'OpenClaw',
});

export function getAssistantExecutionRoute() {
  if (getChatBackend() !== 'codex') return { adapter: 'direct' };
  const agent = getAgentHostAgent();
  const target = getAgentHostTarget(agent);
  const catalog = getCachedAgentModelCatalog(agent, target);
  const configuredModel = getAgentHostModel();
  const modelEntry = resolveAgentModel(configuredModel, catalog);
  const model = configuredModel || modelEntry?.id || '';
  const providerDisplay = CLI_PROVIDER_NAMES[agent] || 'CLI agent';
  return {
    adapter: 'codex',
    provider: agent,
    target,
    providerDisplay,
    model,
    modelDisplay: getAgentModelDisplay(model, catalog),
    available: Boolean(getAgentHostToken()),
    inputModalities: modelEntry?.inputModalities || [],
  };
}

/** @param {string} modelId @param {string} modality */
export function getCodexExecutionRoute(modelId = '', modality = 'text') {
  const agent = getAgentHostAgent();
  const target = getAgentHostTarget(agent);
  const catalog = getCachedAgentModelCatalog(agent, target);
  const providerDisplay = CLI_PROVIDER_NAMES[agent] || 'CLI agent';
  const entry = resolveAgentModel(modelId, catalog);
  const model = modelId || entry?.id || '';
  return {
    adapter: 'codex',
    provider: agent,
    target,
    providerDisplay,
    model,
    modelDisplay: getAgentModelDisplay(model, catalog),
    local: true,
    available: Boolean(getAgentHostToken()) && !!entry && agentModelSupports(model, modality, catalog),
    inputModalities: entry?.inputModalities || [],
  };
}

/** @param {string} modality */
export function listCodexExecutionRoutes(modality = 'text') {
  const agent = getAgentHostAgent();
  const target = getAgentHostTarget(agent);
  const providerDisplay = CLI_PROVIDER_NAMES[agent] || 'CLI agent';
  return getCachedAgentModelCatalog(agent, target).filter(model => model.inputModalities.includes(modality)).map(model => ({
    adapter: 'codex',
    provider: agent,
    target,
    providerDisplay,
    model: model.id,
    modelDisplay: model.displayName,
    local: true,
    available: Boolean(getAgentHostToken()),
    inputModalities: model.inputModalities,
  }));
}
