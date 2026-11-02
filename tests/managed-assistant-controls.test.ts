// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const gate = vi.hoisted(() => ({ approved: true }));
vi.mock('../js/cloud-ai-consent.js', () => ({ requestAIProcessingApproval: vi.fn(async () => gate.approved) }));
vi.mock('../js/chat-images.js', () => ({ hasPendingAttachments: () => false }));
vi.mock('../js/chat-runtime.js', async original => ({ ...await original<typeof import('../js/chat-runtime.js')>(), updateChatHeaderModelRuntime: vi.fn(), refreshChatWebSearchToggleRuntime: vi.fn() }));
import { configureAppExtension } from '../js/app-extension-runtime.js';
import { captureManagedConnection } from '../js/app-extension-connection-control.js';
import { captureAssistantConnection, commitAssistantConnection, readAssistantConnections } from '../js/assistant-connections.js';
import { captureAssistantSelection, commitAssistantSelection, readAssistantSelection } from '../js/assistant-selection.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { setAIProvider, setCustomApiModel, setOpenRouterModel, saveCustomApiConnection } from '../js/api.js';
import { configureApiProviderStorageRuntimeDeps } from '../js/api-provider-storage-runtime.js';
import { setChatBackend } from '../js/agent-chat-settings.js';
import { setDirectChatReasoningEffort } from '../js/chat-model-preferences.js';
import { state } from '../js/state.js';
const initial = { profile: state.currentProfile, thread: state.currentThreadId, history: state.chatHistory, data: state.importedData };
const lockDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
let account = 'PRIVATE_ACCOUNT', allowed = ['managed-a', 'managed-b'];
const check = vi.fn(async (_options: { model: string; signal: AbortSignal }) => true);
function edition() {
  configureAppExtension({ id: 'PRIVATE_EDITION', ai: {
    isProviderActive: provider => provider === 'openrouter', isCredentialOwned: provider => provider === 'openrouter',
    getModelPolicy: ({ provider }) => provider === 'openrouter' ? { enforced: true, allowlist: allowed } : null,
    captureConnectionControls: provider => {
      if (provider !== 'openrouter') return null; const captured = account;
      return { isCurrent: () => captured === account, check };
    },
  } });
}
beforeEach(async () => {
  localStorage.clear(); vi.clearAllMocks(); gate.approved = true; account = 'PRIVATE_ACCOUNT'; allowed = ['managed-a', 'managed-b']; check.mockReset().mockResolvedValue(true); configureAppExtension(null);
  state.currentProfile = 'managed-fixture'; state.currentThreadId = 'managed-thread'; state.chatHistory = []; state.importedData = structuredClone(initial.data); state.importedData.contextNotes = 'PRIVATE_HEALTH_CONTEXT';
  configureApiProviderStorageRuntimeDeps({ encryptedSetItem: async () => {} }); await saveCustomApiConnection('https://native-source.example/v1', 'PRIVATE_NATIVE_KEY');
  setAIProvider('custom'); setCustomApiModel('source-model'); setOpenRouterModel('managed-a'); setChatBackend('direct');
  for (const [provider, ids] of [['custom', ['source-model']], ['openrouter', ['managed-a', 'managed-b']]] as const) localStorage.setItem(`labcharts-${provider}-models`, JSON.stringify(ids.map(id => ({ id, name: id, reasoning: { supported_efforts: ['low', 'high'] } }))));
  const queues = new Map<string, Promise<unknown>>(); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (key: string, _options: unknown, run: () => unknown) => { const work = (queues.get(key) || Promise.resolve()).then(run); queues.set(key, work.catch(() => {})); return work; } } });
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [{ id: 'source-model' }] }))); edition();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); configureAppExtension(null); if (lockDescriptor) Object.defineProperty(navigator, 'locks', lockDescriptor); else Reflect.deleteProperty(navigator, 'locks'); state.currentProfile = initial.profile; state.currentThreadId = initial.thread; state.chatHistory = initial.history; state.importedData = initial.data; });
it('keeps assistant.connection in native UI without exposing saved data or invoking its owner', async () => {
  const before = structuredClone(state.importedData), settings = Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]);
  const native = vi.fn(() => ({ secret: 'PRIVATE_NATIVE_DATA' }));
  const tools = createAgentToolRuntime({ readContext: () => '', listAppActions: native, readAppState: native, prepareAppControl: native, navigate: native });
  for (const tool of ['getbased_app_actions','getbased_read_app','getbased_request_app']) {
    const result = await tools.execute({ tool, arguments: { action: 'assistant.connection', snapshotId: 'previous', parameters: '{}', evidence: 'Requested', reason: 'Requested' } });
    expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toContain('PRIVATE_');
  }
  expect(native).not.toHaveBeenCalled(); expect(tools.getDrafts()).toEqual([]); expect(tools.getOutcome().reviews).toEqual([]);
  expect(state.importedData).toEqual(before); expect(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])).toEqual(settings);
});
it('applies and undoes a managed route with native validation and consent, preserving all health data and hidden credentials', async () => {
  const profile = structuredClone(state.importedData), snapshot = await captureAssistantConnection('direct:openrouter');
  const receipt = await commitAssistantConnection(snapshot.leaseId, { connectionId: 'direct:openrouter', model: 'managed-b', effort: 'high' }, { requireLocks: true });
  expect(readAssistantSelection()).toMatchObject({ provider: 'openrouter', model: 'managed-b', effort: 'high' }); expect(check).toHaveBeenCalledOnce(); expect(Object.keys(check.mock.calls[0]![0]).sort()).toEqual(['model', 'signal']); expect(fetch).not.toHaveBeenCalled();
  await commitAssistantConnection(receipt.leaseId, { connectionId: 'direct:custom', model: 'source-model', effort: '' }); expect(readAssistantSelection()).toEqual(receipt.before); expect(state.importedData).toEqual(profile);
});
it('switches the managed model through the same native model owner and permits guarded Undo', async () => {
  setAIProvider('openrouter'); const before = readAssistantSelection(), lease = captureAssistantSelection({ reviewed: true });
  const receipt = await commitAssistantSelection(lease.leaseId, { model: 'managed-b', effort: 'low' }, { requireLocks: true });
  expect(readAssistantSelection()).toMatchObject({ model: 'managed-b', effort: 'low' });
  await commitAssistantSelection(receipt.leaseId, { model: before.model, effort: before.effort }, { requireLocks: true }); expect(readAssistantSelection()).toEqual(before); expect(check).toHaveBeenCalledTimes(2);
});
it.each(['account', 'owner', 'policy', 'decline', 'check-fails'])('rejects %s change without publishing the managed recipient', async boundary => {
  const snapshot = await captureAssistantConnection('direct:openrouter');
  if (boundary === 'account') account = 'PRIVATE_NEW_ACCOUNT'; if (boundary === 'owner') edition(); if (boundary === 'policy') allowed = ['managed-a']; if (boundary === 'decline') gate.approved = false; if (boundary === 'check-fails') check.mockResolvedValueOnce(false);
  await expect(commitAssistantConnection(snapshot.leaseId, { connectionId: 'direct:openrouter', model: 'managed-b' })).rejects.toMatchObject({ noChangeApplied: true }); expect(readAssistantSelection().provider).toBe('custom');
});
it('rejects a hidden account change during validation and preserves the original route', async () => {
  const snapshot = await captureAssistantConnection('direct:openrouter'); check.mockImplementationOnce(async () => { account = 'PRIVATE_NEW_ACCOUNT'; return true; });
  await expect(commitAssistantConnection(snapshot.leaseId, { connectionId: 'direct:openrouter', model: 'managed-b' })).rejects.toMatchObject({ noChangeApplied: true }); expect(readAssistantSelection().provider).toBe('custom');
});
it('binds the exact reviewed effort across an asynchronous managed validation', async () => {
  setAIProvider('openrouter'); setDirectChatReasoningEffort('openrouter', 'managed-b', 'low'); const lease = captureAssistantSelection({ reviewed: true });
  let release!: (value: boolean) => void; check.mockImplementationOnce(() => new Promise<boolean>(resolve => { release = resolve; }));
  const pending = commitAssistantSelection(lease.leaseId, { model: 'managed-b' }, { requireLocks: true }); const rejected = expect(pending).rejects.toMatchObject({ noChangeApplied: true });
  await vi.waitFor(() => expect(check).toHaveBeenCalledOnce()); setDirectChatReasoningEffort('openrouter', 'managed-b', 'high'); release(true); await rejected; expect(readAssistantSelection().model).toBe('managed-a');
});
it('aborts the managed transport when its native account retires', async () => {
  const binding = captureManagedConnection('openrouter')!; let signal: AbortSignal | undefined;
  check.mockImplementationOnce(async options => { signal = options.signal; return new Promise<boolean>((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('PRIVATE_TRANSPORT_ERROR')), { once: true })); });
  const pending = binding.check('managed-b'), rejected = expect(pending).rejects.toMatchObject({ noChangeApplied: true }); await vi.waitFor(() => expect(signal).toBeDefined()); account = 'PRIVATE_NEW_ACCOUNT'; await rejected; expect(signal!.aborted).toBe(true);
});
it('reports managed control availability without exposing the private capability', async () => {
  const result = await readAssistantConnections(); expect(result.connections.find(item => item.id === 'direct:openrouter')?.availability).toBe('configured edition; native review validation required'); expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|isCurrent|check\(/);
});
it('cancels the actual managed transport on a readiness deadline without leaking its error', async () => {
  const binding = captureManagedConnection('openrouter')!; let signal: AbortSignal | undefined;
  check.mockImplementationOnce(async options => { signal = options.signal; return new Promise<boolean>((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('PRIVATE_TRANSPORT_ERROR')), { once: true })); });
  await expect(binding.check('managed-b', { timeoutMs: 10 })).rejects.toMatchObject({ noChangeApplied: true }); expect(signal!.aborted).toBe(true); expect(readAssistantSelection().provider).toBe('custom');
});
it('does not start a managed probe for an already cancelled human action', async () => {
  const binding = captureManagedConnection('openrouter')!, controller = new AbortController(); controller.abort();
  await expect(binding.check('managed-b', { signal: controller.signal })).rejects.toMatchObject({ noChangeApplied: true }); expect(check).not.toHaveBeenCalled();
});
it('fails closed when the native ownership predicate throws', async () => {
  const binding = captureManagedConnection('openrouter')!;
  await expect(binding.check('managed-b', { isCurrent: () => { throw new Error('PRIVATE_OWNER_ERROR'); } })).rejects.toMatchObject({ noChangeApplied: true }); expect(check).not.toHaveBeenCalled();
});
