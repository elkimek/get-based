// Connection metadata and reviewed route commands. Private recipient identities
// stay in bounded, in-memory leases; only finite semantic IDs enter tools.
import { assistantConnectionId, assistantSelectionsEqual, parseAssistantConnectionPatch, type AssistantSelection, type AssistantConnectionPatch } from '../shared/agent-control-contract.js';
import { AGENT_TOOL_CONTRACT_VERSION } from '../shared/agent-tool-contract.js';
import { state } from './state.js';
import { assistantConnectionConfiguration, assistantConfigurationsEqual, AssistantSelectionConflict, readAssistantSelection } from './assistant-selection.js';
import { getConnectionModelChoices, readChatModelCatalogMetadata } from './chat-model-control-state.js';
import { getActiveModelId, getCustomApiUrl, getOllamaConfig, getVeniceE2EE, getCustomApiKey, getOpenRouterKey, getVeniceKey, getPpqKey, getRoutstrKey, getRoutstrNodeUrl, setAIProvider, setCustomApiModel, setOllamaMainModel, setPpqModel } from './api.js';
import { getAgentHostEndpoint, getAgentHostToken, getSavedAgentSelection, getAgentModelEffort, getAgentConnectionStorageKeys, saveAgentSelectionSettings, setChatBackend } from './agent-chat-settings.js';
import { checkAgentHost, listAgentExecutionTargets, listAgentModels } from './agent-chat-client.js';
import { getCachedAgentModelCatalog, normalizeAgentModelCatalog, cacheAgentModelCatalog, AGENT_MODEL_CATALOG_KEY, AGENT_MODEL_CATALOG_AGENT_KEY, AGENT_MODEL_CATALOG_TARGET_KEY, type AgentModel } from './agent-model-catalog.js';
import { getDirectChatReasoningEffort, setDirectChatReasoningEffort, getDirectChatReasoningPreferenceKey } from './chat-model-preferences.js';
import { isAgentAllowedForDeployment } from './agent-host-discovery.js';
import { hasPendingAttachments } from './chat-images.js';
import { isChatRuntimeStreaming, refreshChatWebSearchToggleRuntime, updateChatHeaderModelRuntime } from './chat-runtime.js';
import { runNativeCommandWithLocks } from './native-command-locks.js';
import { getAppExtensionAIConnectionState } from './app-extension-runtime.js';
import { agentChatRequiredCapabilities, agentHostSupportsCapabilities } from '../shared/agent-host-protocol.js';
import { captureManagedConnection, type ManagedConnectionBinding } from './app-extension-connection-control.js';
export { readAssistantSelection } from './assistant-selection.js';

