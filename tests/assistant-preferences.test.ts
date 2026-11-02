// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { commitAssistantPreferences, readAssistantPreferences, assistantWebSearchAvailable } from '../js/assistant-preferences.js';
import { setAIProvider, setVeniceE2EE, setVeniceModel, setPpqPrivateMode, setPpqModel } from '../js/api.js';
import { setChatBackend } from '../js/agent-chat-settings.js';
import { configureChatRuntimeCallbacks } from '../js/chat-runtime.js';
import { configureAppExtension } from '../js/app-extension-runtime.js';
import { hasAssistantFeatureProvider } from '../js/ai-feature-routing.js';
import { state } from '../js/state.js';
const initial = { profile: state.currentProfile, thread: state.currentThreadId, data: state.importedData };
const lockDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
function locks() {
  const queues = new Map<string, Promise<unknown>>(); const request = vi.fn((name: string, _options: unknown, run: () => unknown) => { const value = (queues.get(name) || Promise.resolve()).then(run); queues.set(name, value.catch(() => {})); return value; });
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } }); return request;
}
beforeEach(() => {
  localStorage.clear(); configureAppExtension(null); locks(); state.currentProfile = 'preference-fixture'; state.currentThreadId = 'preference-thread'; state.importedData = structuredClone(initial.data);
  state.importedData.contextNotes = 'PRIVATE_RETAINED_HEALTH_NOTE'; state.importedData.notes = [{ date: '2026-10-27', text: 'Retain this note' }];
  setAIProvider('venice'); setVeniceE2EE(false); setVeniceModel('plain-chat-model'); setChatBackend('direct');
});
afterEach(() => { vi.restoreAllMocks(); configureAppExtension(null); if (lockDescriptor) Object.defineProperty(navigator, 'locks', lockDescriptor); else Reflect.deleteProperty(navigator, 'locks'); state.currentProfile = initial.profile; state.currentThreadId = initial.thread; state.importedData = initial.data; });
it('saves scoped browser flags atomically, stops future feature jobs while paused and preserves profile data and approvals', async () => {
  const data = structuredClone(state.importedData); localStorage.setItem('labcharts-cloud-ai-consent', 'RETAINED_APPROVAL');
  const receipt = await commitAssistantPreferences({ paused: true, webSearch: true }, { expected: { paused: false, webSearch: false }, requireLocks: true, idle: true });
  expect(receipt.changed).toEqual(['paused', 'webSearch']); expect(readAssistantPreferences()).toEqual({ paused: true, webSearch: true }); expect(hasAssistantFeatureProvider()).toBe(false);
  await commitAssistantPreferences({ paused: false }, { expected: { paused: true } }); expect(readAssistantPreferences()).toEqual({ paused: false, webSearch: true });
  expect(state.importedData).toEqual(data); expect(localStorage.getItem('labcharts-cloud-ai-consent')).toBe('RETAINED_APPROVAL');
});
it.each(['custom', 'cli', 'venice-private', 'ppq-private', 'edition-policy'])('denies enabling app search for %s but allows disabling its saved flag', async backend => {
  if (backend === 'custom') setAIProvider('custom'); if (backend === 'cli') setChatBackend('codex');
  if (backend === 'venice-private') { setVeniceModel('e2ee-fixture-model'); setVeniceE2EE(true); }
  if (backend === 'ppq-private') { setAIProvider('ppq'); setPpqModel('private/fixture-model'); setPpqPrivateMode(true); }
  if (backend === 'edition-policy') { setAIProvider('openrouter'); configureAppExtension({ id: 'policy-fixture', ai: { getModelPolicy: () => ({ allowWebSearch: false }) } }); }
  expect(assistantWebSearchAvailable()).toBe(false);
  await expect(commitAssistantPreferences({ webSearch: true })).rejects.toMatchObject({ noChangeApplied: true });
  localStorage.setItem('labcharts-chat-websearch', 'on'); await commitAssistantPreferences({ webSearch: false }); expect(readAssistantPreferences().webSearch).toBe(false);
});
it.each([{}, { paused: 'true' }, { webSearch: 1 }, { paused: false, apiKey: 'no' }, [], null])('rejects unsupported preference parameters %j', async patch => {
  await expect(commitAssistantPreferences(patch)).rejects.toMatchObject({ noChangeApplied: true }); expect(readAssistantPreferences()).toEqual({ paused: false, webSearch: false });
});
it.each(['profile', 'thread', 'root', 'owner', 'capability', 'stream'])('rechecks %s after waiting for the native lock', async boundary => {
  let valid = true; let restore: ReturnType<typeof configureChatRuntimeCallbacks> | undefined;
  locks().mockImplementationOnce(async (_name, _options, run) => {
    if (boundary === 'profile') state.currentProfile = 'other'; if (boundary === 'thread') state.currentThreadId = 'other'; if (boundary === 'root') state.importedData = structuredClone(state.importedData);
    if (boundary === 'owner') valid = false; if (boundary === 'capability') setAIProvider('custom'); if (boundary === 'stream') restore = configureChatRuntimeCallbacks({ isChatStreaming: () => true });
    return run();
  });
  try { await expect(commitAssistantPreferences({ webSearch: true }, { requireLocks: true, idle: true, canCommit: () => valid })).rejects.toMatchObject({ noChangeApplied: true }); expect(readAssistantPreferences().webSearch).toBe(false); }
  finally { if (restore) configureChatRuntimeCallbacks(restore); }
});
it('serializes competing updates and does not overwrite a newer explicit value', async () => {
  const results = await Promise.allSettled([commitAssistantPreferences({ paused: true }, { expected: { paused: false } }), commitAssistantPreferences({ paused: false }, { expected: { paused: false } })]);
  expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']); expect(readAssistantPreferences().paused).toBe(true);
});
it('compensates a partial storage failure and never publishes a successful preference event', async () => {
  const set = Storage.prototype.setItem, event = vi.spyOn(globalThis, 'dispatchEvent');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) { if (key === 'labcharts-chat-websearch') throw new Error('Synthetic full storage'); return set.call(this, key, value); });
  await expect(commitAssistantPreferences({ paused: true, webSearch: true })).rejects.toMatchObject({ noChangeApplied: true });
  expect(readAssistantPreferences()).toEqual({ paused: false, webSearch: false }); expect(event.mock.calls.some(([value]) => value.type === 'getbased:assistant-preferences-changed')).toBe(false);
});
it('reports unknown compensation rather than claiming a confirmed unchanged setting', async () => {
  localStorage.setItem('labcharts-ai-paused', 'false'); const set = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) { if (key === 'labcharts-chat-websearch' || key === 'labcharts-ai-paused' && value === 'false') throw new Error('Synthetic unavailable storage'); return set.call(this, key, value); });
  await expect(commitAssistantPreferences({ paused: true, webSearch: true })).rejects.toThrow('could not be fully confirmed'); expect(readAssistantPreferences().paused).toBe(true);
});
it('preserves native fallback in a browser without Web Locks but refuses automated Apply', async () => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  await expect(commitAssistantPreferences({ paused: true }, { requireLocks: true })).rejects.toMatchObject({ noChangeApplied: true });
  await commitAssistantPreferences({ paused: true }); expect(readAssistantPreferences().paused).toBe(true);
});
