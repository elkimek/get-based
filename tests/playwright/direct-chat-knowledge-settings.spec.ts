import { expect, test } from './knowledge-native-fixture.js';
import type { Page } from '@playwright/test';
import { seedLocalKnowledgeCorpus, knowledgeCorpusReceipt } from '../helpers/knowledge-browser-fixture.js';
async function seed(page: Page, provider?: 'custom' | 'venice') {
  await page.addInitScript(() => { for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed'); });
  await page.goto('/app'); await page.evaluate(async provider => {
  await page.locator('html[data-app-ready]').waitFor();
    const profiles = await import('/js/profile.js'), id = await profiles.createProfile('Synthetic Knowledge Base preferences', { sex: 'male', skipInitialSync: true });
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profiles.profileStorageKey(id, suffix), 'completed'); localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1'); await profiles.switchProfile(id);
    const api = await import('/js/api.js'); api.setAIPaused(true); (await import('/js/lens.js')).saveLensConfig({ backend: 'external-server', url: 'https://kb-fixture.invalid/query?token=private-url-sentinel', name: 'Private corpus title', enabled: true, topK: 5, multiQuery: true });
    localStorage.setItem('labcharts-lens-config', JSON.stringify({ ...JSON.parse(localStorage.getItem('labcharts-lens-config')!), opaqueExtension: 'private-config-sentinel' }));
    const { state } = await import('/js/state.js'); state.importedData.nutritionMeals = [];
    const persist = async () => { if (!await (await import('/js/data.js')).saveImportedDataForProfile(id, state.importedData, { forceProfileScope: true })) throw new Error('Synthetic profile baseline failed'); };
    if (!provider) { await persist(); return; }
    if (provider === 'venice') { await api.saveVeniceKey('synthetic-key'); api.setVeniceModel('glm-5-fixture'); api.setVeniceE2EE(false); }
    else { await api.saveCustomApiConnection('https://synthetic-knowledge-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('glm-5-fixture'); }
    api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel(); await persist();
  }, provider);
}
const receipt = (page: Page) => page.evaluate(async () => { const { state } = await import('/js/state.js'); return { config: localStorage.getItem('labcharts-lens-config'), profile: structuredClone(state.importedData), storedProfile: JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')))!) }; });
test('inventory reads genuine native OPFS without constructing a worker or changing corpus bytes', async ({ page }) => {
  const errors: string[] = [], downloads: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (/huggingface|jsdelivr|\.onnx/.test(request.url())) downloads.push(request.url()); }); await seed(page); const libraryId = await seedLocalKnowledgeCorpus(page), before = await knowledgeCorpusReceipt(page, libraryId);
  await page.evaluate(() => { window.Worker = class { constructor() { throw new Error('Inventory must not start a worker'); } } as unknown as typeof Worker; });
  const result = await page.evaluate(async libraryId => {
    const { state } = await import('/js/state.js'), native = (await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile);
    const wrap = (value: unknown) => ({ success: (value as { available?: boolean }).available !== false, contentItems: [{ text: JSON.stringify(value) }] as const });
    const libraries = wrap(await native.readKnowledge({ libraryId: '', query: '', offset: 0, limit: 10 })), documents = wrap(await native.readKnowledge({ libraryId, query: '', offset: 0, limit: 10 })); return { libraries, documents };
  }, libraryId);
  expect(result.libraries.success, result.libraries.contentItems[0].text).toBe(true); expect(result.documents.success, result.documents.contentItems[0].text).toBe(true); const docs = JSON.parse(result.documents.contentItems[0].text); expect(docs.documents.map((row: { source: string }) => row.source).sort()).toEqual(['synthetic-notes.md', 'synthetic-report.txt']); expect(JSON.stringify(result)).not.toMatch(/private-corpus-text-sentinel|vectors/); expect(await knowledgeCorpusReceipt(page, libraryId)).toEqual(before); expect(downloads).toEqual([]); expect(errors).toEqual([]);
});

for (const forcedStale of [false, true]) test(`native preferences serialize across tabs and refuse a queued stale source${forcedStale ? ' with a forced stale peer mirror' : ''}`, async ({ page, context }) => {
  await seed(page); const peer = await context.newPage(); await peer.goto('/app'); await peer.locator('html[data-app-ready]').waitFor(); const before = await receipt(page);
  await page.evaluate(async () => {
    let acquired!: () => void; const ready = new Promise<void>(resolve => { acquired = resolve; });
    Reflect.set(window, 'knowledgeHeldLock', navigator.locks.request('getbased-knowledge-settings', () => new Promise<void>(resolve => { Reflect.set(window, 'releaseKnowledgeLock', resolve); acquired(); })));
    await ready;
  });
  if (forcedStale) await peer.evaluate(() => {
    const key = 'labcharts-lens-config', before = localStorage.getItem(key), read = Storage.prototype.getItem, write = Storage.prototype.setItem, remove = Storage.prototype.removeItem; let stale = true;
    Storage.prototype.getItem = function (name) { return this === localStorage && name === key && stale ? before : read.call(this, name); };
    Storage.prototype.setItem = function (name, value) { if (this === localStorage && name === key) stale = false; write.call(this, name, value); };
    Storage.prototype.removeItem = function (name) { if (this === localStorage && name === key) stale = false; remove.call(this, name); };
    Reflect.set(window, 'restoreKnowledgeStorage', () => { Storage.prototype.getItem = read; Storage.prototype.setItem = write; Storage.prototype.removeItem = remove; });
  });
  for (const [target, patch] of [[page, { topK: 3 }], [peer, { multiQuery: false }]] as const) await target.evaluate(async patch => {
    const lens = await import('/js/lens.js');
    Reflect.set(window, 'knowledgePendingWrite', lens.commitLensConfig(patch).then(() => ({ saved: true, noChangeApplied: false }), error => ({ saved: false, noChangeApplied: error.noChangeApplied === true })));
  }, patch);
  await expect.poll(() => page.evaluate(async () => (await navigator.locks.query()).pending?.filter(row => row.name === 'getbased-knowledge-settings').length)).toBe(2);
  await page.evaluate(() => { (Reflect.get(window, 'releaseKnowledgeLock') as () => void)(); });
  const results = await Promise.all([page, peer].map(target => target.evaluate(async () => await Reflect.get(window, 'knowledgePendingWrite'))));
  if (forcedStale) await peer.evaluate(() => { (Reflect.get(window, 'restoreKnowledgeStorage') as () => void)(); });
  expect(results.filter(row => row.saved)).toHaveLength(1); expect(results.filter(row => row.noChangeApplied)).toHaveLength(1);
  const saved = await receipt(page), actual = JSON.parse(saved.config!); expect(actual).toEqual({ ...JSON.parse(before.config!), ...(results[0].saved ? { topK: 3 } : { multiQuery: false }) });
  expect(await receipt(peer)).toEqual(saved); expect(saved.profile).toEqual(before.profile); expect(saved.storedProfile).toEqual(before.storedProfile); await peer.close();
});
