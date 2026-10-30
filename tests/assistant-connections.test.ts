// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const control = vi.hoisted(() => ({ accepted: true, paused: false, available: true, version: 37, missingCapability: '', failModels: false, metadataStatus: 200, metadataMissing: false, attempts: [] as unknown[] }));
vi.mock('../js/cloud-ai-consent.js', () => ({ requestAIProcessingApproval: vi.fn(async (...args: unknown[]) => { control.attempts.push(args); return control.accepted; }) }));
vi.mock('../js/chat-images.js', () => ({ hasPendingAttachments: vi.fn(() => false) }));
vi.mock('../js/chat-runtime.js', async original => ({ ...await original<typeof import('../js/chat-runtime.js')>(), updateChatHeaderModelRuntime: vi.fn(), refreshChatWebSearchToggleRuntime: vi.fn() }));
import { captureAssistantConnection, commitAssistantConnection, previewAssistantConnection, readAssistantConnections, readConnectionModelCatalog } from '../js/assistant-connections.js';
import { readAssistantSelection } from '../js/assistant-selection.js';
import { state } from '../js/state.js';
import { configureApiProviderStorageRuntimeDeps } from '../js/api-provider-storage-runtime.js';
import { saveCustomApiConnection, saveVeniceKey, setAIProvider, setCustomApiModel, setVeniceE2EE, setVeniceModel, setPpqPrivateMode, setPpqModel, setRoutstrModel, getVeniceE2EE, getPpqPrivateMode, isRoutstrPrivateModeActive } from '../js/api.js';
import { updateKeyCache } from '../js/crypto-key-cache.js';
import { setChatBackend, saveAgentChatSettings, getSavedAgentSelection } from '../js/agent-chat-settings.js';
import { getCachedAgentModelCatalog, cacheAgentModelCatalog } from '../js/agent-model-catalog.js';
import { hasPendingAttachments } from '../js/chat-images.js';
import { cacheLocalAiModelDetails, clearCachedLocalAiModelDetails } from '../js/provider-local-ai-runtime.js';
import { AGENT_TOOL_CONTRACT_VERSION } from '../shared/agent-tool-contract.js';
import { configureAppExtension } from '../js/app-extension-runtime.js';
import { AGENT_HOST_CAPABILITY_LIST } from '../shared/agent-host-protocol.js';
const original = { profile: state.currentProfile, thread: state.currentThreadId, data: state.importedData, history: state.chatHistory };
const lockDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
const patch = { connectionId: 'direct:venice', model: 'venice-target', effort: 'high' };
function installLocks() {
  const queues = new Map<string, Promise<unknown>>();
  const request = vi.fn((name: string, _options: unknown, run: () => unknown) => { const next = (queues.get(name) || Promise.resolve()).then(run); queues.set(name, next.catch(() => {})); return next; });
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } }); return request;
}
beforeEach(async () => {
  vi.clearAllMocks(); localStorage.clear(); configureAppExtension(null); clearCachedLocalAiModelDetails(); installLocks();
  Object.assign(control, { accepted: true, paused: false, available: true, missingCapability: '', failModels: false, metadataStatus: 200, metadataMissing: false, version: AGENT_TOOL_CONTRACT_VERSION, attempts: [] });
  state.currentProfile = 'connection-fixture'; state.currentThreadId = 'connection-thread'; state.chatHistory = [{ role: 'assistant', content: 'Retain prior reply', provider: 'custom', modelId: 'model-a' }];
  state.importedData = structuredClone(original.data); state.importedData.contextNotes = 'PRIVATE_HEALTH_NOTE';
  for (const key of ['labcharts-openrouter-key', 'labcharts-ppq-key', 'labcharts-routstr-key', 'labcharts-routstr-sessions', 'labcharts-ollama']) updateKeyCache(key, '');
  configureApiProviderStorageRuntimeDeps({ encryptedSetItem: async () => {} });
  await saveCustomApiConnection('https://PRIVATE_ENDPOINT.invalid/v1', 'PRIVATE_CUSTOM_KEY'); await saveVeniceKey('PRIVATE_VENICE_KEY');
  setAIProvider('custom'); setChatBackend('direct'); setCustomApiModel('model-a'); setVeniceE2EE(false); setVeniceModel('venice-target');
  localStorage.setItem('labcharts-custom-models', JSON.stringify([{ id: 'model-a', name: 'Source', reasoning: { supported_efforts: ['low', 'high'] }, credential: 'PRIVATE_CATALOG_KEY' }]));
  localStorage.setItem('labcharts-venice-models', JSON.stringify([{ id: 'venice-target', name: 'Venice Target', reasoning: { supported_efforts: ['low', 'high'] }, credential: 'PRIVATE_CATALOG_KEY' }]));
  updateKeyCache('labcharts-agent-host-token', 'PRIVATE_PAIRED_TOKEN');
  vi.mocked(hasPendingAttachments).mockReturnValue(false);
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = new URL(String(input));
    if (url.hostname !== '127.0.0.1' || url.port === '11434') return Response.json({ data: control.metadataMissing ? [] : ['model-a', 'venice-target', 'provider-target', 'e2ee-private-target', 'private/ppq-target', 'tinfoil-private-target'].map(id => ({ id })), models: [{ name: 'provider-target' }] }, { status: control.metadataStatus });
    if (url.pathname === '/v1/status') return Response.json({ service: 'getbased-agent-host', toolContractVersion: control.version, capabilities: AGENT_HOST_CAPABILITY_LIST.filter(value => value !== control.missingCapability), paused: control.paused });
    if (url.pathname === '/v1/targets') return Response.json({ targets: control.available ? [{ id: 'local', status: 'available' }, { id: 'gateway-home', status: 'available' }, { id: 'BAD:SECRET', label: 'PRIVATE_TARGET_LABEL' }] : [] });
    if (url.pathname === '/v1/models' && !control.failModels) return Response.json({ models: [{ id: 'cli-model', displayName: 'CLI Model', inputModalities: ['text', 'image'], supportedReasoningEfforts: [{ reasoningEffort: 'low' }], isDefault: true, private: 'PRIVATE_CATALOG_KEY' }] });
    return Response.json({}, { status: 503 });
  }));
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals(); configureAppExtension(null); if (lockDescriptor) Object.defineProperty(navigator, 'locks', lockDescriptor); else Reflect.deleteProperty(navigator, 'locks');
  state.currentProfile = original.profile; state.currentThreadId = original.thread; state.importedData = original.data; state.chatHistory = original.history;
});
it('lists redacted saved connections and reads a different catalog without changing route, health data or the active CLI cache', async () => {
  cacheAgentModelCatalog([{ id: 'old-owner-model' }], 'codex');
  const before = readAssistantSelection(), history = structuredClone(state.chatHistory), data = structuredClone(state.importedData);
  const inventory = await readAssistantConnections(); const catalog = await readConnectionModelCatalog('direct:venice');
  const cli = await readConnectionModelCatalog('cli:hermes:gateway-home');
  expect(inventory.connections.find(row => row.id === 'direct:venice')).toMatchObject({ configured: true, selected: false });
  expect(catalog.models.map(model => model.id)).toEqual(['venice-target']); expect(cli.models.map(model => model.id)).toEqual(['cli-model']);
  expect(JSON.stringify({ inventory, catalog, cli })).not.toMatch(/PRIVATE_|Bearer|leaseId|apiKey|endpoint/);
  expect(readAssistantSelection()).toEqual(before); expect(state.importedData).toEqual(data); expect(state.chatHistory).toEqual(history);
  expect(getCachedAgentModelCatalog('codex')[0]!.id).toBe('old-owner-model'); expect(getCachedAgentModelCatalog('hermes', 'gateway-home')).toEqual([]);
  expect(control.attempts).toEqual([]); expect(vi.mocked(fetch).mock.calls.every(([, options]) => !options?.body)).toBe(true);
});
it('reviews, applies and undoes a configured direct provider using native model sidecars and unchanged history', async () => {
  const data = structuredClone(state.importedData), history = structuredClone(state.chatHistory);
  const snapshot = await captureAssistantConnection(patch.connectionId);
  expect(previewAssistantConnection(snapshot.leaseId, patch)).toMatchObject({ provider: 'venice', model: 'venice-target', effort: 'high' });
  expect(readAssistantSelection().provider).toBe('custom');
  const receipt = await commitAssistantConnection(snapshot.leaseId, patch, { requireLocks: true });
  expect(readAssistantSelection()).toEqual(receipt.after); expect(localStorage.getItem('labcharts-venice-model-regular')).toBe('venice-target');
  await commitAssistantConnection(receipt.leaseId, { connectionId: 'direct:custom', model: 'model-a', effort: '' });
  expect(readAssistantSelection()).toEqual(receipt.before); expect(state.importedData).toEqual(data); expect(state.chatHistory).toEqual(history);
});
it.each(['custom', 'ollama', 'openrouter', 'ppq', 'routstr', 'venice'])('uses the native %s selection service without changing keys, endpoints or privacy mode', async provider => {
  const id = provider === 'venice' ? 'venice-target' : provider === 'custom' ? 'model-a' : 'provider-target';
  updateKeyCache(`labcharts-${provider}-key`, 'PRIVATE_CONFIGURED_KEY');
  if (provider === 'ollama') {
    updateKeyCache('labcharts-ollama', JSON.stringify({ url: 'http://localhost:11434', apiKey: '', model: id }));
    cacheLocalAiModelDetails([{ name: id }], true);
  }
  if (provider === 'routstr') {
    const node = 'https://node-fixture.example/v1'; localStorage.setItem('labcharts-routstr-node', node);
    updateKeyCache('labcharts-routstr-sessions', JSON.stringify({ version: 1, sessions: { [node]: { key: 'sk-synthetic-route-test', updatedAt: 1 } } }));
  }
  if (!['venice', 'custom', 'ollama'].includes(provider)) localStorage.setItem(`labcharts-${provider}-models`, JSON.stringify([{ id, name: 'Provider target' }]));
  const connectionId = `direct:${provider}`, before = readAssistantSelection(), snapshot = await captureAssistantConnection(connectionId);
  const receipt = await commitAssistantConnection(snapshot.leaseId, { connectionId, model: id, effort: '' });
  expect(readAssistantSelection()).toMatchObject({ backend: 'direct', provider, model: id });
  await commitAssistantConnection(receipt.leaseId, { connectionId: 'direct:custom', model: before.model, effort: before.effort });
  expect(readAssistantSelection()).toEqual(before);
});
it.each(['cli:hermes:local', 'cli:hermes:gateway-home'])('switches to %s without adopting discovery credentials and restores the prior direct recipient', async connectionId => {
  await saveAgentChatSettings({ agent: 'codex', target: 'local', model: 'old-model', effort: '' });
  const snapshot = await captureAssistantConnection(connectionId), receipt = await commitAssistantConnection(snapshot.leaseId, { connectionId, model: 'cli-model', effort: 'low' });
  expect(readAssistantSelection()).toMatchObject({ backend: 'cli', provider: 'hermes', model: 'cli-model', effort: 'low' });
  expect(getCachedAgentModelCatalog('hermes', connectionId.split(':')[2])).toHaveLength(1);
  expect(control.attempts[0]).toEqual([connectionId.endsWith(':local') ? 'codex-agent' : 'personal-agent-gateway', { kind: 'connection-selection', modelId: 'cli-model', agentId: 'hermes' }]);
  await commitAssistantConnection(receipt.leaseId, { connectionId: 'direct:custom', model: 'model-a', effort: '' }); expect(readAssistantSelection().provider).toBe('custom');
});
it('preserves agent-target model preferences and supports Undo between two CLI owners with the same model name', async () => {
  cacheAgentModelCatalog([{ id: 'cli-model', inputModalities: ['text', 'image'], supportedReasoningEfforts: [{ reasoningEffort: 'low' }] }], 'codex');
  await saveAgentChatSettings({ agent: 'codex', target: 'local', model: 'cli-model', effort: 'low' }); setChatBackend('codex');
  const snapshot = await captureAssistantConnection('cli:hermes:local'), receipt = await commitAssistantConnection(snapshot.leaseId, { connectionId: 'cli:hermes:local', model: 'cli-model', effort: '' });
  expect(getSavedAgentSelection('codex', 'local')).toEqual({ model: 'cli-model', effort: 'low' });
  await commitAssistantConnection(receipt.leaseId, { connectionId: 'cli:codex:local', model: 'cli-model', effort: 'low' }); expect(readAssistantSelection()).toEqual(receipt.before);
});
it.each(['profile', 'thread', 'current-provider', 'current-key', 'target-key', 'target-endpoint', 'photos', 'catalog', 'lock-owner'])('rejects changed %s ownership after review without changing the route', async boundary => {
  const snapshot = await captureAssistantConnection(patch.connectionId); let current = true;
  if (boundary === 'profile') state.currentProfile = 'other'; if (boundary === 'thread') state.currentThreadId = 'other';
  if (boundary === 'current-provider') setAIProvider('openrouter'); if (boundary === 'current-key') updateKeyCache('labcharts-custom-key', 'CHANGED');
  if (boundary === 'target-key') updateKeyCache('labcharts-venice-key', 'CHANGED');
  if (boundary === 'target-endpoint') setVeniceE2EE(true);
  if (boundary === 'photos') vi.mocked(hasPendingAttachments).mockReturnValue(true);
  if (boundary === 'catalog') localStorage.setItem('labcharts-venice-models', '[]');
  if (boundary === 'lock-owner') installLocks().mockImplementationOnce(async (_name, _options, run) => { current = false; return run(); });
  await expect(commitAssistantConnection(snapshot.leaseId, patch, { canCommit: () => current })).rejects.toMatchObject({ noChangeApplied: true });
  expect(readAssistantSelection().provider).toBe(boundary === 'current-provider' ? 'openrouter' : 'custom');
});
it.each(['decline', 'paused', 'missing-target', 'old-contract', 'models-unavailable'])('leaves the original route intact on %s', async reason => {
  const connectionId = 'cli:hermes:local', snapshot = await captureAssistantConnection(connectionId), before = readAssistantSelection();
  if (reason === 'decline') control.accepted = false; if (reason === 'paused') control.paused = true;
  if (reason === 'missing-target') control.available = false; if (reason === 'old-contract') control.version = 1; if (reason === 'models-unavailable') control.failModels = true;
  await expect(commitAssistantConnection(snapshot.leaseId, { connectionId, model: 'cli-model' })).rejects.toMatchObject({ noChangeApplied: true }); expect(readAssistantSelection()).toEqual(before);
});
it('rejects unconfigured, arbitrary, unavailable or capability-incompatible selections before activation', async () => {
  await expect(captureAssistantConnection('direct:openrouter')).rejects.toMatchObject({ noChangeApplied: true });
  await expect(captureAssistantConnection('https://unknown.invalid')).rejects.toMatchObject({ noChangeApplied: true });
  const snapshot = await captureAssistantConnection(patch.connectionId);
  expect(() => previewAssistantConnection(snapshot.leaseId, { ...patch, model: 'unlisted' })).toThrow();
  expect(() => previewAssistantConnection(snapshot.leaseId, { ...patch, effort: 'impossible' })).toThrow(); expect(control.attempts).toEqual([]);
});
it.each(['model', 'effort', 'provider', 'backend'])('compensates an interrupted %s write and preserves credentials, unrelated settings and health data', async failure => {
  const snapshot = await captureAssistantConnection(patch.connectionId), before = readAssistantSelection(), data = structuredClone(state.importedData), set = Storage.prototype.setItem;
  localStorage.setItem('unrelated', 'retained');
  const key = ({ model: 'labcharts-venice-model', effort: 'labcharts-chat-reasoning-effort-v1:venice:venice-target', provider: 'labcharts-ai-provider', backend: 'labcharts-chat-backend' })[failure];
  let failed = false;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, item, value) { if (!failed && item === key) { failed = true; throw new DOMException('Synthetic full storage', 'QuotaExceededError'); } return set.call(this, item, value); });
  await expect(commitAssistantConnection(snapshot.leaseId, patch)).rejects.toMatchObject({ noChangeApplied: true });
  expect(readAssistantSelection()).toEqual(before); expect(state.importedData).toEqual(data); expect(localStorage.getItem('unrelated')).toBe('retained');
});
it('bounds every public capability array and keeps exact IDs, not truncated selectable IDs', async () => {
  localStorage.setItem('labcharts-venice-models', JSON.stringify([{ id: 'venice-target', name: 'Long'.repeat(200), reasoning: { supported_efforts: Array.from({ length: 100 }, (_, i) => `effort${i}`) } }, { id: 'x'.repeat(301) }]));
  const catalog = await readConnectionModelCatalog('direct:venice'); expect(catalog.models).toHaveLength(1);
  expect(catalog.models[0]!.name.length).toBeLessThanOrEqual(300); expect(catalog.models[0]!.reasoningChoices.length).toBeLessThanOrEqual(20);
});
it('rechecks the private destination after native approval and rejects a changed credential', async () => {
  const module = await import('../js/cloud-ai-consent.js'), snapshot = await captureAssistantConnection(patch.connectionId);
  vi.mocked(module.requestAIProcessingApproval).mockImplementationOnce(async () => { updateKeyCache('labcharts-venice-key', 'CHANGED_AFTER_REVIEW'); return true; });
  await expect(commitAssistantConnection(snapshot.leaseId, patch)).rejects.toMatchObject({ noChangeApplied: true }); expect(readAssistantSelection().provider).toBe('custom');
});
it('retains a previously saved target effort when the requested model is already that target’s saved choice', async () => {
  localStorage.setItem('labcharts-agent-host-model:hermes', 'cli-model'); localStorage.setItem('labcharts-agent-host-effort:hermes', 'low');
  const connectionId = 'cli:hermes:local', snapshot = await captureAssistantConnection(connectionId);
  expect(previewAssistantConnection(snapshot.leaseId, { connectionId, model: 'cli-model' }).effort).toBe('low');
  const receipt = await commitAssistantConnection(snapshot.leaseId, { connectionId, model: 'cli-model' }); expect(receipt.after.effort).toBe('low');
});
it('expires a Local AI review if its native execution mode changes at the same endpoint', async () => {
  const connectionId = 'direct:ollama'; updateKeyCache('labcharts-ollama', JSON.stringify({ url: 'http://localhost:11434', apiKey: '', model: 'local-model', mode: 'ollama' }));
  cacheLocalAiModelDetails([{ name: 'local-model' }], true); const snapshot = await captureAssistantConnection(connectionId);
  updateKeyCache('labcharts-ollama', JSON.stringify({ url: 'http://localhost:11434', apiKey: '', model: 'local-model', mode: 'openai' }));
  await expect(commitAssistantConnection(snapshot.leaseId, { connectionId, model: 'local-model' })).rejects.toMatchObject({ noChangeApplied: true });
  expect(readAssistantSelection().provider).toBe('custom');
});
it('retains an unknown outcome if compensation itself cannot finish, instead of claiming nothing changed', async () => {
  const snapshot = await captureAssistantConnection(patch.connectionId), set = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === 'labcharts-ai-provider') throw new DOMException('Storage unavailable', 'QuotaExceededError');
    return set.call(this, key, value);
  });
  await expect(commitAssistantConnection(snapshot.leaseId, patch)).rejects.toThrow('could not be fully confirmed');
});
it('serializes competing route changes and rejects the stale second lease', async () => {
  const first = await captureAssistantConnection(patch.connectionId), second = await captureAssistantConnection(patch.connectionId);
  const results = await Promise.allSettled([commitAssistantConnection(first.leaseId, patch), commitAssistantConnection(second.leaseId, patch)]);
  expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']); expect(readAssistantSelection().provider).toBe('venice');
});
it.each([401, 403, 404, 429, 500])('rejects native metadata HTTP %s without publishing the target provider or changing saved model choices', async metadataStatus => {
  const snapshot = await captureAssistantConnection(patch.connectionId), before = readAssistantSelection(); control.metadataStatus = metadataStatus;
  const stored = localStorage.getItem('labcharts-venice-models');
  await expect(commitAssistantConnection(snapshot.leaseId, patch)).rejects.toMatchObject({ noChangeApplied: true });
  expect(readAssistantSelection()).toEqual(before); expect(localStorage.getItem('labcharts-venice-models')).toBe(stored);
});
it('rejects a stale saved catalog if the live model is gone and leaves existing profile/context data intact', async () => {
  const snapshot = await captureAssistantConnection(patch.connectionId), before = readAssistantSelection(), data = structuredClone(state.importedData); control.metadataMissing = true;
  await expect(commitAssistantConnection(snapshot.leaseId, patch)).rejects.toMatchObject({ noChangeApplied: true }); expect(readAssistantSelection()).toEqual(before); expect(state.importedData).toEqual(data);
});
it('recognizes a configured edition connection without exposing its owner or pretending a missing native key means missing setup', async () => {
  updateKeyCache('labcharts-venice-key', ''); configureAppExtension({ id: 'PRIVATE_EDITION_OWNER', ai: { isProviderActive: provider => provider === 'venice', isCredentialOwned: provider => provider === 'venice' } });
  const inventory = await readAssistantConnections(), catalog = await readConnectionModelCatalog('direct:venice');
  expect(inventory.connections.find(connection => connection.id === 'direct:venice')).toMatchObject({ configured: true, availability: 'edition-managed; use native connection controls' });
  expect(catalog.models.map(model => model.id)).toEqual(['venice-target']); expect(JSON.stringify({ inventory, catalog })).not.toContain('PRIVATE_');
  await expect(captureAssistantConnection('direct:venice')).rejects.toThrow('native AI settings');
});
it('rejects replacing an edition owner even with the same ID and equivalent native key strings', async () => {
  configureAppExtension({ id: 'policy-fixture' }); const snapshot = await captureAssistantConnection(patch.connectionId);
  configureAppExtension({ id: 'policy-fixture' });
  await expect(commitAssistantConnection(snapshot.leaseId, patch)).rejects.toMatchObject({ noChangeApplied: true }); expect(readAssistantSelection().provider).toBe('custom');
});
it('rechecks an enforced model allowlist instead of accepting a model left in an older native cache', async () => {
  configureAppExtension({ id: 'policy-fixture', ai: { getModelPolicy: ({ provider }) => provider === 'venice' ? { enforced: true, allowlist: [] } : null } });
  const snapshot = await captureAssistantConnection(patch.connectionId); expect(snapshot.catalog.models).toEqual([]);
  expect(() => previewAssistantConnection(snapshot.leaseId, patch)).toThrow('advertised'); expect(readAssistantSelection().provider).toBe('custom');
});
it.each(['chat-stream', 'dynamic-tools', 'structured-health-tools', 'application-context', 'image-upload'])('does not publish a CLI route missing the sender’s required %s capability', async capability => {
  const connectionId = 'cli:hermes:local', snapshot = await captureAssistantConnection(connectionId); control.missingCapability = capability;
  if (capability === 'image-upload') vi.mocked(hasPendingAttachments).mockReturnValue(true);
  await expect(commitAssistantConnection(snapshot.leaseId, { connectionId, model: 'cli-model', effort: '' })).rejects.toMatchObject({ noChangeApplied: true }); expect(readAssistantSelection().provider).toBe('custom');
});
it('rechecks image transport if photos are attached after metadata preflight while the route command waits for its lock', async () => {
  const connectionId = 'cli:hermes:local', snapshot = await captureAssistantConnection(connectionId); control.missingCapability = 'image-upload';
  installLocks().mockImplementationOnce(async (_name, _options, run) => { vi.mocked(hasPendingAttachments).mockReturnValue(true); return run(); });
  await expect(commitAssistantConnection(snapshot.leaseId, { connectionId, model: 'cli-model', effort: '' })).rejects.toMatchObject({ noChangeApplied: true }); expect(readAssistantSelection().provider).toBe('custom');
});
it.each(['venice', 'ppq', 'routstr'] as const)('preserves the configured %s encryption mode during preflight, Apply and Undo', async provider => {
  const id = provider === 'venice' ? 'e2ee-private-target' : provider === 'ppq' ? 'private/ppq-target' : 'tinfoil-private-target';
  if (provider === 'venice') { setVeniceModel(id); setVeniceE2EE(true); }
  if (provider === 'ppq') { updateKeyCache('labcharts-ppq-key', 'PRIVATE_PPQ_KEY'); setPpqModel(id); setPpqPrivateMode(true); }
  if (provider === 'routstr') {
    const node = 'https://node-fixture.example'; localStorage.setItem('labcharts-routstr-node', node); setRoutstrModel(id);
    updateKeyCache('labcharts-routstr-sessions', JSON.stringify({ version: 1, sessions: { [node]: { key: 'sk-synthetic-private-route', updatedAt: 1 } } }));
  }
  localStorage.setItem(provider === 'venice' ? 'labcharts-venice-e2ee-models' : `labcharts-${provider}-private-models`, JSON.stringify([{ id, name: 'Private model' }]));
  const mode = () => provider === 'venice' ? getVeniceE2EE() : provider === 'ppq' ? getPpqPrivateMode() : isRoutstrPrivateModeActive();
  expect(mode()).toBe(true); const data = structuredClone(state.importedData), connectionId = `direct:${provider}`, snapshot = await captureAssistantConnection(connectionId);
  const receipt = await commitAssistantConnection(snapshot.leaseId, { connectionId, model: id, effort: '' }); expect(mode()).toBe(true);
  await commitAssistantConnection(receipt.leaseId, { connectionId: 'direct:custom', model: 'model-a', effort: '' }); expect(mode()).toBe(true); expect(state.importedData).toEqual(data);
});
