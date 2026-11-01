// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../js/chat-images.js', () => ({ hasPendingAttachments: vi.fn(() => false) }));
vi.mock('../js/chat-runtime.js', async original => ({ ...await original<typeof import('../js/chat-runtime.js')>(), updateChatHeaderModelRuntime: vi.fn() }));
import { captureAssistantSelection, commitAssistantSelection, previewAssistantSelection, readAssistantSelection } from '../js/assistant-selection.js';
import { setAIProvider, setCustomApiModel, saveCustomApiKey } from '../js/api.js';
import { saveAgentChatSettings, setChatBackend } from '../js/agent-chat-settings.js';
import { cacheAgentModelCatalog } from '../js/agent-model-catalog.js';
import { setDirectChatReasoningEffort } from '../js/chat-model-preferences.js';
import { hasPendingAttachments } from '../js/chat-images.js';
import { state } from '../js/state.js';
import { configureChatRuntimeCallbacks } from '../js/chat-runtime.js';
import { configureApiProviderStorageRuntimeDeps } from '../js/api-provider-storage-runtime.js';
const initial = { profile: state.currentProfile, thread: state.currentThreadId, data: state.importedData };
const lockDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
function installLocks() {
  const queues = new Map<string, Promise<unknown>>();
  const request = vi.fn((name: string, _options: unknown, run: () => unknown) => {
    const result = (queues.get(name) || Promise.resolve()).then(run); queues.set(name, result.catch(() => {})); return result;
  });
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } }); return request;
}
beforeEach(async () => {
  vi.clearAllMocks(); localStorage.clear(); installLocks(); state.currentProfile = 'selection-fixture'; state.currentThreadId = 'selection-thread'; state.importedData = structuredClone(initial.data);
  configureApiProviderStorageRuntimeDeps({ encryptedSetItem: async () => {} }); await saveCustomApiKey('original-synthetic-key');
  state.importedData.contextNotes = 'Synthetic retained private context'; state.importedData.notes = [{ date: '2026-10-27', text: 'Retain this saved note' }];
  setChatBackend('direct'); setAIProvider('custom'); setCustomApiModel('model-a');
  localStorage.setItem('labcharts-custom-models', JSON.stringify(['model-a', 'model-b', 'model-c'].map(id => ({ id, name: id, reasoning: { supported_efforts: ['low', 'high'] } }))));
  vi.mocked(hasPendingAttachments).mockReturnValue(false);
});
afterEach(() => { vi.restoreAllMocks(); if (lockDescriptor) Object.defineProperty(navigator, 'locks', lockDescriptor); else Reflect.deleteProperty(navigator, 'locks'); state.currentProfile = initial.profile; state.currentThreadId = initial.thread; state.importedData = initial.data; });
it('commits through native keys, preserves model-specific efforts and leaves health data intact', async () => {
  const before = structuredClone(state.importedData);
  setDirectChatReasoningEffort('custom', 'model-a', 'high'); setDirectChatReasoningEffort('custom', 'model-b', 'low');
  const snapshot = captureAssistantSelection(); expect(previewAssistantSelection(snapshot.leaseId, { model: 'model-b' }).effort).toBe('low');
  const receipt = await commitAssistantSelection(snapshot.leaseId, { model: 'model-b' }, { requireLocks: true });
  expect(readAssistantSelection()).toMatchObject({ model: 'model-b', effort: 'low' });
  await commitAssistantSelection(receipt.leaseId, { model: receipt.before.model, effort: receipt.before.effort });
  expect(readAssistantSelection()).toMatchObject({ model: 'model-a', effort: 'high' }); expect(state.importedData).toEqual(before);
});
it('uses CLI native per-model effort restoration and does not touch another agent’s preferences', async () => {
  cacheAgentModelCatalog(['model-a', 'model-b'].map(id => ({ id, displayName: id, inputModalities: ['text'], supportedReasoningEfforts: ['low', 'high'].map(reasoningEffort => ({ reasoningEffort, description: '' })) })), 'codex');
  await saveAgentChatSettings({ agent: 'codex', target: 'local', model: 'model-b', effort: 'low' }); await saveAgentChatSettings({ model: 'model-a', effort: 'high' }); setChatBackend('codex');
  localStorage.setItem('labcharts-agent-host-model:hermes', 'other-agent-choice');
  const receipt = await commitAssistantSelection(captureAssistantSelection().leaseId, { model: 'model-b' });
  expect(readAssistantSelection()).toMatchObject({ backend: 'cli', model: 'model-b', effort: 'low' });
  await commitAssistantSelection(receipt.leaseId, { model: 'model-a', effort: 'high' });
  expect(localStorage.getItem('labcharts-agent-host-model:hermes')).toBe('other-agent-choice');
});
it.each(['profile', 'thread', 'provider', 'model', 'effort', 'endpoint', 'credential', 'catalog', 'photos'])('rejects a stale %s boundary after waiting for its lock', async boundary => {
  const lease = captureAssistantSelection(); let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  installLocks().mockImplementationOnce(async (_name, _options, run) => { await held; return run(); });
  const pending = commitAssistantSelection(lease.leaseId, { model: 'model-b' }, { requireLocks: true });
  if (boundary === 'profile') state.currentProfile = 'other'; if (boundary === 'thread') state.currentThreadId = 'other';
  if (boundary === 'provider') setAIProvider('venice'); if (boundary === 'model') setCustomApiModel('model-c');
  if (boundary === 'effort') setDirectChatReasoningEffort('custom', 'model-a', 'high');
  if (boundary === 'endpoint') localStorage.setItem('labcharts-custom-url', 'https://different.example.invalid/v1');
  if (boundary === 'credential') await saveCustomApiKey('new-synthetic-key');
  if (boundary === 'catalog') localStorage.setItem('labcharts-custom-models', '[]'); if (boundary === 'photos') vi.mocked(hasPendingAttachments).mockReturnValue(true);
  release(); await expect(pending).rejects.toMatchObject({ noChangeApplied: true });
  expect(localStorage.getItem('labcharts-custom-model')).toBe(boundary === 'model' ? 'model-c' : 'model-a');
});
it('rejects unknown or unsupported parameters and stale duplicate leases before writing', async () => {
  const first = captureAssistantSelection(), second = captureAssistantSelection();
  for (const patch of [{ effort: 'impossible' }, { model: 'unknown' }, { apiKey: 'never' }, {}]) expect(() => previewAssistantSelection(first.leaseId, patch as never)).toThrow();
  const results = await Promise.allSettled([commitAssistantSelection(first.leaseId, { model: 'model-b' }), commitAssistantSelection(second.leaseId, { model: 'model-c' })]);
  expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']); expect(readAssistantSelection().model).toBe('model-b');
});
it('compensates a later preference write failure without altering unrelated settings or health records', async () => {
  const lease = captureAssistantSelection(), set = Storage.prototype.setItem, data = structuredClone(state.importedData);
  localStorage.setItem('labcharts-custom-unrelated', 'preserve');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) { if (key === 'labcharts-chat-reasoning-effort-v1:custom:model-b') throw new Error('Synthetic quota failure'); return set.call(this, key, value); });
  await expect(commitAssistantSelection(lease.leaseId, { model: 'model-b', effort: 'high' })).rejects.toMatchObject({ noChangeApplied: true });
  expect(readAssistantSelection()).toMatchObject({ model: 'model-a', effort: '' }); expect(localStorage.getItem('labcharts-custom-unrelated')).toBe('preserve'); expect(state.importedData).toEqual(data);
});
it('distinguishes failed compensation from a confirmed unchanged selection', async () => {
  const lease = captureAssistantSelection(), set = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) { if (key.includes('reasoning-effort-v1') || key === 'labcharts-custom-model' && value === 'model-a') throw new Error('Synthetic unavailable storage'); return set.call(this, key, value); });
  await expect(commitAssistantSelection(lease.leaseId, { model: 'model-b', effort: 'high' })).rejects.toThrow('fully confirmed');
  expect(readAssistantSelection().model).toBe('model-b');
});
it('keeps native selection usable without Web Locks while refusing automated changes', async () => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  const lease = captureAssistantSelection(); await expect(commitAssistantSelection(lease.leaseId, { model: 'model-b' }, { requireLocks: true })).rejects.toMatchObject({ noChangeApplied: true });
  await commitAssistantSelection(lease.leaseId, { model: 'model-b' }); expect(readAssistantSelection().model).toBe('model-b');
});
it('does not change a model while a response is still streaming', async () => {
  const previous = configureChatRuntimeCallbacks({ isChatStreaming: () => true });
  try {
    await expect(commitAssistantSelection(captureAssistantSelection().leaseId, { model: 'model-b' })).rejects.toMatchObject({ noChangeApplied: true });
    expect(readAssistantSelection().model).toBe('model-a');
  } finally { configureChatRuntimeCallbacks(previous); }
});
it('excludes explicitly non-chat models instead of sending conversations to an embedding route', async () => {
  localStorage.setItem('labcharts-custom-models', JSON.stringify([{ id: 'model-a', name: 'Chat model' }, { id: 'model-b', name: 'Embedding model', type: 'embedding' }]));
  await expect(commitAssistantSelection(captureAssistantSelection().leaseId, { model: 'model-b' })).rejects.toMatchObject({ noChangeApplied: true });
  expect(readAssistantSelection().model).toBe('model-a');
});
it('refuses an explicitly non-text CLI model before publishing an unusable chat route', async () => {
  cacheAgentModelCatalog([{ id: 'model-a', displayName: 'Chat', inputModalities: ['text'] }, { id: 'model-b', displayName: 'Image only', inputModalities: ['image'] }], 'codex');
  await saveAgentChatSettings({ agent: 'codex', target: 'local', model: 'model-a', effort: '' }); setChatBackend('codex');
  await expect(commitAssistantSelection(captureAssistantSelection().leaseId, { model: 'model-b' })).rejects.toMatchObject({ noChangeApplied: true });
  expect(readAssistantSelection().model).toBe('model-a');
});
