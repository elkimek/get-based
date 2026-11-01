import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
const cases = ['rename', 'prompt', 'quota', 'foreignIndex', 'preference', 'newDraft', 'streaming', 'frozen'] as const;
for (const mode of cases) test(`manual selected persona edit: ${mode} preserves publication ownership`, async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await context.route('https://**/*', route => route.abort());
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?metadata-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  let opened = false, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), targetId = 'custom_metadata', acceptedName = mode === 'prompt' ? 'Original reviewer' : 'Reviewed <b>persona</b>', addition = 'Use concise, warm responses.';
  await page.route('https://persona-metadata-provider.example/v1/chat/completions', async route => {
    opened = true; await gate;
    await route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ choices: [{ delta: { content: 'Retained synthetic greeting.' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n' });
  });
  await page.addInitScript(() => { for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); (window as unknown as { __WEARABLES_TEST: boolean }).__WEARABLES_TEST = true; }); await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
  const before = await page.evaluate(async () => {
    const profile = await import('/js/profile.js'), id = await profile.createProfile('Synthetic selected metadata', { sex: 'female', skipInitialSync: true });
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed'); localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1'); await profile.switchProfile(id);
    // Seed the explicit conversation outside deferred empty-dashboard onboarding.
    (await import('/js/views.js')).navigate('labs');
    const api = await import('/js/api.js'); await api.saveCustomApiConnection('https://persona-metadata-provider.example/v1', 'synthetic-metadata-key'); api.setCustomApiModel('synthetic-metadata-model'); api.setAIProvider('custom'); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct');
    const { state } = await import('/js/state.js'), crypto = await import('/js/crypto.js'), storage = await import('/js/chat-personality-storage.js'); await crypto._setTestSessionKey('synthetic selected metadata'); localStorage.setItem('labcharts-encryption-enabled', 'true');
    state.importedData.contextNotes = 'PRIVATE_RETAINED_HEALTH'; if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Synthetic health seed failed'); await (await import('/js/nutrition-store.js')).reconcileNutritionMealsFromProfileData(id); await (await import('/js/chat-loader.js')).openChatPanel();
    const threads = await import('/js/chat-threads.js'); if (!await threads.saveChatThreadIndex()) throw new Error('Synthetic index seed failed'); state.chatHistory = [{ role: 'assistant', content: 'Retained answer', personalityName: 'Original attribution', provider: 'original-provider', modelId: 'original-model' }]; if (!await (await import('/js/chat-history.js')).saveChatHistory()) throw new Error('Synthetic message seed failed');
    const target = { id: 'custom_metadata', name: 'Original reviewer', icon: 'R', promptText: 'PRIVATE_ORIGINAL_PROMPT', opaque: { keep: true } }, other = { id: 'custom_retained', name: 'Retained reviewer', icon: 'O', promptText: 'PRIVATE_OTHER_PROMPT' }, key = storage.customPersonalityStorageKey(id), deleted = storage.customPersonalityTombstoneStorageKey(id); await crypto.encryptedSetItem(key, JSON.stringify([target, other]));
    const selection = await import('/js/chat-personality-selection.js'), selected = await selection.capturePersonaSelection(target.id); await selection.commitPersonaSelection(selected.leaseId, { canCommit: () => true });
    return { profile: id, key, deleted, target, other, threadId: state.currentThreadId!, indexKey: threads.getChatThreadsKey(), bodyKey: threads.getChatThreadKey(state.currentThreadId), prefKey: `labcharts-${id}-chatPersonality`, first: state.chatHistory[0]!, health: await crypto.encryptedGetItem(profile.profileStorageKey(id, 'imported')) };
  });
  if (mode === 'streaming') {
    await page.locator('#chat-input').fill('Give me a brief greeting.'); await page.locator('#chat-send-btn').click(); await expect.poll(() => opened).toBe(true);
  }
  await page.locator('.chat-personality-current').click();
  await page.locator('.chat-personality-edit[data-chat-personality-id="custom_metadata"]').click();
  await expect(page.locator('#chat-personality-editor-overlay')).toBeVisible();
  await page.evaluate(async id => { await (await import('/js/chat-personality-storage.js')).captureCustomPersonalityEdit(id); }, targetId);
  await page.locator('#chat-personality-custom-name').fill(acceptedName);
  await page.locator('#chat-personality-custom-prompt').fill(`${before.target.promptText}\n\n${addition}`);
  await expect(page.locator('#chat-personality-custom-name')).toHaveValue(acceptedName);
  await expect(page.locator('#chat-personality-custom-prompt')).toHaveValue(`${before.target.promptText}\n\n${addition}`);
  if (mode === 'foreignIndex') await page.evaluate(async before => { const crypto = await import('/js/crypto.js'); const rows = JSON.parse((await crypto.encryptedGetItem(before.indexKey))!); rows[0].name = 'Foreign newer title'; await crypto.encryptedSetItem(before.indexKey, JSON.stringify(rows)); }, before);
  if (mode === 'frozen') await page.evaluate(async () => { const { state } = await import('/js/state.js'); Object.freeze(state.chatThreads.find(row => row.id === state.currentThreadId)); });
  const stable = await page.evaluate(async before => { const crypto = await import('/js/crypto.js'), { state } = await import('/js/state.js'); return { index: localStorage.getItem(before.indexKey), rows: JSON.parse((await crypto.encryptedGetItem(before.indexKey))!) as Array<Record<string, unknown>>, body: localStorage.getItem(before.bodyKey), history: structuredClone(state.chatHistory), preference: localStorage.getItem(before.prefKey), deleted: localStorage.getItem(before.deleted) }; }, before);
  if (mode === 'quota' || mode === 'preference') await page.evaluate(({ before, mode }) => { const set = Storage.prototype.setItem; let first = true; Storage.prototype.setItem = function (key, value) { if (key === before.indexKey && first) { first = false; if (mode === 'quota') throw new DOMException('Synthetic metadata quota', 'QuotaExceededError'); set.call(this, key, value); set.call(this, before.prefKey, 'foreign-preference'); return; } return set.call(this, key, value); }; }, { before, mode });
  if (mode === 'newDraft') {
    const lock = `getbased-chat-index-${before.profile}`, held = page.evaluate(async lock => navigator.locks.request(lock, async () => { const fixture = window as unknown as { metadataLockReady: boolean; releaseMetadataLock: () => void }; fixture.metadataLockReady = true; await new Promise<void>(resolve => { fixture.releaseMetadataLock = resolve; }); }), lock); void held.catch(() => {});
    try {
      await expect.poll(() => page.evaluate(() => (window as unknown as { metadataLockReady?: boolean }).metadataLockReady === true)).toBe(true); await page.locator('.chat-personality-custom-save').click();
      await expect.poll(() => page.evaluate(async lock => (await navigator.locks.query()).pending?.filter(row => row.name === lock).length, lock)).toBe(1);
      await page.locator('#chat-personality-custom-name').fill('Newer unsaved name'); await page.locator('#chat-personality-custom-prompt').fill('Keep my newer unsaved instructions.');
      await page.evaluate(async () => (await import('/js/chat-personality-editing.js')).saveCustomPersonality());
      await page.evaluate(() => (window as unknown as { releaseMetadataLock: () => void }).releaseMetadataLock()); await held;
    } finally { await page.evaluate(() => (window as unknown as { releaseMetadataLock?: () => void }).releaseMetadataLock?.()); await held.catch(() => {}); }
  } else await page.locator('.chat-personality-custom-save').click();
  const unconfirmed = ['quota', 'foreignIndex', 'preference', 'streaming'].includes(mode);
  await expect(page.locator('#notification-container')).toContainText(unconfirmed ? 'Persona saved. The conversation label update was not confirmed.' : mode === 'frozen' ? 'Persona and conversation label saved.' : 'Custom personality saved');
  if (mode === 'newDraft') { await expect(page.locator('#chat-personality-custom-name')).toHaveValue('Newer unsaved name'); await expect(page.locator('#chat-personality-custom-prompt')).toHaveValue('Keep my newer unsaved instructions.'); await expect(page.locator('.chat-personality-custom-save')).toBeEnabled(); }
  else await expect(page.locator('#chat-personality-editor-overlay')).toHaveCount(0);
  if (mode === 'streaming') { release(); await expect.poll(() => page.evaluate(() => import('/js/chat-send.js').then(owner => owner.isChatStreaming()))).toBe(false); }
  const after = await page.evaluate(async before => { const crypto = await import('/js/crypto.js'), { state } = await import('/js/state.js'); return { records: JSON.parse((await crypto.encryptedGetItem(before.key))!) as Array<Record<string, unknown>>, rows: JSON.parse((await crypto.encryptedGetItem(before.indexKey))!) as Array<Record<string, unknown>>, index: localStorage.getItem(before.indexKey), body: localStorage.getItem(before.bodyKey), history: structuredClone(state.chatHistory), preference: localStorage.getItem(before.prefKey), deleted: localStorage.getItem(before.deleted), health: await crypto.encryptedGetItem((await import('/js/profile.js')).profileStorageKey(before.profile, 'imported')) }; }, before);
  expect(after.records[0]).toEqual({ ...before.target, name: acceptedName, promptText: `${before.target.promptText}\n\n${addition}`, updatedAt: after.records[0]!.updatedAt }); expect(after.records[1]).toEqual(before.other); expect(after.preference).toBe(mode === 'preference' ? 'foreign-preference' : stable.preference); expect(after.deleted).toBe(stable.deleted); expect(after.health).toBe(before.health); expect(after.history[0]).toEqual(before.first);
  if (mode === 'streaming') { expect(after.history.slice(0, stable.history.length)).toEqual(stable.history); expect(after.history.at(-1)!.personalityName).toBe(before.target.name); expect(after.rows.find(row => row.id === before.threadId)).toMatchObject({ personality: before.target.id, personalityName: before.target.name, personalityIcon: before.target.icon, personalityUpdatedAt: stable.rows.find(row => row.id === before.threadId)!.personalityUpdatedAt }); }
  else { expect(after.body).toBe(stable.body); expect(after.history).toEqual(stable.history); }
  if (unconfirmed && mode !== 'streaming' || mode === 'prompt') expect(after.index).toBe(stable.index);
  else if (mode !== 'streaming') expect(after.rows).toEqual(stable.rows.map(row => row.id === before.threadId ? { ...row, personalityName: acceptedName, personalityIcon: before.target.icon, personalityUpdatedAt: after.rows.find(item => item.id === row.id)!.personalityUpdatedAt, updatedAt: after.rows.find(item => item.id === row.id)!.updatedAt } : row));
  if (mode === 'quota') {
    const picker = page.locator('.chat-personality-current'); if (await picker.getAttribute('aria-expanded') !== 'true') await picker.click(); const option = page.locator(`.chat-personality-opt[data-personality="${before.target.id}"]`); await expect(option).toBeVisible(); await option.click();
    await expect.poll(() => page.evaluate(async before => JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem(before.indexKey))!).find((row: { id: string }) => row.id === before.threadId).personalityName, before)).toBe(acceptedName);
    expect(await page.evaluate(() => import('/js/chat-personality-selection.js').then(owner => owner.listPersonaSelectionUndoChoices()))).toEqual([]); expect(await page.evaluate(key => localStorage.getItem(key), before.bodyKey)).toBe(stable.body);
  }
  await expect(page.locator('.chat-personality-current b')).toHaveCount(0); expect(errors).toEqual([]);
});
