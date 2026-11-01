// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { checkDirectAssistantConnection } from '../js/assistant-connection-readiness.js';
import { configureAppExtension } from '../js/app-extension-runtime.js';
import { updateKeyCache } from '../js/crypto-key-cache.js';
import { setAIProvider, setCustomApiModel } from '../js/api.js';
import { state } from '../js/state.js';
import type { AssistantSelection } from '../shared/agent-control-contract.js';
const selection = (provider: string): AssistantSelection => ({ backend: 'direct', provider, target: '', model: 'exact-model', effort: '' });
const data = state.importedData;
beforeEach(() => {
  localStorage.clear(); configureAppExtension(null); state.importedData = structuredClone(data); state.importedData.contextNotes = 'PRIVATE_HEALTH_CONTEXT';
  for (const provider of ['custom', 'openrouter', 'venice', 'ppq']) updateKeyCache(`labcharts-${provider}-key`, 'PRIVATE_SAVED_KEY');
  updateKeyCache('labcharts-ollama', JSON.stringify({ url: 'http://127.0.0.1:11434', model: 'exact-model', mode: 'ollama', apiKey: '' }));
  localStorage.setItem('labcharts-custom-url', 'https://custom-fixture.example/v1'); localStorage.setItem('labcharts-routstr-node', 'https://node-fixture.example');
  setAIProvider('custom'); setCustomApiModel('source-model');
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [{ id: 'exact-model' }], models: [{ name: 'exact-model' }] })));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); configureAppExtension(null); state.importedData = data; });
it.each([
  ['custom', 'https://custom-fixture.example/v1/models', true], ['openrouter', 'https://openrouter.ai/api/v1/models', true],
  ['venice', 'https://api.venice.ai/api/v1/models', true], ['ppq', 'https://api.ppq.ai/v1/models?type=chat', true],
  ['routstr', 'https://node-fixture.example/v1/models', false], ['ollama', 'http://127.0.0.1:11434/api/tags', false],
] as const)('checks %s through a fixed metadata GET only and preserves all data and settings', async (provider, url, auth) => {
  const stored = { ...localStorage }, profile = structuredClone(state.importedData), set = vi.spyOn(Storage.prototype, 'setItem');
  const result = await checkDirectAssistantConnection(selection(provider), { isCurrent: () => true });
  expect(result).toMatchObject({ modelListed: true, inferenceTested: false, authentication: auth ? 'not-rejected' : 'not-tested' });
  expect(fetch).toHaveBeenCalledTimes(1); expect(vi.mocked(fetch).mock.calls[0]![0]).toBe(url);
  const request = vi.mocked(fetch).mock.calls[0]![1]!; expect(request).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error' }); expect(request.body).toBeUndefined();
  expect(request.headers).toEqual(auth ? { Authorization: 'Bearer PRIVATE_SAVED_KEY' } : {});
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|fixture|url|key|Bearer|context/); expect(set).not.toHaveBeenCalled(); expect({ ...localStorage }).toEqual(stored); expect(state.importedData).toEqual(profile);
});
it('uses the native compatible Local AI path for non-Ollama modes without probing unrelated servers', async () => {
  updateKeyCache('labcharts-ollama', JSON.stringify({ url: 'http://127.0.0.1:1234', model: 'exact-model', mode: 'lmstudio', apiKey: 'PRIVATE_SAVED_KEY' }));
  await checkDirectAssistantConnection(selection('ollama'), { isCurrent: () => true }); expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('http://127.0.0.1:1234/v1/models');
});
it('preserves the native same-origin Custom API metadata fallback and never probes a completion endpoint', async () => {
  localStorage.setItem('labcharts-custom-url', 'https://custom-fixture.example/api/v1');
  vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 404 })).mockResolvedValueOnce(Response.json({ data: [{ id: 'exact-model' }] }));
  await checkDirectAssistantConnection(selection('custom'), { isCurrent: () => true });
  expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(['https://custom-fixture.example/api/v1/models', 'https://custom-fixture.example/v1/models']);
});
it.each([401, 403, 404, 429, 500])('sanitizes HTTP %s failures rather than exposing provider error text', async status => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response('PRIVATE_ERROR_KEY_AND_ENDPOINT', { status }));
  await expect(checkDirectAssistantConnection(selection('venice'), { isCurrent: () => true })).rejects.toMatchObject({ noChangeApplied: true });
  await expect(checkDirectAssistantConnection(selection('venice'), { isCurrent: () => false })).rejects.not.toThrow('PRIVATE_');
});
it.each([{ data: [] }, { data: [{ id: 'another-model' }] }, { data: [{ id: 'exact-model', enabled: false }] }, { data: [{ id: 'exact-model', type: 'embedding' }] }, { data: [{ id: 'exact-model', capabilities: { chat: false } }] }, { wrong: [] }])('rejects missing or unavailable model metadata %j', async value => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json(value));
  await expect(checkDirectAssistantConnection(selection('custom'), { isCurrent: () => true })).rejects.toMatchObject({ noChangeApplied: true });
});
it('bounds both declared and streaming metadata size and sanitizes malformed data', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response('PRIVATE_BODY', { headers: { 'content-length': '9000000' } }));
  await expect(checkDirectAssistantConnection(selection('custom'), { isCurrent: () => true })).rejects.toThrow('oversized');
  vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array(8_000_001)));
  await expect(checkDirectAssistantConnection(selection('custom'), { isCurrent: () => true })).rejects.toThrow('oversized');
  vi.mocked(fetch).mockResolvedValueOnce(new Response('PRIVATE_MALFORMED_JSON'));
  await expect(checkDirectAssistantConnection(selection('custom'), { isCurrent: () => true })).rejects.not.toThrow('PRIVATE_MALFORMED_JSON');
});
function stalledRequest() {
  let started!: () => void; const ready = new Promise<void>(resolve => { started = resolve; });
  vi.mocked(fetch).mockImplementationOnce(async (_url, options) => { started(); return new Promise<Response>((_resolve, reject) => { options!.signal!.addEventListener('abort', () => reject(new DOMException('PRIVATE_ABORT_DETAIL', 'AbortError')), { once: true }); }); });
  return ready;
}
it.each(['abort', 'owner', 'timeout'] as const)('cancels the actual metadata transport on %s and never publishes a route', async reason => {
  const ready = stalledRequest(), controller = new AbortController(); let owner = true;
  const work = checkDirectAssistantConnection(selection('custom'), { signal: controller.signal, isCurrent: () => owner, timeoutMs: reason === 'timeout' ? 20 : 1000 });
  const rejected = expect(work).rejects.toMatchObject({ noChangeApplied: true }); await ready;
  if (reason === 'abort') controller.abort(); if (reason === 'owner') owner = false; await rejected;
  expect(vi.mocked(fetch).mock.calls[0]![1]!.signal!.aborted).toBe(true); expect(localStorage.getItem('labcharts-custom-model')).toBe('source-model');
});
it('keeps edition-managed credentials in their native owner instead of attempting a stock key or billing probe', async () => {
  configureAppExtension({ id: 'managed-fixture', ai: { isProviderActive: () => true, isCredentialOwned: () => true } });
  await expect(checkDirectAssistantConnection(selection('openrouter'), { isCurrent: () => true })).rejects.toThrow('native connection controls'); expect(fetch).not.toHaveBeenCalled();
});
it('respects an edition ZDR catalog policy without changing the selected model or approving processing', async () => {
  configureAppExtension({ id: 'policy-fixture', ai: { getModelPolicy: () => ({ enforced: true, allowlist: ['exact-model'], zdrOnly: true }) } });
  await checkDirectAssistantConnection(selection('openrouter'), { isCurrent: () => true }); expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('https://openrouter.ai/api/v1/models?zdr=true'); expect(localStorage.getItem('labcharts-ai-provider')).toBe('custom');
});
