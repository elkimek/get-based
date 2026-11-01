import { expect, test } from './coverage-fixture.js';
import type { AppControlRecord } from '../../shared/agent-control-contract.js';

test('retired review execution stays inert for open editors, stale values and replayed claims', async ({ page }) => {
  await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.currentThreadId = 'control-safety'; state.chatThreads = [{ id: 'control-safety', name: 'Control safety', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 0 }];
    const display = await import('/js/display-preferences.js'); await display.commitDisplayPreferences({ unitSystem: 'EU' });
    await (await import('/js/nutrition-store.js')).reconcileNutritionMealsFromProfileData(state.currentProfile);
    const { createAppControlSession } = await import('/js/app-control-session.js');
    const prepare = () => {
      const session = createAppControlSession('Use US units from now on.', () => true, new AbortController().signal);
      let denied = 0;
      for (const attempt of [() => session.tools.readAppState({action: 'display.preferences'}), () => session.tools.prepareAppControl({action: 'display.preferences', snapshotId: 'retired', parameters: '{"unitSystem":"US"}', reason: 'Old preference', evidence: 'Use US units from now on.'})]) {
        try {attempt();} catch (error) {if (String(error).includes('native settings')) denied++; else throw error;}
      }
      if (denied !== 2 || session.finish().length) throw new Error('Retired management preparation was not denied');
      return {version: 1, id: crypto.randomUUID(), profileId: state.currentProfile, threadId: state.currentThreadId!, action: 'display.preferences',
        parameters: {unitSystem: 'US'}, baseline: {unitSystem: display.readDisplayPreferences().unitSystem}, status: 'pending', reason: 'Historical preference', evidence: 'Use US units from now on.'} satisfies AppControlRecord;
    };
    const { handleChatAppControl } = await import('/js/chat-app-controls.js');
    const record = prepare(); state.chatHistory = [{ role: 'assistant', content: 'Review', appControls: [record] }];
    const data = JSON.stringify(state.importedData), editor = document.createElement('div'); editor.dataset.modalFocusTrap = ''; document.body.append(editor);
    await handleChatAppControl(0, record.id, 'apply', () => {});
    const editorBlocked = record.status === 'pending' && display.readDisplayPreferences().unitSystem === 'EU'; editor.remove();
    await display.commitDisplayPreferences({ unitSystem: 'ANZ' }); await handleChatAppControl(0, record.id, 'apply', () => {});
    const staleBlocked = record.status === 'pending' && display.readDisplayPreferences().unitSystem === 'ANZ';
    const fresh = prepare(); state.chatHistory[0]!.appControls = [fresh]; await handleChatAppControl(0, fresh.id, 'apply', () => {});
    const nativeOnly = fresh.status === 'pending' && display.readDisplayPreferences().unitSystem === 'ANZ';
    await display.commitDisplayPreferences({ unitSystem: 'EU' });
    fresh.status = 'pending'; fresh.baseline.unitSystem = 'EU';
    await handleChatAppControl(0, fresh.id, 'apply', () => {});
    return { editorBlocked, staleBlocked, nativeOnly, replayBlocked: fresh.status === 'pending' && display.readDisplayPreferences().unitSystem === 'EU', dataPreserved: JSON.stringify(state.importedData) === data };
  });
  expect(result).toEqual({ editorBlocked: true, staleBlocked: true, nativeOnly: true, replayBlocked: true, dataPreserved: true });
});

test('two tabs share native preference locks and reject an older reviewed baseline', async ({ page, context }) => {
  await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
  const profileId = await page.evaluate(async () => {
    const { state } = await import('/js/state.js'); await (await import('/js/display-preferences.js')).commitDisplayPreferences({ unitSystem: 'EU' }); return state.currentProfile;
  });
  const second = await context.newPage(); await second.goto('/app'); await second.locator('html[data-app-ready]').waitFor();
  expect(await second.evaluate(async () => (await import('/js/state.js')).state.currentProfile)).toBe(profileId);
  // Both tabs observed EU. The second cannot overwrite the first tab's newly saved choice.
  const before = await second.evaluate(async () => (await import('/js/display-preferences.js')).readDisplayPreferences());
  await page.evaluate(async () => { await (await import('/js/display-preferences.js')).commitDisplayPreferences({ unitSystem: 'US' }, { expected: { unitSystem: 'EU' }, requireLocks: true }); });
  const conflict = await second.evaluate(async before => {
    const owner = await import('/js/display-preferences.js');
    try { await owner.commitDisplayPreferences({ unitSystem: 'ANZ' }, { expected: { unitSystem: before.unitSystem }, requireLocks: true }); return false; }
    catch (error) { return error instanceof owner.DisplayPreferenceConflict && owner.readDisplayPreferences().unitSystem === 'US'; }
  }, before);
  expect(conflict).toBe(true); await second.close();
});

test('reload of a historical blocked Apply restores an inactive review and never replays the command', async ({ page }) => {
  await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
  const key = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const threads = await import('/js/chat-threads.js'); threads.createNewThread({ sync: false });
    if (!await threads.saveChatThreadIndex()) throw new Error('Could not save synthetic thread');
    await (await import('/js/display-preferences.js')).commitDisplayPreferences({ unitSystem: 'EU' });
    const record = {version: 1, id: 'historical-applying', profileId: state.currentProfile, threadId: state.currentThreadId!, action: 'display.preferences',
      parameters: {unitSystem: 'US'}, baseline: {unitSystem: 'EU'}, status: 'applying', reason: 'Historical preference', evidence: 'Use US units from now on.'} satisfies AppControlRecord;
    state.chatHistory = [{ role: 'assistant', content: 'Review', appControls: [record] }];
    await (await import('/js/crypto.js')).encryptedSetItem(threads.getChatThreadKey(state.currentThreadId), JSON.stringify(state.chatHistory));
    let acquired!: () => void;
    const ready = new Promise<void>(resolve => { acquired = resolve; });
    void navigator.locks.request('getbased-display-preferences:browser', async () => { acquired(); await new Promise<void>(() => {}); });
    await ready;
    await (await import('/js/chat-app-controls.js')).handleChatAppControl(0, record.id, 'apply', () => {});
    return { storageKey: threads.getChatThreadKey(state.currentThreadId), threadId: state.currentThreadId };
  });
  await expect.poll(() => page.evaluate(async key => {
    const stored = await (await import('/js/crypto.js')).encryptedGetItem(key.storageKey);
    return stored ? JSON.parse(stored)[0]?.appControls?.[0]?.status : null;
  }, key)).toBe('applying');
  expect(await page.evaluate(async () => (await import('/js/display-preferences.js')).readDisplayPreferences().unitSystem)).toBe('EU');
  await page.reload();
  const restored = await page.evaluate(async key => {
    const { state } = await import('/js/state.js'); state.currentThreadId = key.threadId;
    await (await import('/js/chat-history.js')).loadChatHistory();
    return { status: state.chatHistory[0]?.appControls?.[0]?.status, units: (await import('/js/display-preferences.js')).readDisplayPreferences().unitSystem };
  }, key);
  expect(restored).toEqual({ status: 'failed', units: 'EU' });
});
