// @ts-check
// Capability-aware resolution for the assistant and CLI-backed feature routes.

import { getAgentHostAgent, getAgentHostModel, getAgentHostToken, getChatBackend } from './agent-chat-settings.js';
import {
  agentModelSupports, getAgentModelDisplay, getCachedAgentModelCatalog, resolveAgentModel,
} from './agent-model-catalog.js';

export function getAssistantExecutionRoute() {
  if (getChatBackend() !== 'codex') return { adapter: 'direct' };
  const agent = getAgentHostAgent();
  const catalog = getCachedAgentModelCatalog(agent);
  const configuredModel = getAgentHostModel();
  const modelEntry = resolveAgentModel(configuredModel, catalog);
  const model = configuredModel || modelEntry?.id || '';
  const providerDisplay = ({ codex: 'Codex CLI', claude: 'Claude Code', opencode: 'OpenCode', hermes: 'Hermes Agent', grok: 'Grok Build', openclaw: 'OpenClaw' })[agent] || 'CLI agent';
  return {
    adapter: 'codex',
    provider: agent,
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
  const catalog = getCachedAgentModelCatalog(agent);
  const providerDisplay = ({ codex: 'Codex CLI', claude: 'Claude Code', opencode: 'OpenCode', hermes: 'Hermes Agent', grok: 'Grok Build', openclaw: 'OpenClaw' })[agent] || 'CLI agent';
  const entry = resolveAgentModel(modelId, catalog);
  const model = modelId || entry?.id || '';
  return {
    adapter: 'codex',
    provider: agent,
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
  const providerDisplay = ({ codex: 'Codex CLI', claude: 'Claude Code', opencode: 'OpenCode', hermes: 'Hermes Agent', grok: 'Grok Build', openclaw: 'OpenClaw' })[agent] || 'CLI agent';
  return getCachedAgentModelCatalog(agent).filter(model => model.inputModalities.includes(modality)).map(model => ({
    adapter: 'codex',
    provider: agent,
    providerDisplay,
    model: model.id,
    modelDisplay: model.displayName,
    local: true,
    available: Boolean(getAgentHostToken()),
    inputModalities: model.inputModalities,
  }));
}
