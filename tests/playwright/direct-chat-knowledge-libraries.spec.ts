import { expect, test } from './knowledge-native-fixture.js';
import type { Page } from '@playwright/test';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import { seedLocalKnowledgeCorpus, knowledgeCorpusReceipt } from '../helpers/knowledge-browser-fixture.js';

type Provider = 'custom' | 'venice';
interface LibraryWindow extends Window { libraryMessages: string[] }
const endpoint = (provider: Provider) => provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://synthetic-library-provider.example/v1/chat/completions';
async function seed(page: Page, provider: Provider) {
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?library-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  await page.addInitScript(() => { for (const suffix of ['tour', 'emptyTour']) localStorage.setItem('labcharts-default-' + suffix, 'completed'); });
  await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
  await page.evaluate(async provider => {
    const profiles = await import('/js/profile.js'), id = await profiles.createProfile('Synthetic library editing', { sex: 'male', skipInitialSync: true });
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profiles.profileStorageKey(id, suffix), 'completed');
    for (const prefix of ['labcharts-onboard-extras-done-', 'labcharts-onboard-context-cards-skipped-']) localStorage.setItem(prefix + id, '1');
    await profiles.switchProfile(id); const api = await import('/js/api.js'); api.setAIPaused(true);
    if (provider === 'venice') { await api.saveVeniceKey('synthetic-key'); api.setVeniceModel('glm-5-fixture'); api.setVeniceE2EE(false); }
    else { await api.saveCustomApiConnection('https://synthetic-library-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('glm-5-fixture'); }
    api.setAIProvider(provider); (await import('/js/agent-chat-settings.js')).setChatBackend('direct');
    const { state } = await import('/js/state.js'); state.importedData.nutritionMeals = [];
    if (!await (await import('/js/data.js')).saveImportedDataForProfile(id, state.importedData, { forceProfileScope: true })) throw new Error('Synthetic profile save failed');
  }, provider);
  const originalId = await seedLocalKnowledgeCorpus(page);
  const secondId = await page.evaluate(async () => {
    const session = await (await import('/js/lens-local-library-session.js')).openLocalLibrarySession();
    try { return (await session.createLibrary('Other Notes', 'bge-base-en')).id; } finally { session.close(); }
  });
  await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('lens-local');
    for (const name of ['_libraries.json', '_libraries.backup.json']) {
      const file = await dir.getFileHandle(name), registry = JSON.parse(await (await file.getFile()).text());
      registry.extension = { keep: 'private-registry-sentinel' };
      const writable = await file.createWritable(); await writable.write(JSON.stringify(registry)); await writable.close();
    }
    const key = 'labcharts-lens-config'; localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)!), opaqueExtension: 'private-config-sentinel' }));
    const Native = window.Worker, messages: string[] = []; (window as unknown as LibraryWindow).libraryMessages = messages;
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options); if (!String(url).includes('lens-local-worker.js')) return;
        const post = this.postMessage.bind(this); this.postMessage = ((message: { type?: string }) => { messages.push(String(message.type)); post(message); }) as Worker['postMessage'];
      }
    };
    (await import('/js/api.js')).setAIPaused(false); await (await import('/js/chat-loader.js')).openChatPanel();
  });
  return { originalId, secondId };
}
for (const provider of ['custom', 'venice'] as const) for (const rewriting of [false, true]) test(`${provider} document questions use the search tool with rewriting ${rewriting}`, async ({ page }) => {
  const { originalId } = await seed(page, provider), before = await knowledgeCorpusReceipt(page, originalId);
  await page.evaluate(async rewriting => {
    (await import('/js/lens.js')).saveLensConfig({ backend: 'external-server', url: 'https://library-search.invalid/query', enabled: true, topK: 3, multiQuery: rewriting });
    (await import('/js/crypto.js')).updateKeyCache('labcharts-lens-key', 'synthetic-search-key');
  }, rewriting);
  let round = 0, rewrites = 0; const searches: { query: string; top_k: number }[] = [];
  await page.route('https://library-search.invalid/query', async route => {
    searches.push(route.request().postDataJSON()); await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 1, chunks: [{ source: 'synthetic-research.txt', text: 'Synthetic source evidence about regular sleep.' }] }) });
  });
  await page.route(endpoint(provider), async route => {
    const body = route.request().postDataJSON();
    if (body.messages.some((message: { role: string; content: unknown }) => message.role === 'system' && String(message.content).startsWith('Rewrite the user'))) {
      rewrites++; await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: 'sleep evidence\nsleep habits\nrest timing' } }] }) }); return;
    }
    const call: AIToolCall = { id: 'search-evidence', type: 'function', function: { name: 'getbased_search_knowledge', arguments: JSON.stringify({ query: 'What do my documents say about sleep?' }) } };
    if (round === 1) {
      const output = JSON.parse(body.messages.at(-1).content); expect(output.success).toBe(true);
      expect(JSON.parse(output.contentItems[0].text).chunks).toEqual([{ source: 'synthetic-research.txt', text: 'Synthetic source evidence about regular sleep.' }]);
    }
    expect(round).toBeLessThan(2);
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: round++ === 0 ? { tool_calls: [{ index: 0, ...call }] } : { content: 'Your source describes regular sleep.' }, finish_reason: round === 1 ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  await page.locator('#chat-input').fill('What do my documents say about sleep?'); await page.locator('#chat-send-btn').click();
  await expect(page.locator('.chat-ai').last()).toContainText('Your source describes regular sleep.');
  expect(round).toBe(2); expect(rewrites).toBe(rewriting ? 1 : 0); expect(searches).toHaveLength(rewriting ? 4 : 1); expect(searches.every(row => row.top_k === 3)).toBe(true);
  const response = await page.evaluate(async () => (await import('/js/state.js')).state.chatHistory.at(-1));
  expect(response?.lensSources).toEqual([expect.objectContaining({ source: 'synthetic-research.txt', text: 'Synthetic source evidence about regular sleep.' })]);
  expect(response?.context).toContainEqual(expect.objectContaining({ label: 'Knowledge Base' }));
  expect((await knowledgeCorpusReceipt(page, originalId)).corpus).toEqual(before.corpus);
});

