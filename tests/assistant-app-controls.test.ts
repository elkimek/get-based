// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ proof: new Map<string, string>(), claims: new Set<string>() }));
vi.mock('../js/crypto.js', async original => ({ ...await original<typeof import('../js/crypto.js')>(),
  encryptedGetItem: async (key: string) => fixture.proof.get(key) ?? null,
  encryptedSetItem: async (key: string, value: string) => { fixture.proof.set(key, value); },
}));
vi.mock('../js/agent-draft-claims.js', () => ({ claimAgentDraft: async (profile: string, id: string) => { const key = `${profile}/${id}`; if (fixture.claims.has(key)) throw new Error('Already attempted'); fixture.claims.add(key); } }));
vi.mock('../js/chat-images.js', () => ({ hasPendingAttachments: () => false }));
vi.mock('../js/chat-runtime.js', async original => ({ ...await original<typeof import('../js/chat-runtime.js')>(), updateChatHeaderModelRuntime: vi.fn() }));
import { createAppControlSession } from '../js/app-control-session.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { executeAppControl } from '../js/app-control-commands.js';
import { normalizeAppControls } from '../shared/agent-control-contract.js';
import { readAssistantSelection } from '../js/assistant-selection.js';
import { state } from '../js/state.js';
import { setAIProvider, setCustomApiModel } from '../js/api.js';
import { setChatBackend } from '../js/agent-chat-settings.js';
const original = { profile: state.currentProfile, thread: state.currentThreadId, history: state.chatHistory, data: state.importedData };
const lockDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
const message = 'Use model-b with high reasoning effort for future replies.';
beforeEach(() => {
  localStorage.clear(); fixture.proof.clear(); fixture.claims.clear(); state.currentProfile = 'selection-review'; state.currentThreadId = 'selection-review-thread'; state.chatHistory = []; state.importedData = structuredClone(original.data);
  state.importedData.contextNotes = 'PRIVATE_HEALTH_NOTE_NOT_APP_METADATA'; state.importedData.notes = [{ date: '2026-10-27', text: 'Preserved private note' }];
  setChatBackend('direct'); setAIProvider('custom'); setCustomApiModel('model-a'); localStorage.setItem('labcharts-custom-url', 'https://PRIVATE_ENDPOINT.invalid/v1');
  localStorage.setItem('labcharts-custom-models', JSON.stringify(['model-a', 'model-b'].map(id => ({ id, name: id, apiKey: 'PRIVATE_CATALOG_FIELD', reasoning: { supported_efforts: ['low', 'high'] } }))));
  const queues = new Map<string, Promise<unknown>>(); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (key: string, _options: unknown, run: () => unknown) => { const next = (queues.get(key) || Promise.resolve()).then(run); queues.set(key, next.catch(() => {})); return next; } } });
});
afterEach(() => { vi.restoreAllMocks(); if (lockDescriptor) Object.defineProperty(navigator, 'locks', lockDescriptor); else Reflect.deleteProperty(navigator, 'locks'); state.currentProfile = original.profile; state.currentThreadId = original.thread; state.chatHistory = original.history; state.importedData = original.data; });
async function prepare() {
  const session = createAppControlSession(message, () => true, new AbortController().signal);
  const runtime = createAgentToolRuntime({ readContext: () => '', userMessage: message, ...session.tools });
  const read = await runtime.execute({ tool: 'getbased_read_app', arguments: { action: 'assistant.selection' } });
  expect(read.success).toBe(true); expect(read.contentItems[0].text).not.toMatch(/PRIVATE_ENDPOINT|PRIVATE_CATALOG_FIELD|PRIVATE_HEALTH_NOTE_NOT_APP_METADATA|leaseId/);
  const snapshot = JSON.parse(read.contentItems[0].text) as { snapshotId: string };
  const result = await runtime.execute({ tool: 'getbased_request_app', arguments: { action: 'assistant.selection', snapshotId: snapshot.snapshotId, parameters: '{"model":"model-b","effort":"high"}', reason: 'Explicit assistant preference', evidence: message } });
  expect(result.success).toBe(true); expect(result.contentItems[0].text).toContain('pending_user_approval');
  const record = session.finish()[0]!; if (record.action !== 'assistant.selection') throw new Error('Wrong control action');
  return record;
}
it('prepares exact reviewed effects without saving or altering message provenance, then applies through the native owner', async () => {
  state.chatHistory = [{ role: 'assistant', content: 'Existing reply', provider: 'custom', modelId: 'model-a', modelDisplay: 'Model A' }];
  const history = structuredClone(state.chatHistory), data = structuredClone(state.importedData), record = await prepare();
  expect(readAssistantSelection()).toMatchObject({ model: 'model-a', effort: '' }); expect(fixture.claims.size).toBe(0);
  expect(record.proposed).toMatchObject({ model: 'model-b', effort: 'high' });
  const receipt = await executeAppControl(record, false, () => true); expect(receipt.undoAvailable).toBe(true);
  expect(readAssistantSelection()).toMatchObject({ model: 'model-b', effort: 'high' }); expect(state.chatHistory).toEqual(history); expect(state.importedData).toEqual(data);
});
it('restores the original model/effort from a private receipt and refuses duplicate Apply or Undo', async () => {
  const record = await prepare(); await executeAppControl(record, false, () => true);
  await expect(executeAppControl(record, false, () => true)).rejects.toThrow();
  record.status = 'changed'; await executeAppControl(record, true, () => true);
  expect(readAssistantSelection()).toMatchObject({ model: 'model-a', effort: '' });
  await expect(executeAppControl(record, true, () => true)).rejects.toThrow('Already attempted');
});
it.each(['model', 'connection', 'baseline', 'effects', 'owner'])('refuses an altered %s boundary without overwriting a newer choice', async boundary => {
  const record = await prepare();
  if (boundary === 'model') setCustomApiModel('model-b');
  if (boundary === 'connection') localStorage.setItem('labcharts-custom-url', 'https://new-recipient.invalid/v1');
  if (boundary === 'baseline') record.baseline.model = 'made-up-model';
  if (boundary === 'effects') record.proposed.effort = 'low';
  await expect(executeAppControl(record, false, () => boundary !== 'owner')).rejects.toThrow();
  expect(localStorage.getItem('labcharts-custom-model')).toBe(boundary === 'model' ? 'model-b' : 'model-a');
});
it('makes restored pending connection reviews inactive and removes stale Undo authority after reload', async () => {
  const record = await prepare(); expect(normalizeAppControls([record])[0]?.status).toBe('expired');
  expect(normalizeAppControls([record], true)[0]?.status).toBe('pending');
  const restored = normalizeAppControls([record])[0]!; await expect(executeAppControl(restored, false, () => true)).rejects.toThrow('no longer actionable');
  record.status = 'changed'; record.undoAvailable = true; expect(normalizeAppControls([record])[0]?.undoAvailable).toBe(false);
});
it('rejects a copied or forged execution receipt and an intervening native selection on Undo', async () => {
  const record = await prepare(); record.status = 'changed'; await expect(executeAppControl(record, true, () => true)).rejects.toThrow('receipt');
  record.status = 'pending'; await executeAppControl(record, false, () => true); record.status = 'changed';
  setCustomApiModel('model-a'); await expect(executeAppControl(record, true, () => true)).rejects.toMatchObject({ noChangeApplied: true });
  expect(readAssistantSelection().model).toBe('model-a');
});
