
import { getActiveModelDisplay, hasAIProvider, isAIPaused } from './api.js';
import {
  connectDetectedCodex, discoverLocalChatAgents, getAgentHostAgent, getAgentHostModel, getAgentHostTarget, getChatBackend, hasAgentChatConnection, setChatBackend,
} from './agent-chat-settings.js';
import { getAgentModelDisplay, getCachedAgentModelCatalog } from './agent-model-catalog.js';
import type { DiscoveredAgent } from './agent-host-discovery.js';

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
  const fallback = ({ codex: 'Codex', claude: 'Claude Agent', opencode: 'OpenCode', hermes: 'Hermes', grok: 'Grok', openclaw: 'OpenClaw' } as Readonly<Record<string, string>>)[agent] || 'CLI agent';
  if (configuredModel) return getAgentModelDisplay(configuredModel, catalog);
  const defaultModel = catalog.find(model => model.isDefault) || catalog[0] || null;
  return defaultModel?.displayName || fallback;
}

export function refreshChatBackendControl() {
  if (isCodexChatBackend() && !hasAgentChatConnection()) void ensureSelectedCodexConnection();
}

let selectedCodexConnectionRequest: Promise<DiscoveredAgent> | null = null;

async function ensureSelectedCodexConnection() {
  if (!selectedCodexConnectionRequest) {
    selectedCodexConnectionRequest = connectDetectedCodex().finally(() => {
      selectedCodexConnectionRequest = null;
    });
  }
  try { await selectedCodexConnectionRequest; } catch { /* unavailable state is rendered by the caller */ }
}

/** Compatibility discovery entry; the shared model picker owns availability UI. */
export async function refreshLocalAgentAvailability(force = false) {
  await discoverLocalChatAgents({ refresh: force }).catch(() => []);
}

export function setChatBackendFromUI(value: unknown) {
  setChatBackend(value);
  refreshChatBackendControl();
}
