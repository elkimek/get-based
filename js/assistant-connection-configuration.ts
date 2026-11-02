// Configuration identities stay in native memory and never enter prompts or saved receipts.
import { getAgentHostEndpoint, getAgentHostToken } from './agent-chat-settings.js';
import { getCustomApiKey, getCustomApiUrl, getOllamaConfig, getOpenRouterKey, getPpqKey, getPpqPrivateMode,
  getRoutstrKey, getRoutstrNodeUrl, getVeniceKey, getVeniceE2EE, isRoutstrPrivateModeActive } from './api.js';
import { getAppExtensionAIConnectionState } from './app-extension-runtime.js';
import type { AssistantSelection } from '../shared/agent-control-contract.js';
export function captureAssistantConnectionConfiguration(selection: AssistantSelection): unknown[] {
  const current = { provider: selection.provider };
  if (selection.backend === 'cli') return [getAgentHostEndpoint(), getAgentHostToken()];
  const extension = getAppExtensionAIConnectionState(selection.provider), policy = extension.policy;
  const edition = [extension.owner, extension.managed, extension.configured, policy?.enforced, policy?.zdrOnly,
    policy?.enforced ? JSON.stringify(Array.isArray(policy.allowlist) ? policy.allowlist.filter(value => typeof value === 'string').slice().sort() : null) : null];
  if (extension.managed) return edition;
  if (current.provider === 'ollama') { const value = getOllamaConfig(); return [...edition, value.url, value.apiKey, value.mode]; }
  if (current.provider === 'custom') return [...edition, getCustomApiUrl(), getCustomApiKey()];
  if (current.provider === 'openrouter') return [...edition, getOpenRouterKey()];
  if (current.provider === 'venice') return [...edition, getVeniceKey(), getVeniceE2EE()];
  if (current.provider === 'routstr') return [...edition, getRoutstrNodeUrl(), getRoutstrKey(), isRoutstrPrivateModeActive()];
  if (current.provider === 'ppq') return [...edition, getPpqKey(), getPpqPrivateMode()];
  return [];
}
export const assistantConfigurationsEqual = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