test('an active-library change before query initialization is rejected before any model download', async ({ page, context }) => {
  const { secondId } = await seed(page, 'custom'); const downloads: string[] = [];
  context.on('request', request => { if (/huggingface|jsdelivr.*transformers|cdn-lfs|xethub|\.onnx(?:\?|$)/i.test(request.url())) downloads.push(request.url()); });
  await page.evaluate(() => {
    const Native = window.Worker;
    window.Worker = class extends Native { constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options); if (!String(url).includes('lens-local-worker.js')) return;
      const post = this.postMessage.bind(this);
      this.postMessage = ((message: { type?: string }) => {
        if (message.type === 'init') Reflect.set(window, 'releaseLibraryQueryInit', () => post(message)); else post(message);
      }) as Worker['postMessage'];
    } };
    Reflect.set(window, 'pendingLibraryQuery', import('/js/lens.js').then(lens => lens.queryLens('Synthetic query', { multiQuery: false })));
  });
  await expect.poll(() => page.evaluate(() => typeof Reflect.get(window, 'releaseLibraryQueryInit'))).toBe('function');
  await page.evaluate(async secondId => {
    const session = await (await import('/js/lens-local-library-session.js')).openLocalLibrarySession();
    try { await session.activateLibrary(secondId); } finally { session.close(); }
    (Reflect.get(window, 'releaseLibraryQueryInit') as () => void)();
  }, secondId);
  expect(await page.evaluate(async () => await Reflect.get(window, 'pendingLibraryQuery'))).toBeNull(); expect(downloads).toEqual([]);
});
