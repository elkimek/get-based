// @ts-check

import { getActiveModelDisplay, hasAIProvider, isAIPaused } from './api.js';
import {
  connectDetectedCodex, discoverLocalChatAgents, getAgentHostAgent, getAgentHostModel, getAgentHostTarget, getChatBackend, hasAgentChatConnection, setChatBackend,
} from './agent-chat-settings.js';
import { getAgentModelDisplay, getCachedAgentModelCatalog } from './agent-model-catalog.js';

export { getChatBackend } from './agent-chat-settings.js';

export function isCodexChatBackend() {
  return getChatBackend() === 'codex';
}

export function hasChatResponseBackend() {
  if (isAIPaused()) return false;
  if (isCodexChatBackend()) return hasAgentChatConnection();
  return hasAIProvider();
}

export function getChatBackendDisplay() {
  if (!isCodexChatBackend()) return hasAIProvider() ? getActiveModelDisplay() : '';
  const agent = getAgentHostAgent();
  const catalog = getCachedAgentModelCatalog(agent, getAgentHostTarget(agent));
  const configuredModel = getAgentHostModel();
  const fallback = ({ codex: 'Codex', claude: 'Claude Code', opencode: 'OpenCode', hermes: 'Hermes', grok: 'Grok', openclaw: 'OpenClaw' })[agent] || 'CLI agent';
  if (configuredModel) return getAgentModelDisplay(configuredModel, catalog);
  const defaultModel = catalog.find(model => model.isDefault) || catalog[0] || null;
  return defaultModel?.displayName || fallback;
}

export function refreshChatBackendControl() {
  const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('chat-backend-select'));
  if (select) select.value = getChatBackend();
  void refreshLocalAgentAvailability();
  if (isCodexChatBackend() && !hasAgentChatConnection()) void ensureSelectedCodexConnection();
}

let localAgentAvailabilityRequest = null;
let selectedCodexConnectionRequest = null;

async function ensureSelectedCodexConnection() {
  if (!selectedCodexConnectionRequest) {
    selectedCodexConnectionRequest = connectDetectedCodex().finally(() => {
      selectedCodexConnectionRequest = null;
    });
  }
  try { await selectedCodexConnectionRequest; } catch { /* unavailable state is rendered by the caller */ }
}

/** @param {boolean} [force] */
export async function refreshLocalAgentAvailability(force = false) {
  const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('chat-backend-select'));
  const option = /** @type {HTMLOptionElement | null} */ (select?.querySelector('option[value="codex"]') || null);
  const dot = document.getElementById('chat-agent-status-dot');
  if (!select || !option || !dot) return;
  if (!localAgentAvailabilityRequest || force) {
    localAgentAvailabilityRequest = discoverLocalChatAgents({ refresh: force }).catch(() => []);
  }
  dot.className = 'chat-agent-status-dot is-checking';
  const agents = await localAgentAvailabilityRequest;
  const selected = agents.find(agent => agent.id === getAgentHostAgent() && agent.compatible);
  const ready = selected?.status === 'available';
  option.disabled = !ready;
  option.textContent = selected ? `${selected.name}${ready ? '' : ' · unavailable'}` : 'CLI agent · not found';
  dot.className = `chat-agent-status-dot ${ready ? 'is-ready' : selected ? 'is-starting' : 'is-unavailable'}`;
  dot.title = ready ? `${selected.name} is ready` : selected?.message || 'The selected CLI agent is unavailable';
}

/** @param {unknown} value */
export function setChatBackendFromUI(value) {
  setChatBackend(value);
  refreshChatBackendControl();
}
