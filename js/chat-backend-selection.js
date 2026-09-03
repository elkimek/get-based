// @ts-check

import { getActiveModelDisplay, hasAIProvider, isAIPaused } from './api.js';
import {
  connectDetectedCodex, discoverLocalChatAgents, getAgentHostModel, getChatBackend, hasAgentChatConnection, setChatBackend,
} from './agent-chat-settings.js';
import { state } from './state.js';

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
  const thread = state.chatThreads.find(item => item.id === state.currentThreadId);
  return getAgentHostModel() || thread?.agentModel || 'Codex';
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
  const codex = agents.find(agent => agent.id === 'codex' && agent.compatible);
  option.disabled = !codex;
  option.textContent = codex ? 'Codex' : 'Codex · not found';
  dot.className = `chat-agent-status-dot ${codex?.status === 'available' ? 'is-ready' : codex ? 'is-starting' : 'is-unavailable'}`;
  dot.title = codex?.status === 'available'
    ? 'Codex is ready'
    : codex ? 'Codex is starting' : 'Codex CLI was not found';
}

/** @param {unknown} value */
export function setChatBackendFromUI(value) {
  setChatBackend(value);
  refreshChatBackendControl();
}