const directProviders = ['ollama', 'venice', 'openrouter', 'routstr', 'ppq', 'custom'] as const;
const agents = ['codex', 'claude', 'opencode', 'hermes', 'grok', 'openclaw'] as const;
const labels: Record<string, string> = { ollama: 'Local AI', venice: 'Venice', openrouter: 'OpenRouter', routstr: 'Routstr', ppq: 'PPQ', custom: 'Custom API', codex: 'Codex CLI', claude: 'Claude Agent', opencode: 'OpenCode', hermes: 'Hermes Agent', grok: 'Grok Build', openclaw: 'OpenClaw' };
const conflict = (message: string): never => { throw new AssistantSelectionConflict(message); };
const same = assistantConfigurationsEqual;
function parseConnection(id: string): Pick<AssistantSelection, 'backend' | 'provider' | 'target'> {
  if (!parseAssistantConnectionPatch({ connectionId: id, model: '' })) return conflict('Choose an exact connection ID from assistant.connections.');
  const [backend, provider, target = ''] = id.split(':');
  return { backend: backend as 'direct' | 'cli', provider: provider!, target };
}
function directConfigured(provider: string) {
  if (getAppExtensionAIConnectionState(provider).configured) return true;
  if (provider === 'ollama') return !!getOllamaConfig().url && getConnectionModelChoices({ backend: 'direct', provider, target: '' }).length > 0;
  if (provider === 'custom') return !!getCustomApiKey() && !!getCustomApiUrl();
  if (provider === 'venice') return !!getVeniceKey();
  if (provider === 'openrouter') return !!getOpenRouterKey();
  if (provider === 'routstr') return !!getRoutstrKey() && !!getRoutstrNodeUrl();
  return provider === 'ppq' && !!getPpqKey();
}
function savedSelection(connection: Pick<AssistantSelection, 'backend' | 'provider' | 'target'>): AssistantSelection {
  if (connection.backend === 'cli') return { ...connection, ...getSavedAgentSelection(connection.provider, connection.target) };
  const model = String(getActiveModelId(connection.provider) ?? '');
  return { ...connection, model, effort: getDirectChatReasoningEffort(connection.provider, model) };
}
const metadataSignal = (signal?: AbortSignal) => signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000);
const pairedHost = (signal?: AbortSignal) => ({ endpoint: getAgentHostEndpoint(), token: getAgentHostToken(), signal: metadataSignal(signal) });
const nativePath = 'getbased_navigate(view: aiSettings) opens Settings → AI connection; credentials, model refresh and sign-in remain native';

