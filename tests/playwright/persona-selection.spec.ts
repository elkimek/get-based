import { expect, test } from './coverage-fixture.js';
import { seedDashboardControlProfile, dashboardHealth } from '../helpers/dashboard-control-fixture.js';
for (const mode of ['select', 'undo', 'quota', 'contention', 'foreign', 'streaming', 'sync'] as const) test(`native persona selection: ${mode} preserves encrypted conversations`, async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await context.route('https://**/*', route => route.abort()); await page.addInitScript(() => { (window as unknown as { __WEARABLES_TEST: boolean }).__WEARABLES_TEST = true; });
  await seedDashboardControlProfile(page);
  const before = await page.evaluate(async () => {
    const crypto = await import('/js/crypto.js'); await crypto._setTestSessionKey('synthetic persona picker'); localStorage.setItem('labcharts-encryption-enabled', 'true');
    await (await import('/js/chat-panel.js')).openChatPanel();
    const { state } = await import('/js/state.js'), threads = await import('/js/chat-threads.js');
    if (!await threads.saveChatThreadIndex()) throw new Error('Synthetic conversation index was not admitted.');
    state.chatHistory = [{ role: 'user', content: 'Synthetic retained question' }, { role: 'assistant', content: 'Synthetic retained answer', personalityName: 'Original source persona', provider: 'synthetic-provider', modelId: 'synthetic-original-model' }];
    if (!await (await import('/js/chat-history.js')).saveChatHistory()) throw new Error('Synthetic conversation could not be saved.');
    const index = threads.getChatThreadsKey(), pref = `labcharts-${state.currentProfile}-chatPersonality`, body = threads.getChatThreadKey(state.currentThreadId), choices = (await import('/js/constants.js')).CHAT_PERSONALITIES;
    const next = choices.find(row => row.id !== state.currentChatPersonality)!;
    return { profile: state.currentProfile, thread: state.currentThreadId, selected: state.currentChatPersonality, index, pref, body, rawIndex: localStorage.getItem(index), rawPreference: localStorage.getItem(pref), rawBody: localStorage.getItem(body), history: JSON.stringify(state.chatHistory), records: JSON.parse((await crypto.encryptedGetItem(index))!) as Array<Record<string, unknown>>, next: { id: next.id, name: next.name, icon: next.icon } };
  });
  const health = await dashboardHealth(page);
  let lockPage: import('@playwright/test').Page | null = null;
  if (mode === 'contention') {
    lockPage = await context.newPage(); await lockPage.goto('/app');
    await lockPage.evaluate(async profile => {
      const owner = await import('/js/chat-thread-index-storage.js');
      const fixture = window as unknown as { __indexHeld?: boolean; __releaseIndex?: () => void; __holdingIndex?: Promise<unknown> };
      fixture.__holdingIndex = owner.withChatThreadIndexLock(profile, async () => { fixture.__indexHeld = true; await new Promise<void>(resolve => { fixture.__releaseIndex = resolve; }); });
    }, before.profile);
    await expect.poll(() => lockPage!.evaluate(() => !!(window as unknown as { __indexHeld?: boolean }).__indexHeld)).toBe(true);
  }
  let foreign: string | null = null;
  if (mode === 'foreign') foreign = await page.evaluate(async before => { await (await import('/js/crypto.js')).encryptedSetItem(before.index, JSON.stringify([...before.records, { id: 'synthetic-foreign', name: 'Retained foreign thread', updatedAt: '2099-01-01', messageCount: 0 }])); return localStorage.getItem(before.index); }, before);
  if (mode === 'quota') await page.evaluate(pref => { const set = Storage.prototype.setItem; let fail = true; Storage.prototype.setItem = function (name, value) { if (name === pref && fail) { fail = false; throw new DOMException('Synthetic quota', 'QuotaExceededError'); } return set.call(this, name, value); }; }, before.pref);
  if (mode === 'streaming') await page.evaluate(async () => (await import('/js/chat-runtime.js')).configureChatRuntimeCallbacks({ isChatStreaming: () => true }));
  await page.locator('.chat-personality-current').click(); await page.locator(`.chat-personality-opt[data-personality="${before.next.id}"]`).click();
  if (mode === 'contention') {
    await expect.poll(() => page.evaluate(async profile => (await navigator.locks.query()).pending?.filter(lock => lock.name === `getbased-chat-index-${profile}`).length || 0, before.profile)).toBeGreaterThan(0);
    expect(await page.evaluate(() => import('/js/state.js').then(({ state }) => state.currentChatPersonality))).toBe(before.selected);
    await lockPage!.evaluate(async () => { const fixture = window as unknown as { __releaseIndex: () => void; __holdingIndex: Promise<unknown> }; fixture.__releaseIndex(); await fixture.__holdingIndex; }); await lockPage!.close();
  }
  if (mode === 'quota' || mode === 'foreign' || mode === 'streaming') {
    await expect(page.locator('#notification-container')).toContainText(mode === 'quota' ? 'exact previous stored state' : mode === 'foreign' ? 'Reload the originating conversation' : 'Finish the current reply');
    expect(await page.evaluate(index => localStorage.getItem(index), before.index)).toBe(mode === 'foreign' ? foreign : before.rawIndex);
    expect(await page.evaluate(pref => localStorage.getItem(pref), before.pref)).toBe(before.rawPreference);
    expect(await page.evaluate(() => import('/js/state.js').then(({ state }) => state.currentChatPersonality))).toBe(before.selected);
  } else {
    await expect(page.locator('.chat-personality-current')).toContainText(before.next.name);
    const after = await page.evaluate(async before => { const { state } = await import('/js/state.js'); return { records: JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem(before.index))!) as Array<Record<string, unknown>>, pref: localStorage.getItem(before.pref), encrypted: localStorage.getItem(before.index), selected: state.currentChatPersonality }; }, before);
    expect(after.selected).toBe(before.next.id); expect(after.pref).toBe(before.next.id); expect(after.encrypted).toMatch(/^v1:/);
    const previous = before.records.find(row => row.id === before.thread), updated = after.records.find(row => row.id === before.thread)!;
    expect(updated).toEqual({ ...previous, personality: before.next.id, personalityName: before.next.name, personalityIcon: before.next.icon, updatedAt: updated.updatedAt, personalityUpdatedAt: updated.personalityUpdatedAt });
    expect(after.records.filter(row => row.id !== before.thread)).toEqual(before.records.filter(row => row.id !== before.thread));
    if (mode === 'sync') {
      const merged = await page.evaluate(async before => {
        const crypto = await import('/js/crypto.js'), { state } = await import('/js/state.js');
        const current = state.chatThreads.find(row => row.id === before.thread)!, old = before.records.find(row => row.id === before.thread)!;
        const renamed = { ...old, name: 'Newer remote title', updatedAt: new Date(Date.parse(current.updatedAt) + 1000).toISOString(), opaqueRemote: 'retained' };
        const wire = await (await import('/js/sync-payload-collectors.js')).collectChatData(before.profile); if (!wire) throw new Error('Synthetic wire snapshot could not be read');
        sessionStorage.setItem('labcharts-chat-local-lock-until', String(Date.now() - 1));
        if ((await import('/js/sync-chat-local-state.js')).getChatDataLocalLockRemainingMs(before.profile) !== 0) throw new Error('Synthetic freshness window did not expire');
        const applied = await (await import('/js/sync-chat-apply.js')).applyChatData(before.profile, { threads: [renamed], messages: wire.messages, activePersonality: before.selected });
        const records = JSON.parse((await crypto.encryptedGetItem(before.index))!) as Array<Record<string, unknown>>;
        const threads = await import('/js/chat-threads.js'); if (!await threads.loadChatThreads()) throw new Error('Merged native index could not load'); threads.ensureActiveThread(); (await import('/js/chat-personalities.js')).updatePersonalityBar();
        return { applied, target: records.find(row => row.id === before.thread), persona: state.currentChatPersonality };
      }, before);
      expect(merged.applied).toBe(true); expect(merged.target).toMatchObject({ name: 'Newer remote title', opaqueRemote: 'retained', personality: before.next.id }); expect(merged.persona).toBe(before.next.id); await expect(page.locator('.chat-personality-current')).toContainText(before.next.name);
    }
    if (mode === 'undo') {
      const undone = await page.evaluate(async () => {
        const owner = await import('/js/chat-personality-selection.js'), choice = owner.listPersonaSelectionUndoChoices()[0]; if (!choice) throw new Error('No current native Undo proof');
        const command = await owner.capturePersonaRestoration(choice.id), receipt = await owner.commitPersonaSelection(command.leaseId, { canCommit: () => true });
        const presentation = await import('/js/chat-personalities.js'); presentation.updatePersonalityBar(); presentation.updateChatHeaderTitle(); return receipt;
      }); expect(undone).toMatchObject({ settingsSaved: true, undoId: null });
      await expect.poll(() => page.evaluate(() => import('/js/state.js').then(({ state }) => state.currentChatPersonality))).toBe(before.selected);
      expect(await page.evaluate(pref => localStorage.getItem(pref), before.pref)).toBe(before.rawPreference);
    }
  }
  expect(await page.evaluate(body => localStorage.getItem(body), before.body)).toBe(before.rawBody);
  expect(await page.evaluate(() => import('/js/state.js').then(({ state }) => JSON.stringify(state.chatHistory)))).toBe(before.history);
  expect(await dashboardHealth(page)).toBe(health); expect(errors).toEqual([]);
});