/** Only the paired host is queried. No discovery credentials are adopted here. */
export async function readAssistantConnections(signal?: AbortSignal) {
  const current = readAssistantSelection(), host = pairedHost(signal);
  const connections = directProviders.map(provider => {
    const selection = savedSelection({ backend: 'direct', provider, target: '' }), configured = directConfigured(provider), managed = getAppExtensionAIConnectionState(provider).managed;
    return { id: assistantConnectionId(selection), label: labels[provider]!, configured, selected: assistantConnectionId(selection) === assistantConnectionId(current), availability: managed ? configured && typeof getAppExtensionAIConnectionState(provider).owner.ai?.captureConnectionControls === 'function' ? 'configured edition; native review validation required' : 'edition-managed; use native connection controls' : configured ? 'configured; live availability unverified' : 'native setup required', nativePath };
  });
  let companion = host.token ? 'unreachable or unavailable' : 'not paired';
  if (host.token) {
    const results = await Promise.allSettled(agents.map(async provider => {
      if (!isAgentAllowedForDeployment(provider)) return [];
      const targets = await listAgentExecutionTargets({ ...host, agent: provider });
      return targets.slice(0, 20).filter(target => typeof target.id === 'string' && /^[a-z0-9-]{1,80}$/.test(target.id)).map(target => ({
        id: `cli:${provider}:${target.id}`, label: `${labels[provider]} · ${target.id}`, configured: true,
        selected: current.backend === 'cli' && current.provider === provider && current.target === target.id,
        availability: target.status === 'unavailable' ? 'unavailable' : 'target listed; read models to check readiness', nativePath,
      }));
    }));
    for (const result of results) if (result.status === 'fulfilled') { companion = 'paired host responded'; connections.push(...result.value); }
  }
  signal?.throwIfAborted();
  return { current, connections, companion, credentialsDisclosed: false, nativePath };
}
async function readConnection(id: string, signal?: AbortSignal) {
  const connection = parseConnection(id), selection = savedSelection(connection);
  let agentModels: AgentModel[] | undefined;
  let capabilities: string[] = [];
  if (connection.backend === 'direct') {
    if (!directConfigured(connection.provider)) conflict('Configure that connection in Settings → AI connection first. No selection was changed.');
  } else {
    const host = pairedHost(signal);
    if (!host.token || !isAgentAllowedForDeployment(connection.provider)) conflict('This CLI connection needs native setup or is unavailable on this deployment.');
    try {
      const status = await checkAgentHost(host);
      capabilities = status.capabilities;
      if (status.paused === true || status.state === 'paused') conflict('The Companion is paused. Resume it in native AI settings.');
      if (connection.target === 'local' && Number(status.toolContractVersion) < AGENT_TOOL_CONTRACT_VERSION) conflict('Update the paired Companion in native AI settings before switching to it.');
      if (!agentHostSupportsCapabilities(status, agentChatRequiredCapabilities(connection.target === 'local', hasPendingAttachments()))) conflict('The paired Companion does not support this chat route or its attached photos. Update it in native AI settings.');
      const targets = await listAgentExecutionTargets({ ...host, agent: connection.provider });
      if (!targets.some(target => target.id === connection.target && target.status !== 'unavailable')) conflict('That exact CLI target is unavailable. Check native AI settings.');
      agentModels = normalizeAgentModelCatalog(await listAgentModels({ ...host, agent: connection.provider, target: connection.target }));
    } catch (cause) {
      if (signal?.aborted) throw signal.reason;
      if (cause instanceof AssistantSelectionConflict) throw cause;
      conflict('That CLI target could not be verified. Check its connection and sign-in in native AI settings.');
    }
  }
  return { selection, agentModels, capabilities };
}
export async function readConnectionModelCatalog(connectionId: string, options: { query?: string; offset?: number; limit?: number } = {}, signal?: AbortSignal) {
  const { selection, agentModels } = await readConnection(connectionId, signal);
  return { ...readChatModelCatalogMetadata(options, selection, agentModels), connectionId, liveAvailabilityVerified: selection.backend === 'cli', source: selection.backend === 'cli' ? 'paired Companion metadata read; no conversation content sent' : 'saved native model picker catalog' };
}
interface Lease {
  before: AssistantSelection; destination: AssistantSelection; beforeConfiguration: unknown[]; destinationConfiguration: unknown[];
  profile: string; thread: string | null; models?: AgentModel[] | undefined; beforeModels?: AgentModel[] | undefined;
  beforeManaged: ManagedConnectionBinding; destinationManaged: ManagedConnectionBinding;
}
const leases = new Map<string, Lease>();
function putLease(lease: Lease) {
  const leaseId = crypto.randomUUID(); if (leases.size >= 200) leases.delete(leases.keys().next().value!); leases.set(leaseId, lease); return leaseId;
}
function assertLease(lease: Lease | undefined, canCommit?: () => boolean): asserts lease is Lease {
  if (!lease || canCommit?.() === false || lease.profile !== state.currentProfile || lease.thread !== state.currentThreadId
    || !assistantSelectionsEqual(lease.before, readAssistantSelection()) || !same(lease.beforeConfiguration, assistantConnectionConfiguration(lease.before))
    || !same(lease.destinationConfiguration, assistantConnectionConfiguration(lease.destination))
    || lease.beforeManaged && !lease.beforeManaged.current() || lease.destinationManaged && !lease.destinationManaged.current()) conflict('The connection review expired or a recipient changed. Read it again for a fresh review.');
}
export async function captureAssistantConnection(connectionId: string, signal?: AbortSignal) {
  const before = readAssistantSelection(), profile = state.currentProfile, thread = state.currentThreadId;
  const destination = savedSelection(parseConnection(connectionId));
  const beforeManaged = before.backend === 'direct' ? captureManagedConnection(before.provider) : null;
  const destinationManaged = destination.backend === 'direct' ? before.backend === 'direct' && before.provider === destination.provider ? beforeManaged : captureManagedConnection(destination.provider) : null;
  const lease: Lease = { before, destination, beforeConfiguration: assistantConnectionConfiguration(before), destinationConfiguration: assistantConnectionConfiguration(destination), profile, thread, beforeManaged, destinationManaged };
  const read = await readConnection(connectionId, signal); assertLease(lease);
  lease.models = read.agentModels;
  lease.beforeModels = before.backend === 'cli' ? getCachedAgentModelCatalog(before.provider, before.target) : undefined;
  return { leaseId: putLease(lease), selection: before, destination: read.selection,
    catalog: { ...readChatModelCatalogMetadata({}, read.selection, read.agentModels), connectionId, liveAvailabilityVerified: destination.backend === 'cli' } };
}
export function previewAssistantConnection(leaseId: string, parameters: AssistantConnectionPatch): AssistantSelection {
  const patch = parseAssistantConnectionPatch(parameters), lease = leases.get(leaseId); assertLease(lease);
  if (!patch || patch.connectionId !== assistantConnectionId(lease.destination)) return conflict('Read that exact connection in this turn before proposing it.');
  const choices = getConnectionModelChoices(lease.destination, lease.models), choice = choices.find(model => model.id === patch.model);
  if (!choice || !choice.inputModalities.includes('text')) return conflict('Choose an exact advertised model with text input support. Refresh models in native AI settings if needed.');
  if (hasPendingAttachments() && !choice.inputModalities.includes('image')) return conflict('This connection model does not have confirmed image support for the attached photos.');
  const effort = patch.effort ?? (patch.model === lease.destination.model ? lease.destination.effort : lease.destination.backend === 'cli' ? getAgentModelEffort(patch.model, lease.destination.provider, lease.destination.target) : getDirectChatReasoningEffort(lease.destination.provider, patch.model));
  if (effort && !choice.reasoningChoices.includes(effort)) return conflict('Choose a supported reasoning effort or use the default.');
  return { ...lease.destination, model: patch.model, effort };
}
function repaint() {
  try { globalThis.dispatchEvent?.(new CustomEvent('getbased:chat-model-selection-changed')); updateChatHeaderModelRuntime(); refreshChatWebSearchToggleRuntime(); } catch { /* Persisted settings own the result. */ }
}
/** Only a native human action calls this command. No health data is probed. */
export async function commitAssistantConnection(leaseId: string, patch: AssistantConnectionPatch, options: { canCommit?: () => boolean; requireLocks?: boolean; signal?: AbortSignal } = {}) {
  const lease = leases.get(leaseId); assertLease(lease, options.canCommit);
  const after = previewAssistantConnection(leaseId, patch);
  if (isChatRuntimeStreaming()) return conflict('Finish the current reply before changing its connection.');
  // Do not change the selected recipient in order to obtain its consent.
  const approval = await import('./cloud-ai-consent.js'); assertLease(lease, options.canCommit);
  const accepted = await approval.requestAIProcessingApproval(after.backend === 'cli' ? after.target === 'local' ? 'codex-agent' : 'personal-agent-gateway' : after.provider,
    { kind: 'connection-selection', modelId: after.model, agentId: after.backend === 'cli' ? after.provider : undefined });
  assertLease(lease, options.canCommit);
  if (!accepted) return conflict('Destination activation was not approved. Nothing was changed.');
  // Recheck reachability/catalog after any native approval wait, before the lock.
  const refreshed = await readConnection(patch.connectionId); assertLease(lease, options.canCommit);
  const readinessCurrent = () => { try { assertLease(lease, options.canCommit); return !isChatRuntimeStreaming(); } catch { return false; } };
  const ready = after.backend === 'direct' ? lease.destinationManaged
    ? await lease.destinationManaged.check(after.model, { ...options, isCurrent: readinessCurrent })
    : await (await import('./assistant-connection-readiness.js')).checkDirectAssistantConnection(after, { ...options, isCurrent: readinessCurrent }) : null;
  assertLease(lease, options.canCommit);
  const controls = await import('./provider-model-controls.js'); assertLease(lease, options.canCommit);
  const write = async () => {
    assertLease(lease, options.canCommit);
    if (isChatRuntimeStreaming()) return conflict('Finish the current reply before changing its connection.');
    if (after.backend === 'cli' && !agentHostSupportsCapabilities({ capabilities: refreshed.capabilities }, agentChatRequiredCapabilities(after.target === 'local', hasPendingAttachments()))) return conflict('The Companion cannot support the current chat attachments. Check native AI settings before switching.');
    if (ready && Date.now() - ready.checkedAt > 15_000) return conflict('The connection check expired while waiting. Request a fresh review.');
    lease.models = refreshed.agentModels;
    if (!assistantSelectionsEqual(previewAssistantConnection(leaseId, { ...patch, effort: after.effort }), after)) return conflict('The proposed connection effects changed. Request a fresh review.');
    const keys = ['labcharts-chat-backend', 'labcharts-ai-provider',
      ...(after.backend === 'cli' ? [...getAgentConnectionStorageKeys(after.provider, after.target, after.model), AGENT_MODEL_CATALOG_KEY, AGENT_MODEL_CATALOG_AGENT_KEY, AGENT_MODEL_CATALOG_TARGET_KEY] : [
        `labcharts-${after.provider}-model`, getDirectChatReasoningPreferenceKey(after.provider, after.model),
        ...(after.provider === 'venice' ? [getVeniceE2EE() ? 'labcharts-venice-model-e2ee' : 'labcharts-venice-model-regular'] : []),
        ...(after.provider === 'routstr' ? [after.model.startsWith('tinfoil-') ? 'labcharts-routstr-model-private' : 'labcharts-routstr-model-regular'] : []),
      ])];
    const saved = new Map(keys.map(key => [key, localStorage.getItem(key)]));
    try {
      if (after.backend === 'cli') {
        saveAgentSelectionSettings({ agent: after.provider, target: after.target, model: after.model, effort: after.effort });
        cacheAgentModelCatalog(lease.models, after.provider, after.target); setChatBackend('codex');
      } else {
        if (after.provider === 'ollama') setOllamaMainModel(after.model);
        else if (after.provider === 'custom') setCustomApiModel(after.model);
        else if (after.provider === 'ppq') setPpqModel(after.model);
        else if (after.provider === 'venice') controls.onVeniceModelDropdownChange(after.model);
        else if (after.provider === 'openrouter') controls.onOpenRouterDropdownChange(after.model);
        else if (after.provider === 'routstr') controls.onRoutstrModelDropdownChange(after.model);
        setDirectChatReasoningEffort(after.provider, after.model, after.effort); setAIProvider(after.provider); setChatBackend('direct');
      }
    } catch (cause) {
      try { for (const [key, value] of saved) { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } }
      catch { repaint(); throw new Error('The connection selection could not be fully confirmed. Check native AI settings before trying again.', { cause }); }
      repaint();
      throw Object.assign(new Error('The connection selection could not be saved. Nothing was changed.', { cause }), { noChangeApplied: true });
    }
    if (!assistantSelectionsEqual(readAssistantSelection(), after)) throw new Error('The selected connection outcome could not be confirmed. Check native AI settings.');
    if (lease.beforeManaged && !lease.beforeManaged.current() || lease.destinationManaged && !lease.destinationManaged.current()) throw new Error('An edition recipient changed during publication. Check native AI settings before changing this selection again.');
    const reverse: Lease = { before: after, destination: lease.before, beforeConfiguration: assistantConnectionConfiguration(after), destinationConfiguration: lease.beforeConfiguration,
      profile: lease.profile, thread: lease.thread, models: lease.beforeModels, beforeModels: lease.models,
      beforeManaged: lease.destinationManaged, destinationManaged: lease.beforeManaged };
    const nextLeaseId = putLease(reverse); repaint();
    return { before: lease.before, after, leaseId: nextLeaseId, changed: !assistantSelectionsEqual(lease.before, after) };
  };
  if (!navigator.locks?.request) { if (options.requireLocks) return conflict('Safe automated connection switching requires Web Locks. Use native AI settings in this browser.'); return write(); }
  return runNativeCommandWithLocks(navigator.locks, ['getbased-assistant-selection'], write);
}
